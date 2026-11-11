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
// - Autore (v18.237.0): le API Jira non permettono di scegliere l'autore di un worklog (è
//   sempre l'account che chiama). Con il secret TEMPO_API_TOKEN si passa da Tempo, che accetta
//   authorAccountId: un worklog aggiunto è intestato all'ASSEGNATARIO del sottotask (in
//   mancanza, all'operatore); un worklog corretto che risulta dell'account di servizio (cioè
//   inserito dall'app prima della v18.237.0) viene re-intestato all'assegnatario. Gli altri
//   worklog corretti tengono il loro autore (PUT Jira come prima). Senza token: tutto via Jira.
//   Tempo converte l'ora in UTC con il fuso dell'autore: se il worklog letto da Jira non parte
//   all'ora chiesta (fuso diverso da Roma) la risposta porta un "avviso".
// - Eliminazione (v18.254.0): con il token Tempo si elimina da Tempo, che toglie anche il
//   worklog Jira; prima si eliminava da Jira e il worklog restava nel timesheet di Tempo.
//   { action: "pulisciTempo", dryRun?: false } (solo admin) toglie da Tempo quelli rimasti.
//
// SECRET: JIRA_BASE_URL, JIRA_EMAIL, JIRA_API_TOKEN (come le altre jira-*),
//         TEMPO_API_TOKEN (facoltativo, token Tempo che può registrare ore per altri utenti;
//           in alternativa in Vault come 'tempo_api_token', letto con tempo_get_api_token()),
//         TEMPO_API_URL (facoltativo, default https://api.tempo.io),
//         SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (automatici).
//
// - Sistema giornata (v18.254.0, dal badge Stato del Controllo Produzione):
//   "giornata" legge stato, assegnatario e worklog del sottotask; "stato" lo porta in IN PENDING
//   o DONE con i passaggi intermedi (TO DO → DONE diretto non esiste, IN PENDING → DONE passa da
//   IN PROGRESS), rimette l'assegnatario dopo ogni transizione (un'automazione Jira assegna il
//   sottotask a chi lo porta in IN PROGRESS) ed elimina i worklog che l'automazione Jira crea
//   all'uscita da IN PROGRESS: le ore vere le scrive poi il client con create/update/delete.
//   DONE senza Actual Production (> 0) Jira lo rifiuta: il sottotask si ferma in IN PENDING.
//
// Richiesta (POST, JSON):
//   { action: "giornata", issueKey }
//     → { ok, key, summary, stato, categoria, assegnatario: {accountId, nome} | null, worklogs: Wl[] }
//   { action: "stato", issueKey, voluto: "IN PENDING" | "DONE", atteso: { stato }, operatore }
//     → { ok, prima, dopo, passi: string[], rimossi: Wl[], avviso? }  (409 codice "cambiato" se
//       lo stato su Jira non è più "atteso.stato")
//   { action: "create" | "update" | "delete",
//     issueKey: "AI029-123",
//     worklogId: "10234",                       // update / delete
//     data: "2026-10-27", inizioMin: 480, durataMin: 450,   // create / update
//     commento: "testo" | undefined,            // undefined = (update) lascia quello attuale
//     atteso: { started, seconds },             // update / delete, facoltativo
//     operatore: "Nome Cognome", email: "op@...", // create: controllo assegnatario; log
//     forza: true }                             // create: salta il controllo assegnatario
// Risposta: { ok: true, prima?, dopo?, tempo?, avviso? } | { error, codice? }
//   (prima/dopo portano anche autore e autoreId; tempo: true se scritto tramite Tempo)

import { createClient } from "npm:@supabase/supabase-js@2";

const JIRA_BASE_URL  = (Deno.env.get("JIRA_BASE_URL")  || "").replace(/\/+$/, "");
const JIRA_EMAIL     =  Deno.env.get("JIRA_EMAIL")     || "";
const JIRA_API_TOKEN =  Deno.env.get("JIRA_API_TOKEN") || "";
// Token Tempo: secret d'ambiente, altrimenti Vault ('tempo_api_token', letto nel handler)
let TEMPO_API_TOKEN = Deno.env.get("TEMPO_API_TOKEN") || "";
const TEMPO_API_URL  = (Deno.env.get("TEMPO_API_URL") || "https://api.tempo.io").replace(/\/+$/, "");
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
async function jiraErr(res: Response, cosa: string, permesso = "«Edit/Delete All Worklogs»"): Promise<string> {
  let det = "";
  try {
    const j = await res.json();
    det = [...(j.errorMessages || []), ...Object.values(j.errors || {})].join(" ");
  } catch { /* corpo vuoto */ }
  if (res.status === 403 || res.status === 401) {
    det = (det ? det + " — " : "") + `l'account di servizio Jira non ha il permesso (serve ${permesso} nel progetto)`;
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

type Wl = { id: string; started: string; seconds: number; commento: string; autore: string; autoreId: string; creato?: string };

function wlDa(j: any): Wl {
  return {
    id: String(j?.id || ""), started: String(j?.started || ""), seconds: Number(j?.timeSpentSeconds) || 0,
    commento: adfText(j?.comment).trim(),
    autore: String(j?.author?.displayName || ""), autoreId: String(j?.author?.accountId || ""),
    creato: String(j?.created || ""),
  };
}

// Tutti i worklog del ticket
async function leggiWorklogTutti(issueKey: string): Promise<Wl[]> {
  const res = await jira("GET", `/rest/api/3/issue/${encodeURIComponent(issueKey)}/worklog?maxResults=5000`);
  if (!res.ok) throw new Error(await jiraErr(res, "Lettura dei worklog"));
  const j = await res.json();
  return (Array.isArray(j?.worklogs) ? j.worklogs : []).map(wlDa);
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

// Account di servizio (JIRA_EMAIL): i worklog che risultano suoi li ha inseriti l'app
let _mioAccountId: string | null = null;
async function mioAccountId(): Promise<string> {
  if (_mioAccountId === null) {
    const res = await jira("GET", "/rest/api/3/myself");
    _mioAccountId = res.ok ? String((await res.json())?.accountId || "") : "";
  }
  return _mioAccountId;
}

type Ticket = { id: number; assegnatario: { accountId: string; displayName: string } | null; residuoSec: number | null };

// Id numerico, assegnatario e stima residua del ticket (per Tempo e per il controllo assegnatario)
async function leggiTicket(issueKey: string): Promise<Ticket> {
  const res = await jira("GET", `/rest/api/3/issue/${encodeURIComponent(issueKey)}?fields=assignee,timetracking`);
  if (!res.ok) throw new Error(await jiraErr(res, "Lettura del ticket"));
  const j = await res.json();
  const a = j?.fields?.assignee;
  const r = j?.fields?.timetracking?.remainingEstimateSeconds;
  return {
    id: Number(j?.id) || 0,
    assegnatario: a?.accountId ? { accountId: String(a.accountId), displayName: String(a.displayName || "") } : null,
    residuoSec: typeof r === "number" ? r : null,
  };
}

/* ---------- Tempo (solo con TEMPO_API_TOKEN) ---------- */

async function tempo(method: string, path: string, body?: unknown): Promise<Response> {
  return fetch(`${TEMPO_API_URL}/4${path}`, {
    method,
    headers: { Authorization: `Bearer ${TEMPO_API_TOKEN}`, Accept: "application/json", "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function tempoErr(res: Response, cosa: string): Promise<string> {
  let det = "";
  try {
    const j = await res.json();
    det = (Array.isArray(j?.errors) ? j.errors.map((e: any) => e?.message || "") : [j?.message || ""]).filter(Boolean).join(" ");
  } catch { /* corpo vuoto */ }
  if (res.status === 401 || res.status === 403) {
    det = (det ? det + " — " : "") + "il token Tempo non è valido o non può registrare ore per altri utenti";
  }
  return `${cosa} (Tempo): HTTP ${res.status}${det ? " · " + det : ""}`;
}

// Id worklog Jira ↔ Tempo (null se Tempo non lo conosce)
async function mappaId(verso: "jira-to-tempo" | "tempo-to-jira", id: string | number): Promise<string | null> {
  const campo = verso === "jira-to-tempo" ? "jiraWorklogIds" : "tempoWorklogIds";
  const res = await tempo("POST", `/worklogs/${verso}`, { [campo]: [Number(id)] });
  if (!res.ok) throw new Error(await tempoErr(res, "Conversione id worklog"));
  const r = (await res.json())?.results?.[0];
  const v = verso === "jira-to-tempo" ? r?.tempoWorklogId : r?.jiraWorklogId;
  return v ? String(v) : null;
}

function oraTempo(min: number): string {
  return String(Math.floor(min / 60)).padStart(2, "0") + ":" + String(min % 60).padStart(2, "0") + ":00";
}

// Con Tempo si elimina da Tempo (che toglie anche il worklog Jira): eliminato solo da Jira,
// il worklog resta nel timesheet di Tempo e conta nel limite giornaliero di 12 h (visto il
// 9/11/2026 sui worklog fornitori, l'11/11/2026 sulla Timeline worklog).
// true = eliminato da Tempo; false = niente token o Tempo non conosce il worklog (→ Jira).
async function eliminaDaTempo(id: string): Promise<boolean> {
  if (!TEMPO_API_TOKEN) return false;
  const tid = await mappaId("jira-to-tempo", id);
  if (!tid) return false;
  const r = await tempo("DELETE", `/worklogs/${encodeURIComponent(tid)}`);
  if (!r.ok && r.status !== 404) throw new Error(await tempoErr(r, `Eliminazione del worklog ${id}`));
  return true;
}

async function eliminaWl(issueKey: string, id: string): Promise<void> {
  try {
    if (await eliminaDaTempo(id)) return;
  } catch { /* si ripiega su Jira */ }
  const res = await jiraScrivi("DELETE", `/rest/api/3/issue/${encodeURIComponent(issueKey)}/worklog/${encodeURIComponent(id)}`);
  if (!res.ok && res.status !== 404) throw new Error(await jiraErr(res, `Eliminazione del worklog ${id}`));
}

/* ---------- Stato del sottotask (azione "stato") ---------- */

// Flusso dei sottotask: CREATED → TO DO → IN PROGRESS ⇄ IN PENDING → DONE
const ORDINE = [/^created$/i, /^to\s*do$/i, /^in\s*progress$/i, /pending/i, /^done$/i];
const IN_PROGRESS = 2, IN_PENDING = 3, DONE = 4;
function rango(nome: string): number { return ORDINE.findIndex((r) => r.test(String(nome || "").trim())); }
function stessoStato(a: string, b: string): boolean { return String(a || "").trim().toLowerCase() === String(b || "").trim().toLowerCase(); }

const CAMPO_PRODUZIONE = /actual\s*production|kpi.?quantit\S*\s*lavorat/i;   // non «KPI_Quantità target»
const MSG_PRODUZIONE = "Jira chiede l'Actual Production per DONE: il sottotask resta in IN PENDING. " +
  "Scrivi il Km/Cad della riga e usa «🔄 Sincronizza», poi chiudilo di nuovo.";
const ATTESA_AUTOMAZIONE_MIN_MS = 10000;   // dopo l'ultima uscita da IN PROGRESS, prima di cercare i worklog nuovi
const ATTESA_AUTOMAZIONE_MAX_MS = 20000;
const PASSO_ATTESA_MS = 2500;

function attendi(ms: number): Promise<void> { return new Promise((r) => setTimeout(r, ms)); }

type StatoTicket = { stato: string; categoria: string; summary: string; assegnatario: { accountId: string; nome: string } | null };

async function leggiStato(issueKey: string): Promise<StatoTicket> {
  const res = await jira("GET", `/rest/api/3/issue/${encodeURIComponent(issueKey)}?fields=status,assignee,summary`);
  if (!res.ok) throw new Error(await jiraErr(res, "Lettura del sottotask", "«Browse Projects»"));
  const f = (await res.json())?.fields || {};
  return {
    stato: String(f?.status?.name || ""),
    categoria: String(f?.status?.statusCategory?.key || ""),
    summary: String(f?.summary || ""),
    assegnatario: f?.assignee?.accountId ? { accountId: String(f.assignee.accountId), nome: String(f.assignee.displayName || "") } : null,
  };
}

// La produzione del sottotask è compilata (> 0)? Il validatore verso DONE la vuole. Il campo si
// cerca per nome fra tutti quelli del ticket (non è sullo schermo di modifica del sottotask).
async function produzioneCompilata(issueKey: string): Promise<boolean> {
  const r = await jira("GET", `/rest/api/3/issue/${encodeURIComponent(issueKey)}?fields=*all&expand=names`);
  if (!r.ok) return true;   // non si sa: si prova la transizione
  const j = await r.json();
  const prod = Object.entries(j?.names || {}).filter(([, n]) => CAMPO_PRODUZIONE.test(String(n || ""))).map(([id]) => id);
  if (!prod.length) return true;
  return prod.some((id) => Number(j?.fields?.[id]) > 0);
}

type EsitoStato = { prima: string; dopo: string; passi: string[]; usciteDaInProgress: number; errore?: string; avviso?: string };

// Porta il sottotask da "attuale" a "voluto" (IN PENDING o DONE) un passo alla volta, rimettendo
// l'assegnatario dopo ogni transizione. Stessa logica di allineaStato in jira-fornitori-worklog.
async function transita(issueKey: string, attuale: string, voluto: string, assegnatario: string): Promise<EsitoStato> {
  const out: EsitoStato = { prima: attuale, dopo: attuale, passi: [], usciteDaInProgress: 0 };
  if (rango(voluto) === DONE && !stessoStato(attuale, voluto) && !(await produzioneCompilata(issueKey))) {
    // Senza produzione DONE fallirebbe (e il giro da IN PROGRESS lascerebbe un worklog in più)
    out.avviso = MSG_PRODUZIONE;
    voluto = "IN PENDING";
    if (rango(attuale) === IN_PENDING) return out;
  }
  let cur = attuale;
  for (let i = 0; i < 6 && !(rango(cur) === rango(voluto) && rango(cur) >= 0); i++) {
    const res = await jira("GET", `/rest/api/3/issue/${encodeURIComponent(issueKey)}/transitions`);
    if (!res.ok) { out.errore = await jiraErr(res, "Lettura delle transizioni", "«Transition Issues»"); break; }
    const trans: any[] = (await res.json())?.transitions || [];
    const verso = (t: any) => String(t?.to?.name || "");
    const rA = rango(cur), rV = rango(voluto);
    let t = trans.find((x) => rango(verso(x)) === rV);
    if (!t) {
      if (rA < 0) { out.errore = `stato «${cur}» non previsto`; break; }
      if (rV > rA) {
        // Avanti: da TO DO si passa sempre da IN PROGRESS
        t = (rA < IN_PROGRESS && trans.find((x) => rango(verso(x)) === IN_PROGRESS))
          || trans.find((x) => { const r = rango(verso(x)); return r > rA && r < rV; });
      } else if (rA > IN_PROGRESS) {
        t = trans.find((x) => rango(verso(x)) === IN_PROGRESS);   // indietro: si riapre da IN PROGRESS
      }
      // Nessun passo in avanti (es. IN PENDING → DONE non c'è): si ripassa da IN PROGRESS
      if (!t && rA !== IN_PROGRESS) t = trans.find((x) => rango(verso(x)) === IN_PROGRESS);
    }
    if (!t) { out.errore = `nessuna transizione da «${cur}» verso «${voluto}»`; break; }
    const r2 = await jira("POST", `/rest/api/3/issue/${encodeURIComponent(issueKey)}/transitions`, { transition: { id: t.id } });
    if (!r2.ok) {
      const err = await jiraErr(r2, `Transizione a ${verso(t)}`, "«Transition Issues»");
      if (!(rango(verso(t)) === DONE && CAMPO_PRODUZIONE.test(err))) { out.errore = err; break; }
      // DONE rifiutato per la produzione: non si resta IN PROGRESS (risulterebbe al lavoro)
      out.avviso = MSG_PRODUZIONE;
      if (rA !== IN_PROGRESS) break;
      const p = trans.find((x) => rango(verso(x)) === IN_PENDING);
      if (!p) { out.errore = err; break; }
      const r3 = await jira("POST", `/rest/api/3/issue/${encodeURIComponent(issueKey)}/transitions`, { transition: { id: p.id } });
      if (!r3.ok) { out.errore = await jiraErr(r3, `Transizione a ${verso(p)}`, "«Transition Issues»"); break; }
      t = p;
      voluto = verso(p);
    }
    if (rA === IN_PROGRESS) out.usciteDaInProgress++;
    out.passi.push(`${cur} → ${verso(t)}`);
    cur = verso(t);
    // L'automazione assegna il sottotask a chi lo porta in IN PROGRESS: si rimette com'era
    if (assegnatario) {
      const ra = await jira("GET", `/rest/api/3/issue/${encodeURIComponent(issueKey)}?fields=assignee`);
      const ora = ra.ok ? String((await ra.json())?.fields?.assignee?.accountId || "") : assegnatario;
      if (ora !== assegnatario) {
        const rr = await jira("PUT", `/rest/api/3/issue/${encodeURIComponent(issueKey)}/assignee`, { accountId: assegnatario });
        if (!rr.ok) { out.errore = await jiraErr(rr, "Riassegnazione all'operatore", "«Assign Issues»"); break; }
      }
    }
  }
  out.dopo = cur;
  return out;
}

// Worklog creati dall'automazione Jira alle uscite da IN PROGRESS (quelli nuovi rispetto a
// "prima"): si aspettano e si eliminano. Le ore vere le scrive poi il client.
async function togliWorklogAutomazione(issueKey: string, primaIds: Set<string>, uscite: number): Promise<{ rimossi: Wl[]; avviso?: string }> {
  const t0 = Date.now();
  let nuovi: Wl[] = [];
  await attendi(Math.min(ATTESA_AUTOMAZIONE_MIN_MS, ATTESA_AUTOMAZIONE_MAX_MS));
  for (;;) {
    nuovi = (await leggiWorklogTutti(issueKey)).filter((w) => w.id && !primaIds.has(w.id));
    if (nuovi.length >= uscite || Date.now() - t0 + PASSO_ATTESA_MS > ATTESA_AUTOMAZIONE_MAX_MS) break;
    await attendi(PASSO_ATTESA_MS);
  }
  const rimossi: Wl[] = [], errori: string[] = [];
  for (const w of nuovi) {
    try { await eliminaWl(issueKey, w.id); rimossi.push(w); }
    catch (e) { errori.push(String((e as Error)?.message || e)); }
  }
  let avviso: string | undefined;
  if (errori.length) avviso = "Worklog dell'automazione non eliminati: " + errori.join(" · ") + ". Eliminali dalla Timeline worklog.";
  else if (nuovi.length < uscite) {
    avviso = "Jira non ha ancora creato tutti i worklog dell'automazione: se tra poco ne compare uno nuovo su questo sottotask, eliminalo dalla Timeline worklog.";
  }
  return { rimossi, avviso };
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
  if (!TEMPO_API_TOKEN) {
    const { data: tok } = await admin.rpc("tempo_get_api_token");
    TEMPO_API_TOKEN = typeof tok === "string" ? tok.trim() : "";
  }

  let p: any;
  try { p = await req.json(); } catch { return json({ error: "JSON non valido" }, 400); }

  const action = String(p?.action || "");
  const issueKey = String(p?.issueKey || "").trim().toUpperCase();
  const worklogId = String(p?.worklogId || "").trim();
  if (!["create", "update", "delete", "giornata", "stato", "pulisciTempo"].includes(action)) return json({ error: "Azione non valida" }, 400);

  // Pulizia una tantum (solo admin): worklog eliminati dalla Timeline prima della correzione
  // (solo da Jira) e rimasti nel timesheet di Tempo. Si toccano solo i worklog Tempo senza più
  // un worklog Jira che corrispondono a un'eliminazione registrata in activity_log (stesso
  // ticket e stesso id Jira, oppure stessi giorno, ora di inizio e durata). dryRun di default.
  if (action === "pulisciTempo") {
    if (role !== "admin") return json({ error: "Solo gli admin possono fare la pulizia" }, 403);
    if (!TEMPO_API_TOKEN) return json({ error: "Token Tempo non configurato" }, 500);
    const dryRun = p?.dryRun !== false;
    const { data: righe, error: errLog } = await admin.from("activity_log")
      .select("created_at, details").eq("action", "Worklog Jira eliminato").order("created_at").limit(5000);
    if (errLog) return json({ error: "Lettura di activity_log: " + errLog.message }, 500);
    type Elim = { id: string; data: string; ora: string; seconds: number; operatore: string };
    const perTicket = new Map<string, Elim[]>();
    for (const r of righe || []) {
      const d: any = r.details || {};
      if (d.tempo === true || !d.issueKey || !d.prima?.started) continue;
      const st = String(d.prima.started);
      const e: Elim = { id: String(d.worklogId || ""), data: st.slice(0, 10), ora: st.slice(11, 16), seconds: Number(d.prima.seconds) || 0, operatore: String(d.operatore || "") };
      const k = String(d.issueKey).toUpperCase();
      if (!perTicket.has(k)) perTicket.set(k, []);
      perTicket.get(k)!.push(e);
    }
    const trovati: any[] = [], errori: string[] = [];
    let eliminati = 0;
    for (const [key, elim] of perTicket) {
      try {
        const tk = await leggiTicket(key);
        const vivi = new Set((await leggiWorklogTutti(key)).map((w) => w.id));
        const res = await tempo("GET", `/worklogs/issue/${tk.id}?limit=1000`);
        if (!res.ok) { errori.push(await tempoErr(res, `Lettura worklog di ${key}`)); continue; }
        const tws: any[] = (await res.json())?.results || [];
        if (!tws.length) continue;
        const m = await tempo("POST", "/worklogs/tempo-to-jira", { tempoWorklogIds: tws.map((w) => Number(w?.tempoWorklogId)).filter(Boolean) });
        if (!m.ok) { errori.push(await tempoErr(m, `Conversione id di ${key}`)); continue; }
        const jidDi = new Map<string, string>();
        for (const x of ((await m.json())?.results || [])) jidDi.set(String(x?.tempoWorklogId), x?.jiraWorklogId ? String(x.jiraWorklogId) : "");
        for (const w of tws) {
          const tid = String(w?.tempoWorklogId || "");
          const jid = jidDi.get(tid) || "";
          if (!tid || (jid && vivi.has(jid))) continue;
          const sec = Number(w?.timeSpentSeconds) || 0, data = String(w?.startDate || ""), ora = String(w?.startTime || "").slice(0, 5);
          const e = elim.find((x) => (jid && x.id === jid) || (x.data === data && x.ora === ora && x.seconds === sec));
          if (!e) continue;
          const voce: any = { issueKey: key, tempoWorklogId: tid, jiraWorklogId: jid || e.id, data, ora, seconds: sec, operatore: e.operatore };
          if (!dryRun) {
            const dr = await tempo("DELETE", `/worklogs/${encodeURIComponent(tid)}`);
            if (dr.ok || dr.status === 404) { voce.eliminato = true; eliminati++; }
            else errori.push(await tempoErr(dr, `Eliminazione ${key} ${data} ${ora}`));
          }
          trovati.push(voce);
        }
      } catch (e) {
        errori.push(`${key}: ${String((e as Error)?.message || e)}`);
      }
    }
    if (!dryRun && eliminati) {
      try {
        await admin.from("activity_log").insert({
          user_email: callerData.user.email, action: "Worklog Tempo orfani eliminati",
          details: { eliminati: trovati.filter((v) => v.eliminato), errori },
        });
      } catch { /* solo log */ }
    }
    return json({ ok: true, dryRun, ticket: perTicket.size, trovati, eliminati, errori });
  }

  if (!/^[A-Z][A-Z0-9_]*-\d+$/.test(issueKey)) return json({ error: "Chiave ticket non valida" }, 400);

  // Sistema giornata: lettura di stato e worklog del sottotask (nessuna scrittura)
  if (action === "giornata") {
    try {
      const [st, wls] = await Promise.all([leggiStato(issueKey), leggiWorklogTutti(issueKey)]);
      return json({ ok: true, key: issueKey, ...st, worklogs: wls });
    } catch (e) {
      return json({ error: String((e as Error)?.message || e) }, 502);
    }
  }

  // Sistema giornata: cambio di stato (IN PENDING / DONE) + pulizia dei worklog dell'automazione
  if (action === "stato") {
    const voluto = String(p?.voluto || "").trim();
    if (rango(voluto) !== IN_PENDING && rango(voluto) !== DONE) return json({ error: "Stato richiesto non valido (IN PENDING o DONE)" }, 400);
    let esito: EsitoStato = { prima: "", dopo: "", passi: [], usciteDaInProgress: 0 };
    let rimossi: Wl[] = [];
    const avvisi: string[] = [];
    try {
      const st = await leggiStato(issueKey);
      if (p?.atteso?.stato !== undefined && !stessoStato(st.stato, String(p.atteso.stato))) {
        return json({ error: `Su Jira ${issueKey} è passato a «${st.stato}» nel frattempo: riapri la finestra e riprova.`, codice: "cambiato", stato: st.stato }, 409);
      }
      if (rango(st.stato) < 0) return json({ error: `Stato «${st.stato}» non previsto dal flusso dei sottotask` }, 400);
      if (rango(st.stato) > rango(voluto)) return json({ error: `${issueKey} è già «${st.stato}»: da qui non si riapre` }, 400);
      const primaIds = new Set((await leggiWorklogTutti(issueKey)).map((w) => w.id));
      esito = await transita(issueKey, st.stato, voluto, st.assegnatario?.accountId || "");
      if (esito.avviso) avvisi.push(esito.avviso);
      if (esito.usciteDaInProgress) {
        const pul = await togliWorklogAutomazione(issueKey, primaIds, esito.usciteDaInProgress);
        rimossi = pul.rimossi;
        if (pul.avviso) avvisi.push(pul.avviso);
      }
    } catch (e) {
      return json({ error: String((e as Error)?.message || e) }, 502);
    }
    if (esito.passi.length || rimossi.length) {
      try {
        await admin.from("activity_log").insert({
          user_email: callerData.user.email,
          action: "Stato sottotask Jira cambiato",
          details: { issueKey, operatore: String(p?.operatore || ""), prima: esito.prima, dopo: esito.dopo, passi: esito.passi, worklogAutomazioneEliminati: rimossi, errore: esito.errore || undefined },
        });
      } catch { /* il log non deve far fallire la modifica già fatta */ }
    }
    if (esito.errore) {
      return json({ error: esito.errore, prima: esito.prima, dopo: esito.dopo, passi: esito.passi, rimossi, avviso: avvisi.join(" ") || undefined }, 502);
    }
    return json({ ok: true, prima: esito.prima, dopo: esito.dopo, passi: esito.passi, rimossi, avviso: avvisi.join(" ") || undefined });
  }
  if (action !== "create" && !/^\d+$/.test(worklogId)) return json({ error: "Id worklog non valido" }, 400);

  let nuovo: { started: string; ms: number; seconds: number; data: string; inizioMin: number; commento?: string } | null = null;
  if (action !== "delete") {
    const data = String(p?.data || "");
    const inizioMin = Number(p?.inizioMin), durataMin = Number(p?.durataMin);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return json({ error: "Data non valida" }, 400);
    if (!Number.isInteger(inizioMin) || inizioMin < 0 || inizioMin > 1439) return json({ error: "Ora di inizio non valida" }, 400);
    if (!Number.isInteger(durataMin) || durataMin < 1 || durataMin > 1440) return json({ error: "Durata non valida" }, 400);
    const { started, ms } = startedRoma(data, inizioMin);
    if (ms + durataMin * 60000 > Date.now() + TOLLERANZA_FUTURO_MS) return json({ error: "Il worklog non può finire nel futuro" }, 400);
    nuovo = { started, ms, seconds: durataMin * 60, data, inizioMin };
    if (p?.commento !== undefined && p?.commento !== null) {
      const c = String(p.commento).trim();
      if (c.length > MAX_COMMENTO) return json({ error: `Commento troppo lungo (max ${MAX_COMMENTO} caratteri)` }, 400);
      nuovo.commento = c;
    }
  }

  const base = `/rest/api/3/issue/${encodeURIComponent(issueKey)}/worklog`;
  let prima: Wl | null = null, dopo: Wl | null = null, viaTempo = false, avviso = "";

  // Scrittura tramite Tempo con l'autore indicato; ritorna il worklog Jira risultante
  const scriviTempo = async (tk: Ticket, autoreId: string, tempoId: string | null, commento: string | undefined): Promise<Wl> => {
    const body: Record<string, unknown> = {
      authorAccountId: autoreId, startDate: nuovo!.data, startTime: oraTempo(nuovo!.inizioMin), timeSpentSeconds: nuovo!.seconds,
    };
    if (!tempoId) body.issueId = tk.id;
    if (commento) body.description = commento;
    if (tk.residuoSec !== null) body.remainingEstimateSeconds = tk.residuoSec;   // stima residua invariata
    const res = await tempo(tempoId ? "PUT" : "POST", tempoId ? `/worklogs/${encodeURIComponent(tempoId)}` : "/worklogs", body);
    if (!res.ok) throw new Error(await tempoErr(res, tempoId ? "Modifica del worklog" : "Creazione del worklog"));
    const tw = await res.json().catch(() => ({}));
    viaTempo = true;
    // Da qui la scrittura è fatta: un errore nella rilettura diventa un avviso, non un errore
    const scritto: Wl = { id: "", started: nuovo!.started, seconds: nuovo!.seconds, commento: commento || "", autore: "", autoreId };
    let w: Wl;
    try {
      // Cambiando autore Tempo può ricreare il worklog su Jira con un altro id: si rilegge da lì
      const jid = tw?.tempoWorklogId ? await mappaId("tempo-to-jira", tw.tempoWorklogId) : null;
      if (!jid) { avviso = "Worklog scritto su Tempo ma non ancora visibile su Jira: rileggi tra poco."; return scritto; }
      w = await leggiWorklog(issueKey, jid);
    } catch (e) {
      avviso = "Worklog scritto su Tempo, ma la rilettura da Jira non è riuscita: " + String((e as Error)?.message || e);
      return scritto;
    }
    if (Math.abs(msDiStarted(w.started) - nuovo!.ms) >= 60000) {
      avviso = `Su Jira il worklog parte alle ${w.started.slice(11, 16)} invece che alle ${oraTempo(nuovo!.inizioMin).slice(0, 5)}: ` +
        "Tempo usa il fuso orario del profilo Atlassian dell'autore. Correggi l'orario dalla timeline.";
    }
    return w;
  };

  try {
    if (action === "create") {
      const email = String(p?.email || "").trim();
      const controlla = !!email && !p?.forza;
      let tk: Ticket | null = null, accOp: string | null = null;
      if (TEMPO_API_TOKEN || controlla) {
        [tk, accOp] = await Promise.all([leggiTicket(issueKey), email ? accountIdDi(email) : Promise.resolve(null)]);
      }
      const ass = tk?.assegnatario || null;
      if (controlla && accOp && (!ass || ass.accountId !== accOp)) {
        return json({
          error: `Il ticket ${issueKey} è assegnato a ${ass?.displayName || "nessuno"}, non all'operatore: il worklog non comparirebbe nella sua giornata.`,
          codice: "assegnatario_diverso", assegnatario: ass?.displayName || "",
        }, 409);
      }
      const autoreId = ass?.accountId || accOp || "";
      if (TEMPO_API_TOKEN && tk && autoreId) {
        dopo = await scriviTempo(tk, autoreId, null, nuovo!.commento);
      } else {
        const body: Record<string, unknown> = { started: nuovo!.started, timeSpentSeconds: nuovo!.seconds };
        if (nuovo!.commento) body.comment = adfDoc(nuovo!.commento);
        const res = await jiraScrivi("POST", base, body);
        if (!res.ok) return json({ error: await jiraErr(res, "Creazione del worklog") }, 502);
        dopo = wlDa(await res.json());
      }
    } else {
      prima = await leggiWorklog(issueKey, worklogId);
      if (cambiato(prima, p?.atteso)) {
        return json({ error: "Il worklog è stato modificato su Jira nel frattempo: rileggi da Jira e riprova.", codice: "cambiato", prima }, 409);
      }
      if (action === "update") {
        // Worklog inserito dall'app a nome dell'account di servizio → re-intestato all'assegnatario
        let tk: Ticket | null = null, tempoId: string | null = null;
        if (TEMPO_API_TOKEN && prima.autoreId && prima.autoreId === await mioAccountId()) {
          tk = await leggiTicket(issueKey);
          if (tk.assegnatario && tk.assegnatario.accountId !== prima.autoreId) tempoId = await mappaId("jira-to-tempo", worklogId);
        }
        if (tk && tempoId) {
          dopo = await scriviTempo(tk, tk.assegnatario!.accountId, tempoId, nuovo!.commento !== undefined ? nuovo!.commento : prima.commento);
        } else {
          const body: Record<string, unknown> = { started: nuovo!.started, timeSpentSeconds: nuovo!.seconds };
          if (nuovo!.commento !== undefined) body.comment = adfDoc(nuovo!.commento);
          const res = await jiraScrivi("PUT", `${base}/${encodeURIComponent(worklogId)}`, body);
          if (!res.ok) return json({ error: await jiraErr(res, "Modifica del worklog") }, 502);
          dopo = wlDa(await res.json());
        }
      } else if (await eliminaDaTempo(worklogId)) {
        // Niente ripiego su Jira se Tempo dà errore: il worklog resterebbe in Tempo
        viaTempo = true;
        // Tempo toglie il worklog da Jira in modo asincrono: si aspetta qualche secondo
        let ancora = true;
        for (let i = 0; i < 4 && ancora; i++) {
          await attendi(1500);
          const r = await jira("GET", `${base}/${encodeURIComponent(worklogId)}`);
          ancora = r.ok;
        }
        if (ancora) avviso = "Worklog eliminato da Tempo ma ancora visibile su Jira: rileggi tra poco.";
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
      details: { issueKey, worklogId: worklogId || dopo?.id || "", operatore: String(p?.operatore || ""), prima, dopo, tempo: viaTempo },
    });
  } catch { /* il log non deve far fallire la modifica già fatta */ }

  return json({ ok: true, prima, dopo, tempo: viaTempo, avviso: avviso || undefined });
});
