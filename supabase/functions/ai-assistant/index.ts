// supabase/functions/ai-assistant/index.ts
//
// Edge Function: assistente AI in-app di sola lettura. Riceve una domanda in
// linguaggio naturale e risponde usando un loop di tool-use verso il
// provider LLM configurato dall'admin (Gemini / Groq / Anthropic / OpenRouter —
// vedi ai-assistant-config). I tool leggono solo dati (nessuna scrittura) da
// staffing_state e controllo_produzione, e solo quelli richiesti dal
// modello per rispondere alla domanda specifica — non viene mai spedito
// l'intero stato dell'app ad ogni richiesta.
//
// Autenticazione dati applicativi: le letture di staffing_state/
// controllo_produzione passano per un client Supabase che inoltra il JWT
// dell'utente chiamante, quindi rispettano le stesse RLS del browser
// (nessun privilegio elevato sui dati applicativi). Solo la configurazione
// dell'assistente (tabella ai_assistant_settings, RLS admin-only, e le API
// key in Vault, una per provider) viene letta con la service_role key, perché
// deve essere leggibile dalla function per servire qualunque utente non-guest.
//
// Contratto richiesta (POST, JSON):
//   { action: 'status' }
//   { action: 'ask', question, anno, settimana, history? }
//     history: [{ role: 'user'|'assistant', content: string }, ...] (facoltativo, breve)
//
// Contratto risposta (JSON):
//   { enabled: boolean } | { answer: string } | { error }
//
// Versionata nel repo dal v18.187.0 (prima esisteva solo su Supabase).

import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

const MAX_TOOL_ITERATIONS = 5;
const MAX_TOKENS = 4096;
const MAX_HISTORY_MESSAGES = 12;
const MAX_ROWS = 300;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

/* Errore HTTP del provider -> messaggio comprensibile (i piani gratuiti finiscono spesso in 429) */
async function providerError(nome: string, res: Response): Promise<Error> {
  const t = (await res.text().catch(() => "")).slice(0, 300);
  if (res.status === 429) return new Error(`Limite di richieste raggiunto su ${nome} (tipico dei piani gratuiti): riprova tra un minuto o scegli un altro modello nel pannello admin.`);
  if (res.status === 401 || res.status === 403) return new Error(`${nome} ha rifiutato la API key: controllala in Gestione Assistente AI.`);
  if (res.status === 402) return new Error(`${nome}: credito insufficiente per questo modello.`);
  if (/tool|function/i.test(t) && (res.status === 400 || res.status === 404)) return new Error(`Il modello scelto su ${nome} non supporta gli strumenti: scegline un altro nel pannello admin.`);
  return new Error(`${nome} HTTP ${res.status}: ${t}`);
}

/* ===================== Tool definitions (provider-agnostic) ===================== */

const TOOLS = [
  {
    name: "get_operatori",
    description: "Elenco degli operatori del pool: nome, skills, attestati (con scadenza reale), limitazioni/idoneità mediche, DPI assegnati (con scadenza), provincia/regione, tipo e date contratto, stato ex-collega. Usalo per domande su chi ha una skill/attestato/DPI/limitazione, dove risiede, o sullo stato del contratto.",
    parameters: { type: "object", properties: {}, required: [] },
  },
  {
    name: "get_pipeline",
    description: "Pipeline commerciale (progetti in offerta), commesse attive e commesse chiuse/archiviate, con i relativi metadati (cliente, regione, skill/attestati richiesti). Usalo per domande sui progetti/commesse, anche passati.",
    parameters: { type: "object", properties: {}, required: [] },
  },
  {
    name: "get_staffing_mensile",
    description: "Allocazione gg-uomo mensile per commessa (Staffing mensile / saturazione): per ogni risorsa-commessa, i giorni-uomo pianificati nei 12 mesi dell'anno correntemente configurato in Dashboard. Filtri opzionali per risorsa (nome operatore) e/o commessa, ricerca parziale case-insensitive.",
    parameters: {
      type: "object",
      properties: { risorsa: { type: "string" }, commessa: { type: "string" } },
      required: [],
    },
  },
  {
    name: "get_dpi_catalogo",
    description: "Catalogo DPI disponibili e relativa durata di validità in mesi (i DPI assegnati ai singoli operatori sono già inclusi in get_operatori).",
    parameters: { type: "object", properties: {}, required: [] },
  },
  {
    name: "get_registro_esterno",
    description: "Archivio grezzo dell'ultimo import Excel di attestati o limitazioni: copre TUTTI i dipendenti aziendali, anche quelli fuori dal pool operatori rilievi. Usalo solo se la domanda riguarda personale non presente nel pool operatori (per chi è nel pool, get_operatori è la fonte più aggiornata).",
    parameters: {
      type: "object",
      properties: {
        tipo: { type: "string", enum: ["attestati", "limitazioni"] },
        nome: { type: "string" },
      },
      required: ["tipo"],
    },
  },
  {
    name: "get_pianificazione",
    description: "Griglia di pianificazione settimanale (squadre, cantieri assegnati, attività) per uno specifico anno e settimana ISO.",
    parameters: {
      type: "object",
      properties: { anno: { type: "integer" }, settimana: { type: "integer" } },
      required: ["anno", "settimana"],
    },
  },
  {
    name: "get_ferie",
    description: "Ferie/assenze pianificate per anno e settimana.",
    parameters: {
      type: "object",
      properties: { anno: { type: "integer" }, settimana: { type: "integer" } },
      required: ["anno", "settimana"],
    },
  },
  {
    name: "get_doppia_week",
    description: "Assegnazioni 'doppia week' (trasferte di due settimane consecutive) per anno e settimana.",
    parameters: {
      type: "object",
      properties: { anno: { type: "integer" }, settimana: { type: "integer" } },
      required: ["anno", "settimana"],
    },
  },
  {
    name: "get_produzione",
    description: "Dati di produzione giornalieri (ore, km, cantiere, attività) per anno e settimana, opzionalmente filtrati per nome operatore e/o commessa (ricerca parziale case-insensitive).",
    parameters: {
      type: "object",
      properties: {
        anno: { type: "integer" },
        settimana: { type: "integer" },
        operatore: { type: "string" },
        commessa: { type: "string" },
      },
      required: ["anno", "settimana"],
    },
  },
];

function makeToolExecutor(userClient: ReturnType<typeof createClient>) {
  async function getCorePayload(): Promise<any> {
    const { data, error } = await userClient.from("staffing_state").select("payload").eq("id", 1).maybeSingle();
    if (error) throw error;
    return (data as any)?.payload || {};
  }

  return async function toolExecutor(name: string, args: any): Promise<unknown> {
    if (name === "get_operatori") {
      const payload = await getCorePayload();
      const operatori = (payload.operatori || []).map((o: any) => {
        const attestatiDett = o.attestati_dett || {};
        const dpiDett = o.dpi_dett || {};
        const limDett = o.limitazioni_dett || null;
        return {
          nome_esteso: o.nome_esteso,
          email: o.email || null,
          skills: o.skills || [],
          attestati: (o.attestati || []).map((nome: string) => ({ nome, scadenza: attestatiDett[nome]?.scad || null })),
          dpi: (o.dpi || []).map((nome: string) => ({ nome, scadenza: dpiDett[nome]?.scad || null, taglia: dpiDett[nome]?.taglia || null })),
          limitazioni: limDett ? {
            tipo_visita: limDett.tipo_visita || null,
            scadenza_visita: limDett.scadenza_visita || null,
            voci: (limDett.voci || []).map((v: any) => ({ tipo: v.tipo, nota: v.nota })),
          } : null,
          provincia: o.provincia,
          regione: o.regione,
          contratto_tipo: o.contratto_tipo,
          contratto_inizio: o.data_inizio_rapporto || null,
          contratto_fine: o.data_fine_rapporto || null,
          ex_collega: !!o.licenziato,
        };
      });
      return { operatori };
    }

    if (name === "get_pipeline") {
      const payload = await getCorePayload();
      return {
        pipeline: payload.pipeline || [],
        commesse_attive: payload.commesse_attive || [],
        commesse_attive_meta: payload.commesse_attive_meta || {},
        commesse_chiuse: payload.commesse_chiuse || [],
      };
    }

    if (name === "get_staffing_mensile") {
      const payload = await getCorePayload();
      let rows = (payload.staffing || []).map((r: any) => ({
        risorsa: r.risorsa, commessa: r.commessa, team: r.team, mesi: r.mesi,
      }));
      if (args?.risorsa) {
        const needle = String(args.risorsa).toLowerCase();
        rows = rows.filter((r: any) => (r.risorsa || "").toLowerCase().includes(needle));
      }
      if (args?.commessa) {
        const needle = String(args.commessa).toLowerCase();
        rows = rows.filter((r: any) => (r.commessa || "").toLowerCase().includes(needle));
      }
      return { staffing: rows.slice(0, MAX_ROWS) };
    }

    if (name === "get_dpi_catalogo") {
      const payload = await getCorePayload();
      return { dpi_disponibili: payload.dpi_disponibili || [], dpi_catalogo: payload.dpi_catalogo || {} };
    }

    if (name === "get_registro_esterno") {
      const tipo = args?.tipo === "limitazioni" ? "limitazioni" : "attestati";
      const payload = await getCorePayload();
      const registro = tipo === "limitazioni" ? (payload.limitazioni_registro || {}) : (payload.attestati_registro || {});
      let dipendenti = registro.dipendenti || [];
      if (args?.nome) {
        const needle = String(args.nome).toLowerCase();
        dipendenti = dipendenti.filter((d: any) => (d.nome || "").toLowerCase().includes(needle));
      }
      return {
        aggiornato_il: registro.aggiornato_il || null,
        file: registro.file || null,
        dipendenti: dipendenti.slice(0, 50),
      };
    }

    if (name === "get_pianificazione") {
      const anno = String(args?.anno ?? "");
      const settimana = String(args?.settimana ?? "");
      const { data, error } = await userClient.from("staffing_state").select("payload").eq("id", 2).maybeSingle();
      if (error) throw error;
      const pwData = (data as any)?.payload?.pw_data || {};
      return { pianificazione: pwData?.[anno]?.[settimana] || [] };
    }

    if (name === "get_ferie") {
      const anno = String(args?.anno ?? "");
      const settimana = String(args?.settimana ?? "");
      const { data, error } = await userClient.from("staffing_state").select("payload").eq("id", 3).maybeSingle();
      if (error) throw error;
      const payload = (data as any)?.payload || {};
      const ferie = payload.pw_ferie || {};
      const dettagli = payload.pw_ferie_dettagli || {};
      return { ferie: ferie?.[anno]?.[settimana] || null, dettagli: dettagli?.[anno]?.[settimana] || null };
    }

    if (name === "get_doppia_week") {
      const anno = String(args?.anno ?? "");
      const settimana = String(args?.settimana ?? "");
      const { data, error } = await userClient.from("staffing_state").select("payload").eq("id", 4).maybeSingle();
      if (error) throw error;
      const dw = (data as any)?.payload?.pw_doppia_week || {};
      return { doppia_week: dw?.[anno]?.[settimana] || null };
    }

    if (name === "get_produzione") {
      const anno = Number(args?.anno);
      const settimana = Number(args?.settimana);
      let q = userClient
        .from("controllo_produzione")
        .select("anno,week,commessa,squadra,operatore,giorno,data_giorno,cantiere,attivita,ore_jira,ore_report,km_cad,note,verificato")
        .eq("anno", anno)
        .eq("week", settimana);
      if (args?.operatore) q = q.ilike("operatore", `%${String(args.operatore)}%`);
      if (args?.commessa) q = q.ilike("commessa", `%${String(args.commessa)}%`);
      const { data, error } = await q.limit(MAX_ROWS);
      if (error) throw error;
      return { produzione: data || [] };
    }

    return { error: `Tool sconosciuto: ${name}` };
  };
}

/* ===================== Provider adapters ===================== */
// Interfaccia comune: (apiKey, model, systemPrompt, question, history, toolExecutor) => Promise<string>

async function runGemini(apiKey: string, model: string, systemPrompt: string, question: string, history: {role:string;content:string}[], toolExecutor: (n:string,a:any)=>Promise<unknown>): Promise<string> {
  const functionDeclarations = TOOLS.map(t => ({ name: t.name, description: t.description, parameters: t.parameters }));
  const contents: any[] = history.map(h => ({ role: h.role === "assistant" ? "model" : "user", parts: [{ text: h.content }] }));
  contents.push({ role: "user", parts: [{ text: question }] });

  for (let iter = 0; iter < MAX_TOOL_ITERATIONS; iter++) {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemPrompt }] },
          contents,
          tools: [{ functionDeclarations }],
          generationConfig: { maxOutputTokens: MAX_TOKENS },
        }),
      },
    );
    if (!res.ok) throw await providerError("Gemini", res);
    const data = await res.json();
    const candidate = data?.candidates?.[0];
    const parts = candidate?.content?.parts || [];
    const functionCalls = parts.filter((p: any) => p.functionCall).map((p: any) => p.functionCall);
    if (functionCalls.length === 0) {
      const text = parts.map((p: any) => p.text || "").join("").trim();
      return text || "Non sono riuscito a generare una risposta.";
    }
    contents.push({ role: "model", parts });
    const responseParts = [];
    for (const fc of functionCalls) {
      let result;
      try { result = await toolExecutor(fc.name, fc.args || {}); } catch (e) { result = { error: String((e as Error)?.message || e) }; }
      responseParts.push({ functionResponse: { name: fc.name, response: result } });
    }
    contents.push({ role: "user", parts: responseParts });
  }
  return "Non sono riuscito a rispondere entro il numero massimo di passaggi consentiti.";
}

/* Formato OpenAI (chat/completions con tools): Groq e OpenRouter */
const OPENAI_COMPAT: Record<string, { nome: string; url: string; headers: Record<string, string> }> = {
  groq: { nome: "Groq", url: "https://api.groq.com/openai/v1/chat/completions", headers: {} },
  openrouter: {
    nome: "OpenRouter",
    url: "https://openrouter.ai/api/v1/chat/completions",
    headers: { "HTTP-Referer": "https://mmarchetti95.github.io/Gestione-Staffing/", "X-Title": "Gestione Staffing" },
  },
};

async function runOpenAICompat(provider: string, apiKey: string, model: string, systemPrompt: string, question: string, history: {role:string;content:string}[], toolExecutor: (n:string,a:any)=>Promise<unknown>): Promise<string> {
  const cfg = OPENAI_COMPAT[provider];
  const toolsSchema = TOOLS.map(t => ({ type: "function", function: { name: t.name, description: t.description, parameters: t.parameters } }));
  const messages: any[] = [{ role: "system", content: systemPrompt }];
  for (const h of history) messages.push({ role: h.role === "assistant" ? "assistant" : "user", content: h.content });
  messages.push({ role: "user", content: question });

  for (let iter = 0; iter < MAX_TOOL_ITERATIONS; iter++) {
    const res = await fetch(cfg.url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}`, ...cfg.headers },
      body: JSON.stringify({ model, messages, tools: toolsSchema, tool_choice: "auto", max_tokens: MAX_TOKENS }),
    });
    if (!res.ok) throw await providerError(cfg.nome, res);
    const data = await res.json();
    if (data?.error) throw new Error(`${cfg.nome}: ${String(data.error.message || data.error).slice(0, 300)}`);
    const msg = data?.choices?.[0]?.message;
    if (!msg) throw new Error(`Risposta ${cfg.nome} inattesa`);
    if (!msg.tool_calls || msg.tool_calls.length === 0) {
      return (msg.content || "").trim() || "Non sono riuscito a generare una risposta.";
    }
    messages.push({ role: "assistant", content: msg.content || null, tool_calls: msg.tool_calls });
    for (const tc of msg.tool_calls) {
      let args: any = {};
      try { args = JSON.parse(tc.function.arguments || "{}"); } catch { /* ignore */ }
      let result;
      try { result = await toolExecutor(tc.function.name, args); } catch (e) { result = { error: String((e as Error)?.message || e) }; }
      messages.push({ role: "tool", tool_call_id: tc.id, content: JSON.stringify(result) });
    }
  }
  return "Non sono riuscito a rispondere entro il numero massimo di passaggi consentiti.";
}

async function runAnthropic(apiKey: string, model: string, systemPrompt: string, question: string, history: {role:string;content:string}[], toolExecutor: (n:string,a:any)=>Promise<unknown>): Promise<string> {
  const toolsSchema = TOOLS.map(t => ({ name: t.name, description: t.description, input_schema: t.parameters }));
  const messages: any[] = history.map(h => ({ role: h.role === "assistant" ? "assistant" : "user", content: h.content }));
  messages.push({ role: "user", content: question });

  for (let iter = 0; iter < MAX_TOOL_ITERATIONS; iter++) {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model, max_tokens: MAX_TOKENS, system: systemPrompt, messages, tools: toolsSchema }),
    });
    if (!res.ok) throw await providerError("Anthropic", res);
    const data = await res.json();
    const content = data?.content || [];
    const toolUses = content.filter((c: any) => c.type === "tool_use");
    if (toolUses.length === 0) {
      const text = content.filter((c: any) => c.type === "text").map((c: any) => c.text).join("").trim();
      return text || "Non sono riuscito a generare una risposta.";
    }
    messages.push({ role: "assistant", content });
    const toolResults = [];
    for (const tu of toolUses) {
      let result;
      try { result = await toolExecutor(tu.name, tu.input || {}); } catch (e) { result = { error: String((e as Error)?.message || e) }; }
      toolResults.push({ type: "tool_result", tool_use_id: tu.id, content: JSON.stringify(result) });
    }
    messages.push({ role: "user", content: toolResults });
  }
  return "Non sono riuscito a rispondere entro il numero massimo di passaggi consentiti.";
}

/* ===================== Handler ===================== */

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "Metodo non consentito" }, 405);

  const authz = req.headers.get("Authorization") || "";
  if (!authz.startsWith("Bearer ")) return json({ error: "Non autenticato" }, 401);
  const jwt = authz.slice("Bearer ".length);

  if (!SUPABASE_URL || !ANON_KEY || !SERVICE_ROLE_KEY) {
    return json({ error: "Configurazione mancante (SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY)" }, 500);
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: authz } },
  });

  const { data: callerData, error: callerErr } = await admin.auth.getUser(jwt);
  if (callerErr || !callerData?.user) return json({ error: "Sessione non valida" }, 401);
  const role = callerData.user.user_metadata?.role || "responsabile";
  if (role === "guest") return json({ error: "Funzione non disponibile per il tuo ruolo" }, 403);

  let payload: any;
  try { payload = await req.json(); } catch { return json({ error: "JSON non valido" }, 400); }
  const action = String(payload?.action || "");

  try {
    const { data: settings, error: sErr } = await admin
      .from("ai_assistant_settings")
      .select("enabled, provider, model, custom_instructions")
      .eq("id", 1)
      .maybeSingle();
    if (sErr) throw sErr;
    const enabled = !!settings?.enabled;

    if (action === "status") {
      return json({ enabled });
    }

    if (action === "ask") {
      if (!enabled) return json({ error: "L'assistente AI è disattivato dall'amministratore." }, 200);

      const question = String(payload?.question || "").trim().slice(0, 2000);
      if (!question) return json({ error: "Domanda vuota" }, 400);

      const anno = Number(payload?.anno) || new Date().getFullYear();
      const settimana = Number(payload?.settimana) || 1;

      const rawHistory = Array.isArray(payload?.history) ? payload.history : [];
      const history = rawHistory
        .slice(-MAX_HISTORY_MESSAGES)
        .filter((h: any) => h && (h.role === "user" || h.role === "assistant") && typeof h.content === "string")
        .map((h: any) => ({ role: h.role, content: String(h.content).slice(0, 4000) }));

      const provider = settings?.provider || "gemini";
      const model = settings?.model || "gemini-2.5-flash";
      const { data: apiKey, error: kErr } = await admin.rpc("ai_assistant_get_provider_key", { p_provider: provider });
      if (kErr) throw kErr;
      if (!apiKey) {
        return json({ error: "Nessuna API key configurata per il provider scelto (" + provider + "). Contatta l'amministratore." }, 200);
      }

      const toolExecutor = makeToolExecutor(userClient);
      let systemPrompt =
        "Sei l'assistente AI della Dashboard Staffing di Eagleprojects (reparto rilievi/surveying). " +
        "Rispondi in italiano, in modo conciso e concreto, basandoti SOLO sui dati che ottieni tramite gli strumenti a disposizione — non inventare nomi, date o numeri. " +
        "Se la domanda riguarda 'questa settimana' o non specifica anno/settimana, usa anno=" + anno + " e settimana=" + settimana + " (contesto corrente dell'utente). " +
        "get_staffing_mensile si riferisce sempre all'anno correntemente configurato in Dashboard (non serve/non esiste un parametro anno per quel tool). " +
        "Usa solo gli strumenti pertinenti alla domanda, non recuperare dati non necessari. Se un dato richiesto non è disponibile, dillo chiaramente invece di supporre.";
      const customInstructions = String(settings?.custom_instructions || "").trim();
      if (customInstructions) {
        systemPrompt += " Istruzioni aggiuntive impostate dall'amministratore (rispettale insieme a quelle sopra, senza contraddire la regola di non inventare dati): " + customInstructions;
      }

      let answer: string;
      if (provider === "gemini") answer = await runGemini(apiKey, model, systemPrompt, question, history, toolExecutor);
      else if (provider === "groq" || provider === "openrouter") answer = await runOpenAICompat(provider, apiKey, model, systemPrompt, question, history, toolExecutor);
      else if (provider === "anthropic") answer = await runAnthropic(apiKey, model, systemPrompt, question, history, toolExecutor);
      else return json({ error: "Provider configurato non valido" }, 500);

      return json({ answer });
    }

    return json({ error: "Azione non riconosciuta" }, 400);
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 500);
  }
});
