// supabase/functions/jira-worklog-edit/index.ts
//
// Edge Function: aggiunge, corregge o elimina UN worklog Jira, dalla "🕘 Timeline worklog"
// del Controllo Produzione (v18.230.0). Serve quando un operatore non ha fatto bene le
// transizioni del sottotask (l'automazione Jira crea il worklog all'uscita da IN PROGRESS,
// quindi orari e durata sbagliati finiscono nel worklog).
//
// - Solo admin e responsabile (ruolo letto dall'utente Supabase, non dal client).
// - Scrive con l'account di servizio Jira (JIRA_EMAIL): per correggere worklog creati da
//   altri serve il permesso "Edit All Worklogs" / "Delete All Worklogs" nel progetto.
// - adjustEstimate=leave: la stima residua del ticket non cambia.
// - notifyUsers=false (se Jira lo rifiuta si riprova senza).
// - Orari in ora italiana: data + minuti dalla mezzanotte, convertiti qui in Europe/Rome.
// - "atteso" (started + seconds letti dal client): se il worklog su Jira nel frattempo è
//   cambiato, non si tocca nulla e si risponde 409 (bisogna rileggere).
// - Aggiunta: se il ticket non è assegnato all'operatore, risponde 409 con
//   codice "assegnatario_diverso" a meno di "forza": jira-sync-worklogs trova i ticket per
//   assegnatario, quindi il worklog non comparirebbe nella sua giornata.
// - Ogni scrittura riuscita va in activity_log (prima/dopo), con la service_role.
//
// SECRET: JIRA_BASE_URL, JIRA_EMAIL, JIRA_API_TOKEN (come le altre jira-*),
//         SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (automatici).
//
// Richiesta (POST, JSON):
//   { action: "create" | "update" | "delete",
//     issueKey: "AI029-123",
//     worklogId: "10234",                       // update / delete
//     data: "2026-10-27", inizioMin: 480, durataMin: 450,   // create / update
//     commento: "testo" | undefined,            // undefined = (update) lascia quello attuale
//     atteso: { started, seconds },             // update / delete, facoltativo
//     operatore: "Nome Cognome", email: "op@...", // create: controllo assegnatario; log
//     forza: true }                             // create: salta il controllo assegnatario
// Risposta: { ok: true, prima?, dopo? } | { error, codice? }

import { createClient } from "jsr:@supabase/supabase-js@2";

const JIRA_BASE_URL  = (Deno.env.get("JIRA_BASE_URL")  || "").replace(/\/+$/, "");
const JIRA_EMAIL     =  Deno.env.get("JIRA_EMAIL")     || "";
const JIRA_API_TOKEN =  Deno.env.get("JIRA_API_TOKEN") || "";
const SUPABASE_URL   =  Deno.env.get("SUPABASE_URL") || "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MAX_COMMENTO = 2000;
const TOLLERANZA_FUTURO_MS = 5 * 60000;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

function jiraHeaders(): Record<string, string> {
  return {
    Authorization: "Basic " + btoa(`${JIRA_EMAIL}:${JIRA_API_TOKEN}`),
    Accept: "application/json",
    "Content-Type": "application/json",
  };
}

async function jira(method: string, path: string, body?: unknown): Promise<Response> {
  return fetch(`${JIRA_BASE_URL}${path}`, {
    method,
    headers: jiraHeaders(),
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
    det = (det ? det + " — " : "") + "l'account di servizio Jira non ha il permesso (serve «Edit/Delete All Worklogs» nel progetto)";
  }
  if (res.status === 404) det = (det ? det + " — " : "") + "ticket o worklog non trovato";
  return `${cosa}: HTTP ${res.status}${det ? " · " + det : ""}`;
}

// Scrittura con notifyUsers=false; se Jira rifiuta il parametro (400/403) si riprova senza
async function jiraScrivi(method: string, path: string, body?: unknown): Promise<Response> {
  const sep = path.includes("?") ? "&" : "?";
  const res = await jira(method, `${path}${sep}adjustEstimate=leave&notifyUsers=false`, body);
  if (res.ok || (res.status !== 400 && res.status !== 403)) return res;
  return jira(method, `${path}${sep}adjustEstimate=leave`, body);
}

/* ---------- Orari Europe/Rome ---------- */

const fmtRoma = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Rome", year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
});

// Scostamento di Roma da UTC (minuti) all'istante utcMs
function offsetRoma(utcMs: number): number {
  const p: Record<string, string> = {};
  fmtRoma.formatToParts(new Date(utcMs)).forEach((x) => { p[x.type] = x.value; });
  const comeUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return Math.round((comeUtc - Math.floor(utcMs / 1000) * 1000) / 60000);
}

// data "YYYY-MM-DD" + minuti dalla mezzanotte (ora di Roma) → { started (formato Jira), ms }
function startedRoma(data: string, min: number): { started: string; ms: number } {
  const [y, m, d] = data.split("-").map(Number);
  const locale = Date.UTC(y, m - 1, d, Math.floor(min / 60), min % 60);
  let off = offsetRoma(locale - 60 * 60000);
  off = offsetRoma(locale - off * 60000);
  const ms = locale - off * 60000;
  const a = Math.abs(off);
  const tz = (off >= 0 ? "+" : "-") + String(Math.floor(a / 60)).padStart(2, "0") + String(a % 60).padStart(2, "0");
  const hh = String(Math.floor(min / 60)).padStart(2, "0"), mm = String(min % 60).padStart(2, "0");
  return { started: `${data}T${hh}:${mm}:00.000${tz}`, ms };
}

// "2026-10-27T08:00:00.000+0100" → epoch ms
function msDiStarted(s: string): number {
  return new Date(String(s || "").replace(/([+-]\d{2})(\d{2})$/, "$1:$2")).getTime();
}

/* ---------- Commenti (Atlassian Document Format) ---------- */

function adfText(node: any): string {
  if (!node) return "";
  if (typeof node === "string") return node;
  if (node.type === "text") return node.text || "";
  if (node.type === "hardBreak") return "\n";
  const figli = (Array.isArray(node.content) ? node.content : []).map(adfText);
  return node.type === "doc" ? figli.join("\n") : figli.join("");
}

function adfDoc(testo: string): unknown {
  const righe = testo.split(/\r?\n/);
  const content: any[] = [];
  righe.forEach((r, i) => {
    if (i) content.push({ type: "hardBreak" });
    if (r) content.push({ type: "text", text: r });
  });
  return { type: "doc", version: 1, content: [{ type: "paragraph", content }] };
}

type Wl = { id: string; started: string; seconds: number; commento: string };

function wlDa(j: any): Wl {
  return { id: String(j?.id || ""), started: String(j?.started || ""), seconds: Number(j?.timeSpentSeconds) || 0, commento: adfText(j?.comment).trim() };
}

async function leggiWorklog(issueKey: string, id: string): Promise<Wl> {
  const res = await jira("GET", `/rest/api/3/issue/${encodeURIComponent(issueKey)}/worklog/${encodeURIComponent(id)}`);
  if (!res.ok) throw new Error(await jiraErr(res, "Lettura del worklog"));
  return wlDa(await res.json());
}

// Il worklog su Jira è ancora quello che l'utente ha visto?
function cambiato(prima: Wl, atteso: any): boolean {
  if (!atteso || !atteso.started) return false;
  return msDiStarted(prima.started) !== msDiStarted(String(atteso.started)) ||
    prima.seconds !== Number(atteso.seconds);
}

async function accountIdDi(email: string): Promise<string | null> {
  const res = await jira("GET", `/rest/api/3/user/search?query=${encodeURIComponent(email)}&maxResults=2`);
  if (!res.ok) return null;
  const users = await res.json();
  if (!Array.isArray(users) || !users.length) return null;
  const exact = users.find((u: any) => (u.emailAddress || "").toLowerCase() === email.toLowerCase());
  return (exact || users.find((u: any) => u.active) || users[0])?.accountId || null;
}

/* ---------- Handler ---------- */

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
  if (role !== "admin" && role !== "responsabile") return json({ error: "Solo admin e responsabili possono modificare i worklog" }, 403);

  let p: any;
  try { p = await req.json(); } catch { return json({ error: "JSON non valido" }, 400); }

  const action = String(p?.action || "");
  const issueKey = String(p?.issueKey || "").trim().toUpperCase();
  const worklogId = String(p?.worklogId || "").trim();
  if (!["create", "update", "delete"].includes(action)) return json({ error: "Azione non valida" }, 400);
  if (!/^[A-Z][A-Z0-9_]*-\d+$/.test(issueKey)) return json({ error: "Chiave ticket non valida" }, 400);
  if (action !== "create" && !/^\d+$/.test(worklogId)) return json({ error: "Id worklog non valido" }, 400);

  let nuovo: { started: string; seconds: number; commento?: string } | null = null;
  if (action !== "delete") {
    const data = String(p?.data || "");
    const inizioMin = Number(p?.inizioMin), durataMin = Number(p?.durataMin);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return json({ error: "Data non valida" }, 400);
    if (!Number.isInteger(inizioMin) || inizioMin < 0 || inizioMin > 1439) return json({ error: "Ora di inizio non valida" }, 400);
    if (!Number.isInteger(durataMin) || durataMin < 1 || durataMin > 1440) return json({ error: "Durata non valida" }, 400);
    const { started, ms } = startedRoma(data, inizioMin);
    if (ms + durataMin * 60000 > Date.now() + TOLLERANZA_FUTURO_MS) return json({ error: "Il worklog non può finire nel futuro" }, 400);
    nuovo = { started, seconds: durataMin * 60 };
    if (p?.commento !== undefined && p?.commento !== null) {
      const c = String(p.commento).trim();
      if (c.length > MAX_COMMENTO) return json({ error: `Commento troppo lungo (max ${MAX_COMMENTO} caratteri)` }, 400);
      nuovo.commento = c;
    }
  }

  const base = `/rest/api/3/issue/${encodeURIComponent(issueKey)}/worklog`;
  let prima: Wl | null = null, dopo: Wl | null = null;

  try {
    if (action === "create") {
      const email = String(p?.email || "").trim();
      if (email && !p?.forza) {
        const [accId, resIss] = await Promise.all([
          accountIdDi(email),
          jira("GET", `/rest/api/3/issue/${encodeURIComponent(issueKey)}?fields=assignee`),
        ]);
        if (!resIss.ok) return json({ error: await jiraErr(resIss, "Lettura del ticket") }, 502);
        const iss = await resIss.json();
        const ass = iss?.fields?.assignee;
        if (accId && (!ass || ass.accountId !== accId)) {
          return json({
            error: `Il ticket ${issueKey} è assegnato a ${ass?.displayName || "nessuno"}, non all'operatore: il worklog non comparirebbe nella sua giornata.`,
            codice: "assegnatario_diverso", assegnatario: ass?.displayName || "",
          }, 409);
        }
      }
      const body: Record<string, unknown> = { started: nuovo!.started, timeSpentSeconds: nuovo!.seconds };
      if (nuovo!.commento) body.comment = adfDoc(nuovo!.commento);
      const res = await jiraScrivi("POST", base, body);
      if (!res.ok) return json({ error: await jiraErr(res, "Creazione del worklog") }, 502);
      dopo = wlDa(await res.json());
    } else {
      prima = await leggiWorklog(issueKey, worklogId);
      if (cambiato(prima, p?.atteso)) {
        return json({ error: "Il worklog è stato modificato su Jira nel frattempo: rileggi da Jira e riprova.", codice: "cambiato", prima }, 409);
      }
      if (action === "update") {
        const body: Record<string, unknown> = { started: nuovo!.started, timeSpentSeconds: nuovo!.seconds };
        if (nuovo!.commento !== undefined) body.comment = adfDoc(nuovo!.commento);
        const res = await jiraScrivi("PUT", `${base}/${encodeURIComponent(worklogId)}`, body);
        if (!res.ok) return json({ error: await jiraErr(res, "Modifica del worklog") }, 502);
        dopo = wlDa(await res.json());
      } else {
        const res = await jiraScrivi("DELETE", `${base}/${encodeURIComponent(worklogId)}`);
        if (!res.ok) return json({ error: await jiraErr(res, "Eliminazione del worklog") }, 502);
      }
    }
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 502);
  }

  const azioni: Record<string, string> = { create: "aggiunto", update: "modificato", delete: "eliminato" };
  try {
    await admin.from("activity_log").insert({
      user_email: callerData.user.email,
      action: `Worklog Jira ${azioni[action]}`,
      details: { issueKey, worklogId: worklogId || dopo?.id || "", operatore: String(p?.operatore || ""), prima, dopo },
    });
  } catch { /* il log non deve far fallire la modifica già fatta */ }

  return json({ ok: true, prima, dopo });
});
