// supabase/functions/ai-autoplan/index.ts
//
// Edge Function: agente della tab "🤖 Auto-pianifica". È un RELÈ a un solo passo verso
// il provider LLM configurato dall'admin (Gemini / Groq / Anthropic / OpenRouter: stessa
// configurazione e stesse API key, una per provider, dell'assistente generico — tabella
// ai_assistant_settings + Vault, vedi ai-assistant-config). A differenza di ai-assistant,
// qui gli strumenti NON girano sul server: la bozza (lista cantieri, priorità, esito del solver) vive solo nel browser.
// Quindi ogni chiamata fa UNA richiesta al modello e restituisce il suo messaggio
// (testo e/o richieste di strumenti); il client esegue gli strumenti sulla bozza locale
// e richiama la function con i risultati, fino alla risposta finale.
//
// Sicurezza: gli strumenti elencati qui sotto sono l'unico contratto possibile e
// agiscono solo sulla bozza. Nessuno strumento scrive la Griglia (pwData): la bozza
// arriva in Griglia solo con il tasto "Applica" premuto dall'utente.
//
// Contratto richiesta (POST, JSON):
//   { action: 'status' }
//   { action: 'step', anno, settimana, oggi, messages }
//     messages: trascrizione normalizzata, indipendente dal provider:
//       { role: 'user', text }
//       { role: 'assistant', text?, toolCalls?: [{ id, name, args, sig? }] }
//       { role: 'tool', results: [{ id, name, result }] }
//
// Contratto risposta (JSON):
//   { enabled, provider, model, has_key } | { message: { text, toolCalls } } | { error }

import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

const MAX_TOKENS = 2048;
const MAX_MESSAGES = 60;
const MAX_TEXT = 6000;
const MAX_RESULT = 14000;

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

/* ===================== Strumenti (eseguiti dal browser) ===================== */

const RIF = { type: "string", description: "id del cantiere (es. \"r12\", da leggi_bozza) oppure il suo nome esatto" };
const GIORNI = {
  type: "array",
  items: { type: "integer" },
  description: "indici dei giorni: 0=Lun 1=Mar 2=Mer 3=Gio 4=Ven 5=Sab",
};
const CAMPI_CANTIERE = {
  cantiere: { type: "string", description: "comune o sito" },
  commessa: { type: "string", description: "nome della commessa (va ricondotto a una commessa attiva)" },
  attivita: { type: "string" },
  km: { type: "number", description: "km da rilevare: con km e attività i giorni si stimano dallo storico" },
  giorni: { type: "number", description: "giorni-squadra fissati a mano (0 = torna alla stima)" },
  operatori: { type: "integer", description: "operatori per squadra" },
  priorita: { type: "integer", description: "1, 2 o 3 (1 = massima)" },
  scadenza: { type: "string", description: "data ISO AAAA-MM-GG entro cui finire ('' per togliere)" },
  dal: { type: "string", description: "data ISO: non iniziare prima ('' per togliere)" },
  preferiti: { type: "array", items: { type: "string" }, description: "operatori da favorire (sostituisce l'elenco)" },
  esclusi: { type: "array", items: { type: "string" }, description: "operatori da non assegnare mai qui (sostituisce l'elenco)" },
  giorni_esclusi: { ...GIORNI, description: "giorni in cui il cantiere NON si fa (vincolo rigido, sostituisce l'elenco): 0=Lun … 5=Sab" },
  note: { type: "string" },
};

const TOOLS = [
  {
    name: "leggi_bozza",
    description: "Stato attuale: settimana, giorni pianificabili, opzioni, elenco cantieri con id/priorità/stima/vincoli, precedenze e, se calcolata, l'esito della bozza (stato per cantiere, giorni e operatori, migliorie, suggerimenti). Chiamalo PRIMA di ogni modifica, per conoscere id e valori attuali.",
    parameters: { type: "object", properties: {}, required: [] },
  },
  {
    name: "leggi_operatori",
    description: "Disponibilità degli operatori nella settimana (libero / ferie / doppia week / già in Griglia / sabato non previsto), residenza, skill, commessa della settimana e celle proposte dalla bozza. Filtri facoltativi.",
    parameters: {
      type: "object",
      properties: {
        nome: { type: "string", description: "filtro sul nome (parziale)" },
        libero_il: { type: "integer", description: "solo chi è libero quel giorno (0=Lun … 5=Sab)" },
        skill: { type: "string" },
      },
      required: [],
    },
  },
  {
    name: "spiega_cantiere",
    description: "Diagnosi di un cantiere nella bozza calcolata: esito, stima dei giorni e sua origine, e giorno per giorno quanti operatori erano liberi, quanti esclusi e perché (raggio km, attestati, esclusi a mano, meteo) e chi, fra i vicini, è stato preso da un altro cantiere. Usalo per rispondere ai 'perché'.",
    parameters: { type: "object", properties: { rif: RIF }, required: ["rif"] },
  },
  {
    name: "aggiungi_cantieri",
    description: "Aggiunge uno o più cantieri alla lista. Servono almeno cantiere e commessa.",
    parameters: {
      type: "object",
      properties: {
        cantieri: { type: "array", items: { type: "object", properties: CAMPI_CANTIERE, required: ["cantiere"] } },
      },
      required: ["cantieri"],
    },
  },
  {
    name: "modifica_cantiere",
    description: "Modifica i campi indicati di un cantiere (gli altri restano). Per togliere un vincolo passa '' o un elenco vuoto.",
    parameters: {
      type: "object",
      properties: { rif: RIF, ...CAMPI_CANTIERE, includi: { type: "boolean", description: "false = escluso dal calcolo" } },
      required: ["rif"],
    },
  },
  {
    name: "rimuovi_cantiere",
    description: "Toglie un cantiere dalla lista (non dalla Griglia).",
    parameters: { type: "object", properties: { rif: RIF }, required: ["rif"] },
  },
  {
    name: "importa_settimana_precedente",
    description: "Aggiunge alla lista i cantieri pianificati in Griglia la settimana precedente (senza km: vanno completati).",
    parameters: { type: "object", properties: {}, required: [] },
  },
  {
    name: "imposta_precedenza",
    description: "Obbliga il calcolo a considerare il cantiere 'prima' davanti a 'dopo' (serve quando due cantieri si contendono gli stessi operatori). attiva=false la toglie.",
    parameters: {
      type: "object",
      properties: { prima: RIF, dopo: RIF, attiva: { type: "boolean" } },
      required: ["prima", "dopo"],
    },
  },
  {
    name: "imposta_opzioni",
    description: "Opzioni della settimana: lavoro anche il sabato, considerare il meteo, raggio massimo di trasferta in km.",
    parameters: {
      type: "object",
      properties: {
        sabato: { type: "boolean" },
        meteo: { type: "boolean" },
        max_km: { type: "integer", description: "raggio massimo di trasferta, da 20 a 1000 km" },
      },
      required: [],
    },
  },
  {
    name: "segnala_imprevisto",
    description: "Segnala un imprevisto nella settimana GIÀ pianificata in Griglia: un operatore assente (malattia, permesso, ferie improvvise) o un cantiere fermo (chiuso, inaccessibile). Non cambia niente da solo: prepara la riparazione. Restituisce le celle di Griglia colpite. Se lo stesso operatore/cantiere è già segnalato, i giorni si uniscono.",
    parameters: {
      type: "object",
      properties: {
        tipo: { type: "string", enum: ["assenza", "cantiere_fermo"] },
        operatore: { type: "string", description: "per tipo=assenza: nome dell'operatore (va ricondotto al pool)" },
        cantiere: { type: "string", description: "per tipo=cantiere_fermo: cantiere presente in Griglia questa settimana" },
        giorni: { ...GIORNI, description: "giorni dell'imprevisto: 0=Lun … 5=Sab (i giorni già passati vengono ignorati)" },
        registra_in_ferie: { type: "string", enum: ["ferie", "non_disponibile", "nessuno"], description: "per tipo=assenza: come registrare l'assenza nella tab Ferie all'applicazione (malattia/permesso → non_disponibile; ferie → ferie). Se l'utente non lo dice, nessuno." },
        motivo: { type: "string" },
      },
      required: ["tipo", "giorni"],
    },
  },
  {
    name: "rimuovi_imprevisto",
    description: "Toglie un imprevisto segnalato (per id, da leggi_bozza) o tutti.",
    parameters: {
      type: "object",
      properties: { id: { type: "string" }, tutti: { type: "boolean" } },
      required: [],
    },
  },
  {
    name: "calcola_riparazione",
    description: "Calcola la riparazione degli imprevisti segnalati: toglie solo le celle colpite, cerca un sostituto per ogni cantiere-giorno di un assente e sposta su altri giorni il lavoro di un cantiere fermo (favorendo la stessa squadra). Il resto della Griglia non cambia. Restituisce sostituti, recuperi, cosa resta scoperto e chi resta libero.",
    parameters: { type: "object", properties: {}, required: [] },
  },
  {
    name: "calcola_bozza",
    description: "Ricalcola la bozza con il solver (localizza i cantieri, distanze stradali, meteo, poi assegna). Va chiamato dopo ogni gruppo di modifiche prima di riferire i risultati. Restituisce il riepilogo e le differenze rispetto alla bozza precedente.",
    parameters: { type: "object", properties: {}, required: [] },
  },
];

function systemPrompt(anno: number, settimana: number, oggi: string): string {
  return [
    "Sei l'assistente di pianificazione della tab Auto-pianifica della Dashboard Staffing di Eagleprojects (reparto rilievi).",
    `L'utente sta preparando la BOZZA della settimana ISO ${settimana} del ${anno}. Oggi è ${oggi}.`,
    "Due modalità: (a) BOZZA da una lista di cantieri; (b) RIPARAZIONE per imprevisti sulla Griglia già compilata.",
    "Come funziona la bozza: c'è una lista di cantieri da pianificare (cantiere, commessa, attività, km, priorità P1-P3, scadenza, vincoli). Un solver deterministico assegna singoli operatori ai giorni: le squadre si ricompongono. I giorni-squadra si stimano dallo storico di produzione (km / km al giorno della famiglia di attività) se non sono fissati a mano.",
    "Regole:",
    "1. Lavori SOLO con gli strumenti. Non inventare nomi, id, numeri o esiti: leggili con leggi_bozza, leggi_operatori, spiega_cantiere.",
    "2. Prima di modificare, leggi lo stato (leggi_bozza). Dopo un gruppo di modifiche chiama calcola_bozza UNA volta e riferisci l'esito reale.",
    "3. Non puoi scrivere la Griglia: la bozza finisce in Griglia solo quando l'utente preme «Applica alla Griglia». Non dire mai di averla applicata.",
    "4. Se una richiesta è ambigua (due cantieri con nomi simili, operatore non riconosciuto, data non chiara) chiedi prima di modificare.",
    "5. Il solver non fissa un operatore a un giorno preciso: per 'mettere X su Y' usa preferiti (favorisce) ed esclusi (vieta); per i giorni usa dal, scadenza e giorni_esclusi. Se qualcosa non si può esprimere, dillo e proponi l'alternativa più vicina.",
    "6. Per i 'perché' usa spiega_cantiere e cita la causa concreta (es. 'i 3 operatori vicini sono già su Ivrea, P1').",
    "7. Imprevisti a settimana già pianificata ('X è malato mercoledì', 'il cantiere Y è chiuso giovedì'): NON usare la lista cantieri. Usa segnala_imprevisto (uno per operatore o cantiere), poi calcola_riparazione una volta, e riferisci chi sostituisce chi, cosa si recupera e cosa resta scoperto. Si applica solo con «Applica riparazione», premuto dall'utente. Se non è chiaro come registrare l'assenza in Ferie, chiedilo o lascia 'nessuno'.",
    "Stile: italiano, breve, concreto. Chiama i cantieri per nome (mai per id). Usa elenchi puntati corti e **grassetto** solo per i nomi chiave. Chiudi, quando utile, con una proposta di passo successivo in una riga.",
  ].join("\n");
}

/* ===================== Trascrizione normalizzata ===================== */

type ToolCall = { id: string; name: string; args: Record<string, unknown>; sig?: string };
type Msg =
  | { role: "user"; text: string }
  | { role: "assistant"; text?: string; toolCalls?: ToolCall[] }
  | { role: "tool"; results: { id: string; name: string; result: unknown }[] };
type Step = { text: string; toolCalls: ToolCall[] };

const NOMI_TOOL = new Set(TOOLS.map((t) => t.name));

function cut(s: unknown, n: number): string {
  const t = typeof s === "string" ? s : JSON.stringify(s ?? null);
  return t.length > n ? t.slice(0, n) + "…[troncato]" : t;
}

/* Ripulisce la trascrizione arrivata dal client: ruoli ammessi, testi limitati, e ogni
   richiesta di strumento seguita dal suo risultato (i provider rifiutano le coppie spezzate). */
function sanitize(raw: unknown): Msg[] {
  const arr = Array.isArray(raw) ? raw.slice(-MAX_MESSAGES) : [];
  const out: Msg[] = [];
  for (const m of arr as any[]) {
    if (!m || typeof m !== "object") continue;
    if (m.role === "user" && typeof m.text === "string" && m.text.trim()) {
      out.push({ role: "user", text: cut(m.text, MAX_TEXT) });
    } else if (m.role === "assistant") {
      const toolCalls = (Array.isArray(m.toolCalls) ? m.toolCalls : [])
        .filter((c: any) => c && typeof c.id === "string" && NOMI_TOOL.has(c.name))
        .map((c: any) => ({ id: c.id, name: c.name, args: c.args && typeof c.args === "object" ? c.args : {}, sig: typeof c.sig === "string" ? c.sig : undefined }));
      const text = typeof m.text === "string" ? cut(m.text, MAX_TEXT) : "";
      if (text || toolCalls.length) out.push({ role: "assistant", text, toolCalls });
    } else if (m.role === "tool" && Array.isArray(m.results)) {
      out.push({
        role: "tool",
        results: m.results
          .filter((r: any) => r && typeof r.id === "string")
          .map((r: any) => ({ id: r.id, name: String(r.name || ""), result: r.result })),
      });
    }
  }
  /* Il taglio a MAX_MESSAGES può lasciare in testa un risultato orfano: si parte dal primo messaggio utente */
  while (out.length && out[0].role !== "user") out.shift();
  const fixed: Msg[] = [];
  for (let i = 0; i < out.length; i++) {
    const m = out[i];
    if (m.role === "tool") {
      const prev = fixed[fixed.length - 1];
      if (!prev || prev.role !== "assistant" || !prev.toolCalls?.length) continue;
      const ids = new Set(prev.toolCalls.map((c) => c.id));
      const results = m.results.filter((r) => ids.has(r.id));
      for (const c of prev.toolCalls) {
        if (!results.some((r) => r.id === c.id)) results.push({ id: c.id, name: c.name, result: { error: "non eseguito" } });
      }
      fixed.push({ role: "tool", results });
      continue;
    }
    const prev = fixed[fixed.length - 1];
    if (prev && prev.role === "assistant" && prev.toolCalls?.length) {
      fixed.push({ role: "tool", results: prev.toolCalls.map((c) => ({ id: c.id, name: c.name, result: { error: "non eseguito" } })) });
    }
    fixed.push(m);
  }
  const last = fixed[fixed.length - 1];
  if (last && last.role === "assistant" && last.toolCalls?.length) fixed.pop();
  return fixed;
}

/* ===================== Adattatori provider ===================== */

/* Errore HTTP del provider -> messaggio comprensibile (i piani gratuiti finiscono spesso in 429) */
async function providerError(nome: string, res: Response): Promise<Error> {
  const t = (await res.text().catch(() => "")).slice(0, 300);
  if (res.status === 429) return new Error(`Limite di richieste raggiunto su ${nome} (tipico dei piani gratuiti): riprova tra un minuto o scegli un altro modello nel pannello admin.`);
  if (res.status === 401 || res.status === 403) return new Error(`${nome} ha rifiutato la API key: controllala in Gestione Assistente AI.`);
  if (res.status === 402) return new Error(`${nome}: credito insufficiente per questo modello.`);
  if (/tool|function/i.test(t) && (res.status === 400 || res.status === 404)) return new Error(`Il modello scelto su ${nome} non supporta gli strumenti: scegline un altro nel pannello admin.`);
  return new Error(`${nome} HTTP ${res.status}: ${t}`);
}

async function stepAnthropic(apiKey: string, model: string, system: string, msgs: Msg[]): Promise<Step> {
  const messages: any[] = [];
  const push = (role: string, blocks: any[]) => {
    const prev = messages[messages.length - 1];
    if (prev && prev.role === role) prev.content.push(...blocks);
    else messages.push({ role, content: blocks });
  };
  for (const m of msgs) {
    if (m.role === "user") push("user", [{ type: "text", text: m.text }]);
    else if (m.role === "assistant") {
      const blocks: any[] = [];
      if (m.text) blocks.push({ type: "text", text: m.text });
      for (const c of m.toolCalls || []) blocks.push({ type: "tool_use", id: c.id, name: c.name, input: c.args || {} });
      if (blocks.length) push("assistant", blocks);
    } else {
      push("user", m.results.map((r) => ({ type: "tool_result", tool_use_id: r.id, content: cut(r.result, MAX_RESULT) })));
    }
  }
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model, max_tokens: MAX_TOKENS, system, messages,
      tools: TOOLS.map((t) => ({ name: t.name, description: t.description, input_schema: t.parameters })),
    }),
  });
  if (!res.ok) throw await providerError("Anthropic", res);
  const data = await res.json();
  const content = data?.content || [];
  return {
    text: content.filter((c: any) => c.type === "text").map((c: any) => c.text).join("").trim(),
    toolCalls: content.filter((c: any) => c.type === "tool_use").map((c: any) => ({ id: c.id, name: c.name, args: c.input || {} })),
  };
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

async function stepOpenAICompat(provider: string, apiKey: string, model: string, system: string, msgs: Msg[]): Promise<Step> {
  const cfg = OPENAI_COMPAT[provider];
  const messages: any[] = [{ role: "system", content: system }];
  for (const m of msgs) {
    if (m.role === "user") messages.push({ role: "user", content: m.text });
    else if (m.role === "assistant") {
      const tc = (m.toolCalls || []).map((c) => ({ id: c.id, type: "function", function: { name: c.name, arguments: JSON.stringify(c.args || {}) } }));
      messages.push(tc.length ? { role: "assistant", content: m.text || null, tool_calls: tc } : { role: "assistant", content: m.text || "" });
    } else {
      for (const r of m.results) messages.push({ role: "tool", tool_call_id: r.id, content: cut(r.result, MAX_RESULT) });
    }
  }
  const res = await fetch(cfg.url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}`, ...cfg.headers },
    body: JSON.stringify({
      model, messages, max_tokens: MAX_TOKENS, tool_choice: "auto",
      tools: TOOLS.map((t) => ({ type: "function", function: { name: t.name, description: t.description, parameters: t.parameters } })),
    }),
  });
  if (!res.ok) throw await providerError(cfg.nome, res);
  const data = await res.json();
  if (data?.error) throw new Error(`${cfg.nome}: ${String(data.error.message || data.error).slice(0, 300)}`);
  const msg = data?.choices?.[0]?.message;
  if (!msg) throw new Error(`Risposta ${cfg.nome} inattesa`);
  return {
    text: String(msg.content || "").trim(),
    toolCalls: (msg.tool_calls || []).map((tc: any) => {
      let args = {};
      try { args = JSON.parse(tc.function?.arguments || "{}"); } catch { /* argomenti non validi: vuoti */ }
      return { id: tc.id, name: tc.function?.name, args };
    }),
  };
}

async function stepGemini(apiKey: string, model: string, system: string, msgs: Msg[]): Promise<Step> {
  const contents: any[] = [];
  for (const m of msgs) {
    if (m.role === "user") contents.push({ role: "user", parts: [{ text: m.text }] });
    else if (m.role === "assistant") {
      const parts: any[] = [];
      if (m.text) parts.push({ text: m.text });
      for (const c of m.toolCalls || []) {
        const p: any = { functionCall: { name: c.name, args: c.args || {} } };
        if (c.sig) p.thoughtSignature = c.sig;
        parts.push(p);
      }
      if (parts.length) contents.push({ role: "model", parts });
    } else {
      contents.push({
        role: "user",
        parts: m.results.map((r) => {
          let response: any = r.result;
          if (!response || typeof response !== "object" || Array.isArray(response)) response = { result: response };
          const s = JSON.stringify(response);
          if (s.length > MAX_RESULT) response = { result: cut(s, MAX_RESULT) };
          return { functionResponse: { name: r.name, response } };
        }),
      });
    }
  }
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents,
        tools: [{ functionDeclarations: TOOLS.map((t) => ({ name: t.name, description: t.description, parameters: t.parameters })) }],
        generationConfig: { maxOutputTokens: MAX_TOKENS },
      }),
    },
  );
  if (!res.ok) throw await providerError("Gemini", res);
  const data = await res.json();
  const parts = data?.candidates?.[0]?.content?.parts || [];
  let n = 0;
  return {
    text: parts.filter((p: any) => p.text && !p.thought).map((p: any) => p.text).join("").trim(),
    toolCalls: parts.filter((p: any) => p.functionCall).map((p: any) => ({
      id: "g" + Date.now().toString(36) + "-" + (n++),
      name: p.functionCall.name,
      args: p.functionCall.args || {},
      sig: p.thoughtSignature,
    })),
  };
}

/* ===================== Handler ===================== */

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "Metodo non consentito" }, 405);

  const authz = req.headers.get("Authorization") || "";
  if (!authz.startsWith("Bearer ")) return json({ error: "Non autenticato" }, 401);
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return json({ error: "Configurazione mancante (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)" }, 500);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: callerData, error: callerErr } = await admin.auth.getUser(authz.slice("Bearer ".length));
  if (callerErr || !callerData?.user) return json({ error: "Sessione non valida" }, 401);
  const role = callerData.user.user_metadata?.role || "responsabile";
  if (role === "guest") return json({ error: "Funzione non disponibile per il tuo ruolo" }, 403);

  let payload: any;
  try { payload = await req.json(); } catch { return json({ error: "JSON non valido" }, 400); }
  const action = String(payload?.action || "");

  try {
    const { data: settings, error: sErr } = await admin
      .from("ai_assistant_settings")
      .select("enabled, provider, model")
      .eq("id", 1)
      .maybeSingle();
    if (sErr) throw sErr;
    const enabled = !!settings?.enabled;
    const provider = settings?.provider || "gemini";
    const model = settings?.model || "gemini-2.5-flash";

    if (action === "status") {
      const { data: conChiave, error: kErr } = await admin.rpc("ai_assistant_providers_with_key");
      if (kErr) throw kErr;
      return json({ enabled, provider, model, has_key: Array.isArray(conChiave) && conChiave.includes(provider) });
    }

    if (action === "step") {
      if (!enabled) return json({ error: "L'assistente AI è disattivato dall'amministratore." });
      const msgs = sanitize(payload?.messages);
      if (!msgs.length) return json({ error: "Conversazione vuota" }, 400);
      const { data: apiKey, error: kErr } = await admin.rpc("ai_assistant_get_provider_key", { p_provider: provider });
      if (kErr) throw kErr;
      if (!apiKey) return json({ error: "Nessuna API key configurata per il provider scelto (" + provider + "). Contatta l'amministratore." });

      const anno = Number(payload?.anno) || new Date().getFullYear();
      const settimana = Number(payload?.settimana) || 1;
      const oggi = /^\d{4}-\d{2}-\d{2}$/.test(String(payload?.oggi || "")) ? String(payload.oggi) : new Date().toISOString().slice(0, 10);
      const system = systemPrompt(anno, settimana, oggi);

      let step: Step;
      if (provider === "anthropic") step = await stepAnthropic(apiKey, model, system, msgs);
      else if (provider === "groq" || provider === "openrouter") step = await stepOpenAICompat(provider, apiKey, model, system, msgs);
      else if (provider === "gemini") step = await stepGemini(apiKey, model, system, msgs);
      else return json({ error: "Provider configurato non valido" }, 500);
      step.toolCalls = step.toolCalls.filter((c) => NOMI_TOOL.has(c.name));
      return json({ message: step });
    }

    return json({ error: "Azione non riconosciuta" }, 400);
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 500);
  }
});
