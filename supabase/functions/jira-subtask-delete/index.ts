// supabase/functions/jira-subtask-delete/index.ts
//
// Edge Function: elimina su Jira i sottotask che la Griglia non pianifica più (v18.242.0),
// dal controllo «🎫 Sottotask» (righe «sottotask non più in Griglia»). Caso tipico: un
// comune salta per maltempo, la squadra va in un altro, si creano i sottotask nuovi e
// quelli vecchi vanno tolti.
//
// - Solo admin e responsabile (ruolo letto dall'utente Supabase, non dal client).
// - Elimina SOLO un sottotask mai iniziato: tipo sottotask, stato nella categoria "new"
//   (CREATED / TO DO) e nessuna ora registrata (worklog o tempo speso). Il controllo si fa
//   qui, sul ticket appena riletto, un istante prima della DELETE: un sottotask in IN
//   PROGRESS non ha ancora worklog (l'automazione li crea all'uscita da IN PROGRESS) ma la
//   sua categoria e' "indeterminate", quindi viene rifiutato. Cancellare un sottotask con
//   ore le farebbe sparire da Jira/Tempo e da «Ore Jira».
// - Serve il permesso «Delete Issues» dell'account di servizio (JIRA_EMAIL) nel progetto.
// - Dopo le eliminazioni, per ogni Task padre il cui sottotask eliminato aveva un
//   Production Weight, il peso (1/totale) viene riscritto sui sottotask rimasti, come fa
//   jira-create-subtask alla creazione.
// - Ogni eliminazione riuscita va in activity_log (con titolo, assegnatario, stato e Task
//   padre del sottotask), con la service_role.
//
// SECRET: JIRA_BASE_URL, JIRA_EMAIL, JIRA_API_TOKEN (come le altre jira-*),
//         SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (automatici).
//
// Richiesta (POST, JSON):
//   { keys: ["AI029-123", ...],            // max 100
//     contesto?: { anno, week, commessa } } // solo per il log
// Risposta:
//   { risultati: [{ key, esito: "eliminato" | "rifiutato" | "errore", motivo? }],
//     pesi: { "<taskKey>": { totale, peso, aggiornati, errori } | { errore } } }

import { createClient } from "npm:@supabase/supabase-js@2";

const JIRA_BASE_URL  = (Deno.env.get("JIRA_BASE_URL")  || "").replace(/\/+$/, "");
const JIRA_EMAIL     =  Deno.env.get("JIRA_EMAIL")     || "";
const JIRA_API_TOKEN =  Deno.env.get("JIRA_API_TOKEN") || "";
const SUPABASE_URL   =  Deno.env.get("SUPABASE_URL") || "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

const PRODUCTION_WEIGHT_FIELD = "customfield_13027";
const MAX_KEYS = 100;

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

async function jira(method: string, path: string, body?: unknown): Promise<Response> {
  return fetch(`${JIRA_BASE_URL}${path}`, {
    method,
    headers: {
      Authorization: "Basic " + btoa(`${JIRA_EMAIL}:${JIRA_API_TOKEN}`),
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

// Messaggio d'errore leggibile da una risposta Jira
async function jiraErr(res: Response, cosa: string): Promise<string> {
  let det = "";
  try {
    const j = await res.json();
    det = [...(j.errorMessages || []), ...Object.values(j.errors || {})].join(" ");
  } catch { /* corpo vuoto */ }
  if (res.status === 403 || res.status === 401) {
    det = (det ? det + " — " : "") + "l'account di servizio Jira non ha il permesso (serve «Delete Issues» nel progetto)";
  }
  if (res.status === 404) det = (det ? det + " — " : "") + "sottotask non trovato (già cancellato?)";
  return `${cosa}: HTTP ${res.status}${det ? " · " + det : ""}`;
}

type Esito = { key: string; esito: "eliminato" | "rifiutato" | "errore"; motivo?: string };
type Prima = { summary: string; status: string; assignee: string; parentKey: string; peso: boolean };

// Rilegge il sottotask e decide se si puo' eliminare: senza rifiuto ne' errore = si'.
async function esamina(key: string): Promise<{ prima?: Prima; rifiuto?: string; errore?: string }> {
  const res = await jira("GET", `/rest/api/3/issue/${encodeURIComponent(key)}?fields=summary,status,issuetype,parent,assignee,worklog,timespent,subtasks,${PRODUCTION_WEIGHT_FIELD}`);
  if (!res.ok) return { errore: await jiraErr(res, "Lettura del sottotask") };
  const f = (await res.json())?.fields || {};
  const prima: Prima = {
    summary: String(f.summary || ""),
    status: String(f.status?.name || ""),
    assignee: String(f.assignee?.displayName || ""),
    parentKey: String(f.parent?.key || ""),
    peso: f[PRODUCTION_WEIGHT_FIELD] !== null && f[PRODUCTION_WEIGHT_FIELD] !== undefined,
  };
  if (!f.issuetype?.subtask) return { prima, rifiuto: "non è un sottotask" };
  if (Array.isArray(f.subtasks) && f.subtasks.length) return { prima, rifiuto: "ha ticket figli" };
  const cat = String(f.status?.statusCategory?.key || "");
  if (cat !== "new") return { prima, rifiuto: `già iniziato (stato ${prima.status || "?"})` };
  const nWl = Number(f.worklog?.total || 0), speso = Number(f.timespent || 0);
  if (nWl > 0 || speso > 0) return { prima, rifiuto: "ha ore registrate" };
  return { prima };
}

// Chiavi di tutti i sottotask di un Task (campo "subtasks", non la ricerca JQL).
async function sottotaskDi(taskKey: string): Promise<string[] | null> {
  const res = await jira("GET", `/rest/api/3/issue/${encodeURIComponent(taskKey)}?fields=subtasks`);
  if (!res.ok) return null;
  const data = await res.json();
  const subtasks = Array.isArray(data?.fields?.subtasks) ? data.fields.subtasks : [];
  return subtasks.map((st: any) => String(st?.key || "")).filter(Boolean);
}

// Peso normalizzato a 1, 4 decimali (1/3 -> 0.3333): stessa regola di jira-create-subtask.
function weightFor(totale: number): number {
  return totale > 0 ? Math.round(10000 / totale) / 10000 : 1;
}

async function ricalcolaPesi(taskKey: string, eliminati: Set<string>): Promise<any> {
  const letti = await sottotaskDi(taskKey);
  if (!letti) return { errore: `Task ${taskKey} non leggibile: Production Weight non ricalcolato` };
  const keys = letti.filter((k) => !eliminati.has(k));
  if (!keys.length) return { totale: 0, peso: 0, aggiornati: 0, errori: [] };
  const peso = weightFor(keys.length);
  let aggiornati = 0, next = 0;
  const errori: { key: string; message: string }[] = [];
  const worker = async () => {
    while (next < keys.length) {
      const key = keys[next++];
      const res = await jira("PUT", `/rest/api/3/issue/${encodeURIComponent(key)}`, { fields: { [PRODUCTION_WEIGHT_FIELD]: peso } });
      if (res.ok) { aggiornati++; continue; }
      errori.push({ key, message: await jiraErr(res, "Production Weight") });
    }
  };
  await Promise.all(Array.from({ length: Math.min(6, keys.length) }, worker));
  return { totale: keys.length, peso, aggiornati, errori };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "Metodo non consentito" }, 405);

  const authz = req.headers.get("Authorization") || "";
  if (!authz.startsWith("Bearer ")) return json({ error: "Non autenticato" }, 401);
  if (!JIRA_BASE_URL || !JIRA_EMAIL || !JIRA_API_TOKEN) {
    return json({ error: "Secret Jira non configurati (JIRA_BASE_URL / JIRA_EMAIL / JIRA_API_TOKEN)" }, 500);
  }
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return json({ error: "Configurazione mancante (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)" }, 500);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: callerData, error: callerErr } = await admin.auth.getUser(authz.slice("Bearer ".length));
  if (callerErr || !callerData?.user) return json({ error: "Sessione non valida" }, 401);
  const role = callerData.user.user_metadata?.role || "responsabile";
  if (role !== "admin" && role !== "responsabile") return json({ error: "Solo admin e responsabili possono eliminare sottotask" }, 403);

  let p: any;
  try { p = await req.json(); } catch { return json({ error: "JSON non valido" }, 400); }
  const keys = [...new Set((Array.isArray(p?.keys) ? p.keys : []).map((k: unknown) => String(k || "").trim().toUpperCase()))] as string[];
  if (!keys.length) return json({ error: "Nessun sottotask indicato" }, 400);
  if (keys.length > MAX_KEYS) return json({ error: `Troppi sottotask in una richiesta (max ${MAX_KEYS})` }, 400);
  const nonValide = keys.filter((k) => !/^[A-Z][A-Z0-9_]*-\d+$/.test(k));
  if (nonValide.length) return json({ error: "Chiavi non valide: " + nonValide.join(", ") }, 400);
  const contesto = p?.contesto && typeof p.contesto === "object" ? p.contesto : {};

  const risultati: Esito[] = [];
  const eliminati: { key: string; prima: Prima }[] = [];
  let next = 0;
  const worker = async () => {
    while (next < keys.length) {
      const key = keys[next++];
      try {
        const { prima, rifiuto, errore } = await esamina(key);
        if (errore) { risultati.push({ key, esito: "errore", motivo: errore }); continue; }
        if (rifiuto) { risultati.push({ key, esito: "rifiutato", motivo: rifiuto }); continue; }
        const res = await jira("DELETE", `/rest/api/3/issue/${encodeURIComponent(key)}`);
        if (!res.ok) { risultati.push({ key, esito: "errore", motivo: await jiraErr(res, "Eliminazione") }); continue; }
        risultati.push({ key, esito: "eliminato" });
        eliminati.push({ key, prima: prima! });
      } catch (e) {
        risultati.push({ key, esito: "errore", motivo: String((e as Error)?.message || e) });
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(4, keys.length) }, worker));

  const pesi: Record<string, unknown> = {};
  const setEliminati = new Set(eliminati.map((x) => x.key));
  const daRicalcolare = [...new Set(eliminati.filter((x) => x.prima.peso && x.prima.parentKey).map((x) => x.prima.parentKey))];
  for (const taskKey of daRicalcolare) {
    try { pesi[taskKey] = await ricalcolaPesi(taskKey, setEliminati); }
    catch (e) { pesi[taskKey] = { errore: String((e as Error)?.message || e) }; }
  }

  if (eliminati.length) {
    try {
      await admin.from("activity_log").insert({
        user_email: callerData.user.email,
        action: eliminati.length === 1 ? "Sottotask Jira eliminato" : `Sottotask Jira eliminati (${eliminati.length})`,
        details: { contesto, eliminati, pesi },
      });
    } catch { /* il log non deve far fallire l'eliminazione già fatta */ }
  }

  risultati.sort((a, b) => keys.indexOf(a.key) - keys.indexOf(b.key));
  return json({ risultati, pesi });
});
