// supabase/functions/jira-fornitori-worklog/index.ts
//
// Edge Function (v18.251.0): i dipendenti dei fornitori esterni con email (state.fornitori,
// chiave core 'fornitori') non usano Jira, ma hanno i loro sottotask giornalieri. Il loro
// lavoro è quello del collega Eagle con cui sono in squadra: per ogni sottotask di un
// dipendente fornitore questa funzione
//   1. trova il SOTTOTASK SORGENTE: stesso giorno, stessa commessa, stesso cantiere, di un
//      operatore interno della stessa squadra in Griglia (prima chi ha la stessa attività,
//      poi il primo della squadra; scelta manuale in fornitori_worklog_sorgente);
//   2. porta il sottotask del fornitore nello STATO del sorgente (TO DO → IN PROGRESS →
//      IN PENDING/DONE: Jira non permette TO DO → DONE diretto, si passa da IN PROGRESS);
//   3. rende i suoi WORKLOG identici a quelli del sorgente (inizio, durata, commento),
//      intestati all'assegnatario del sottotask (Tempo, se c'è il token, come
//      jira-worklog-edit). I worklog dei sottotask fornitore sono gestiti da qui: una copia
//      si aggiorna o si elimina se l'originale cambia o sparisce, e ogni altro worklog si
//      elimina — compreso quello che l'automazione Jira crea quando il sottotask esce da
//      IN PROGRESS (per questo, dopo un'uscita da IN PROGRESS si attende un poco prima di
//      rileggere). Il legame copia ↔ originale sta in fornitori_worklog_copie.
//
// Chiamata: dal cron (pg_cron + pg_net, header x-cron-token = Vault 'fornitori_wl_cron_token')
// o dall'app (admin/responsabile: «Sincronizza da Jira» e «🏢 Worklog fornitori» del Controllo
// Produzione). Un solo giro alla volta (fornitori_wl_lock); il risultato dell'ultimo giro
// reale resta in fornitori_worklog_stato.
//
// Richiesta (POST, JSON): { dryRun?: true, anno?: 2026, week?: 45, origine?: "cron" | "app" }
//   anno+week: solo quella settimana (fino a oggi); altrimenti gli ultimi 7 giorni e oggi.
// Risposta: { ok, dryRun, occupato?, dal, al, coppie: [Coppia], avvisi: [] }
//
// SECRET: JIRA_BASE_URL, JIRA_EMAIL, JIRA_API_TOKEN, TEMPO_API_TOKEN (facoltativo, o Vault
//         'tempo_api_token'), TEMPO_API_URL (facoltativo), SUPABASE_URL,
//         SUPABASE_SERVICE_ROLE_KEY (automatici). Deploy con verify_jwt = false: l'autenticazione
//         (utente o cron) è fatta qui.

import { createClient } from "npm:@supabase/supabase-js@2";

const JIRA_BASE_URL  = (Deno.env.get("JIRA_BASE_URL")  || "").replace(/\/+$/, "");
const JIRA_EMAIL     =  Deno.env.get("JIRA_EMAIL")     || "";
const JIRA_API_TOKEN =  Deno.env.get("JIRA_API_TOKEN") || "";
let TEMPO_API_TOKEN  =  Deno.env.get("TEMPO_API_TOKEN") || "";
const TEMPO_API_URL  = (Deno.env.get("TEMPO_API_URL") || "https://api.tempo.io").replace(/\/+$/, "");
const SUPABASE_URL   =  Deno.env.get("SUPABASE_URL") || "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-token",
};

const PARALLELO = 4;                 // coppie lavorate in parallelo
const ATTESA_AUTOMAZIONE_MS = 10000; // dopo un'uscita da IN PROGRESS, prima di rileggere i worklog
const BUDGET_MS = 110000;            // oltre, le coppie restanti si rimandano al giro dopo
const LOCK_SEC = 170;
const MAX_COMMENTO = 2000;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
}

const attendi = (ms: number) => new Promise((r) => setTimeout(r, ms));

/* ---------- Jira ---------- */

async function jira(method: string, path: string, body?: unknown): Promise<Response> {
  return fetch(`${JIRA_BASE_URL}${path}`, {
    method,
    headers: {
      Authorization: "Basic " + btoa(`${JIRA_EMAIL}:${JIRA_API_TOKEN}`),
      Accept: "application/json", "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function jiraErr(res: Response, cosa: string): Promise<string> {
  let det = "";
  try {
    const j = await res.json();
    det = [...(j.errorMessages || []), ...Object.values(j.errors || {})].join(" ");
  } catch { /* corpo vuoto */ }
  return `${cosa}: HTTP ${res.status}${det ? " · " + det : ""}`;
}

// Scrittura worklog con notifyUsers=false (se Jira rifiuta il parametro si riprova senza)
async function jiraScriviWl(method: string, path: string, body?: unknown): Promise<Response> {
  const sep = path.includes("?") ? "&" : "?";
  const res = await jira(method, `${path}${sep}adjustEstimate=leave&notifyUsers=false`, body);
  if (res.ok || (res.status !== 400 && res.status !== 403)) return res;
  return jira(method, `${path}${sep}adjustEstimate=leave`, body);
}

function adfText(node: any): string {
  if (!node) return "";
  if (typeof node === "string") return node;
  if (node.type === "text") return node.text || "";
  if (node.type === "hardBreak") return "\n";
  const figli = (Array.isArray(node.content) ? node.content : []).map(adfText);
  return node.type === "doc" ? figli.join("\n") : figli.join("");
}

function adfDoc(testo: string): unknown {
  const content: any[] = [];
  testo.split(/\r?\n/).forEach((r, i) => {
    if (i) content.push({ type: "hardBreak" });
    if (r) content.push({ type: "text", text: r });
  });
  return { type: "doc", version: 1, content: [{ type: "paragraph", content }] };
}

type Wl = { id: string; started: string; ms: number; seconds: number; commento: string };

function msDiStarted(s: string): number {
  return new Date(String(s || "").replace(/([+-]\d{2})(\d{2})$/, "$1:$2")).getTime();
}

function wlDa(j: any): Wl {
  const started = String(j?.started || "");
  return { id: String(j?.id || ""), started, ms: msDiStarted(started), seconds: Number(j?.timeSpentSeconds) || 0,
    commento: adfText(j?.comment).trim().slice(0, MAX_COMMENTO) };
}

async function leggiWorklogs(key: string): Promise<Wl[]> {
  const res = await jira("GET", `/rest/api/3/issue/${encodeURIComponent(key)}/worklog?maxResults=5000`);
  if (!res.ok) throw new Error(await jiraErr(res, `Lettura dei worklog di ${key}`));
  const j = await res.json();
  return (Array.isArray(j?.worklogs) ? j.worklogs : []).map(wlDa);
}

type Ticket = { id: number; stato: string; assegnatario: string; assegnatarioNome: string; residuoSec: number | null };

async function leggiTicket(key: string): Promise<Ticket> {
  const res = await jira("GET", `/rest/api/3/issue/${encodeURIComponent(key)}?fields=status,assignee,timetracking`);
  if (!res.ok) throw new Error(await jiraErr(res, `Lettura di ${key}`));
  const j = await res.json();
  const r = j?.fields?.timetracking?.remainingEstimateSeconds;
  return {
    id: Number(j?.id) || 0,
    stato: String(j?.fields?.status?.name || ""),
    assegnatario: String(j?.fields?.assignee?.accountId || ""),
    assegnatarioNome: String(j?.fields?.assignee?.displayName || ""),
    residuoSec: typeof r === "number" ? r : null,
  };
}

const _accountId = new Map<string, Promise<string>>();
function accountIdDi(email: string): Promise<string> {
  const k = email.toLowerCase();
  if (!_accountId.has(k)) {
    _accountId.set(k, (async () => {
      const res = await jira("GET", `/rest/api/3/user/search?query=${encodeURIComponent(email)}&maxResults=2`);
      if (!res.ok) return "";
      const users = await res.json();
      if (!Array.isArray(users) || !users.length) return "";
      const exact = users.find((u: any) => (u.emailAddress || "").toLowerCase() === k);
      return String((exact || users[0])?.accountId || "");
    })());
  }
  return _accountId.get(k)!;
}

/* ---------- Stato: segue quello del sottotask sorgente ---------- */

// Ordine del flusso dei sottotask: CREATED → TO DO → IN PROGRESS ⇄ IN PENDING → DONE
const ORDINE = [/^created$/i, /^to\s*do$/i, /^in\s*progress$/i, /pending/i, /^done$/i];
const IN_PROGRESS = 2;
function rango(nome: string): number { return ORDINE.findIndex((r) => r.test(String(nome || "").trim())); }
function stessoStato(a: string, b: string): boolean { return String(a || "").trim().toLowerCase() === String(b || "").trim().toLowerCase(); }

type EsitoStato = { prima: string; dopo: string; passi: string[]; uscitoDaInProgress: boolean; errore?: string };

async function allineaStato(key: string, attuale: string, voluto: string, dryRun: boolean): Promise<EsitoStato> {
  const out: EsitoStato = { prima: attuale, dopo: attuale, passi: [], uscitoDaInProgress: false };
  if (!voluto || stessoStato(attuale, voluto)) return out;
  if (dryRun) { out.passi.push(`${attuale} → ${voluto}`); return out; }
  let cur = attuale;
  for (let i = 0; i < 5 && !stessoStato(cur, voluto); i++) {
    const res = await jira("GET", `/rest/api/3/issue/${encodeURIComponent(key)}/transitions`);
    if (!res.ok) { out.errore = await jiraErr(res, "Lettura delle transizioni"); break; }
    const trans: any[] = (await res.json())?.transitions || [];
    const verso = (t: any) => String(t?.to?.name || "");
    let t = trans.find((x) => stessoStato(verso(x), voluto));
    if (!t) {
      const rA = rango(cur), rV = rango(voluto);
      if (rA < 0 || rV < 0) { out.errore = `stato «${rA < 0 ? cur : voluto}» non previsto`; break; }
      if (rV > rA) {
        // Avanti: da TO DO si passa sempre da IN PROGRESS (TO DO → DONE diretto non esiste)
        t = (rA < IN_PROGRESS && trans.find((x) => rango(verso(x)) === IN_PROGRESS))
          || trans.find((x) => { const r = rango(verso(x)); return r > rA && r < rV; });
      } else if (rA > IN_PROGRESS && rV <= IN_PROGRESS) {
        t = trans.find((x) => rango(verso(x)) === IN_PROGRESS);   // indietro: si riapre da IN PROGRESS
      }
    }
    if (!t) { out.errore = `nessuna transizione da «${cur}» verso «${voluto}»`; break; }
    const r2 = await jira("POST", `/rest/api/3/issue/${encodeURIComponent(key)}/transitions`, { transition: { id: t.id } });
    if (!r2.ok) { out.errore = await jiraErr(r2, `Transizione a ${verso(t)}`); break; }
    if (rango(cur) === IN_PROGRESS) out.uscitoDaInProgress = true;
    out.passi.push(`${cur} → ${verso(t)}`);
    cur = verso(t);
  }
  out.dopo = cur;
  return out;
}

/* ---------- Tempo (autore = assegnatario del sottotask) ---------- */

async function tempo(method: string, path: string, body?: unknown): Promise<Response> {
  return fetch(`${TEMPO_API_URL}/4${path}`, {
    method,
    headers: { Authorization: `Bearer ${TEMPO_API_TOKEN}`, Accept: "application/json", "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

const fmtRoma = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Rome", year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
});
function partiRoma(ms: number): { data: string; ora: string } {
  const p: Record<string, string> = {};
  fmtRoma.formatToParts(new Date(ms)).forEach((x) => { p[x.type] = x.value; });
  return { data: `${p.year}-${p.month}-${p.day}`, ora: `${p.hour}:${p.minute}:${p.second}` };
}

// Crea la copia di un worklog sul sottotask del fornitore; ritorna l'id Jira (o "" se Tempo
// non l'ha ancora riportato su Jira: il giro dopo la riconosce dal contenuto).
async function creaCopia(key: string, tk: Ticket, s: Wl): Promise<string> {
  if (TEMPO_API_TOKEN && tk.assegnatario) {
    const { data, ora } = partiRoma(s.ms);
    const body: Record<string, unknown> = {
      issueId: tk.id, authorAccountId: tk.assegnatario, startDate: data, startTime: ora, timeSpentSeconds: s.seconds,
    };
    if (s.commento) body.description = s.commento;
    if (tk.residuoSec !== null) body.remainingEstimateSeconds = tk.residuoSec;
    const res = await tempo("POST", "/worklogs", body);
    if (!res.ok) {
      let det = "";
      try { const j = await res.json(); det = (j?.errors || []).map((e: any) => e?.message || "").join(" ") || j?.message || ""; } catch { /* */ }
      throw new Error(`Copia del worklog su ${key} (Tempo): HTTP ${res.status}${det ? " · " + det : ""}`);
    }
    const tw = await res.json().catch(() => ({}));
    if (!tw?.tempoWorklogId) return "";
    const m = await tempo("POST", "/worklogs/tempo-to-jira", { tempoWorklogIds: [Number(tw.tempoWorklogId)] });
    if (!m.ok) return "";
    const jid = (await m.json())?.results?.[0]?.jiraWorklogId;
    return jid ? String(jid) : "";
  }
  const body: Record<string, unknown> = { started: s.started, timeSpentSeconds: s.seconds };
  if (s.commento) body.comment = adfDoc(s.commento);
  const res = await jiraScriviWl("POST", `/rest/api/3/issue/${encodeURIComponent(key)}/worklog`, body);
  if (!res.ok) throw new Error(await jiraErr(res, `Copia del worklog su ${key}`));
  return String((await res.json())?.id || "");
}

async function eliminaWl(key: string, id: string): Promise<void> {
  const res = await jiraScriviWl("DELETE", `/rest/api/3/issue/${encodeURIComponent(key)}/worklog/${encodeURIComponent(id)}`);
  if (!res.ok && res.status !== 404) throw new Error(await jiraErr(res, `Eliminazione del worklog ${id} su ${key}`));
}

/* ---------- Date ---------- */

function oggiRoma(): string { return partiRoma(Date.now()).data; }

function isoDaGiorni(iso: string, giorni: number): string {
  const d = new Date(iso + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + giorni);
  return d.toISOString().slice(0, 10);
}

function lunediIso(anno: number, week: number): string {
  const jan4 = new Date(Date.UTC(anno, 0, 4));
  const dow = jan4.getUTCDay() || 7;
  const lun = new Date(jan4);
  lun.setUTCDate(jan4.getUTCDate() - (dow - 1) + (week - 1) * 7);
  return lun.toISOString().slice(0, 10);
}

/* ---------- Coppie fornitore ↔ sorgente ---------- */

type Riga = { anno: number; week: number; commessa: string; cantiere: string; operatore: string; attivita: string; giorno: number; data: string; jira_key: string };

type Coppia = {
  operatore: string; fornitore: string; email: string; commessa: string; cantiere: string; attivita: string;
  anno: number; week: number; giorno: number; data: string; targetKey: string;
  candidati: string[]; sorgente: string; sourceKey: string; scelta: "auto" | "manuale" | "";
  stato?: EsitoStato; creati: number; aggiornati: number; eliminati: number; errore?: string; nota?: string;
};

const norm = (s: string) => String(s || "").trim().toLowerCase();

function cantieriCella(cella: any): string[] {
  return (Array.isArray(cella?.cantieri) ? cella.cantieri : []).map((c: any) => norm(c)).filter(Boolean);
}

// Operatori (in ordine) della squadra in cui `nome` lavora su `cantiere` quel giorno, o null.
function squadraDi(settimana: any[], commessa: string, nome: string, cantiere: string, giorno: number): string[] | null {
  for (const bc of (Array.isArray(settimana) ? settimana : [])) {
    if (!bc || bc.commessa !== commessa) continue;
    for (const sq of (bc.squadre || [])) {
      const ops = (sq.operatori || []).filter((o: any) => o && o.nome);
      const lui = ops.find((o: any) => o.nome === nome && cantieriCella((o.giorni || {})[giorno]).includes(norm(cantiere)));
      if (lui) return ops.map((o: any) => String(o.nome));
    }
  }
  return null;
}

/* ---------- Handler ---------- */

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "Metodo non consentito" }, 405);
  if (!JIRA_BASE_URL || !JIRA_EMAIL || !JIRA_API_TOKEN) return json({ error: "Secret Jira non configurati" }, 500);
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return json({ error: "Configurazione mancante (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)" }, 500);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

  // Autenticazione: token del cron oppure utente admin/responsabile
  let chi = "";
  const cronTok = req.headers.get("x-cron-token") || "";
  if (cronTok) {
    const { data: tok } = await admin.rpc("fornitori_wl_cron_token");
    if (typeof tok !== "string" || !tok || tok !== cronTok) return json({ error: "Token cron non valido" }, 401);
    chi = "cron";
  } else {
    const authz = req.headers.get("Authorization") || "";
    if (!authz.startsWith("Bearer ")) return json({ error: "Non autenticato" }, 401);
    const { data: u, error: uErr } = await admin.auth.getUser(authz.slice("Bearer ".length));
    if (uErr || !u?.user) return json({ error: "Sessione non valida" }, 401);
    const role = u.user.user_metadata?.role || "responsabile";
    if (role !== "admin" && role !== "responsabile") return json({ error: "Solo admin e responsabili" }, 403);
    chi = u.user.email || "";
  }
  if (!TEMPO_API_TOKEN) {
    const { data: tok } = await admin.rpc("tempo_get_api_token");
    TEMPO_API_TOKEN = typeof tok === "string" ? tok.trim() : "";
  }

  let p: any = {};
  try { p = await req.json(); } catch { /* corpo vuoto: valori di default */ }
  const dryRun = !!p?.dryRun;
  const oggi = oggiRoma();
  let dal = isoDaGiorni(oggi, -7), al = oggi;
  if (Number.isInteger(p?.anno) && Number.isInteger(p?.week)) {
    dal = lunediIso(p.anno, p.week);
    al = isoDaGiorni(dal, 5) < oggi ? isoDaGiorni(dal, 5) : oggi;
    if (dal > oggi) return json({ ok: true, dryRun, dal, al, coppie: [], avvisi: ["Settimana futura: niente da copiare."] });
  }

  if (!dryRun) {
    const { data: preso, error: lErr } = await admin.rpc("fornitori_wl_lock", { p_secondi: LOCK_SEC });
    if (lErr) return json({ error: "Lock non disponibile: " + lErr.message }, 500);
    if (!preso) return json({ ok: true, occupato: true, dryRun, dal, al, coppie: [], avvisi: ["Un altro giro di copia è in corso: riprova tra poco."] });
  }

  const t0 = Date.now();
  const avvisi: string[] = [];
  const coppie: Coppia[] = [];
  try {
    // Sottotask giornalieri del periodo
    const { data: righeDb, error: rErr } = await admin.from("pw_jira_subtask")
      .select("anno,week,commessa,cantiere,operatore,attivita,giorno,data,jira_key")
      .gte("data", dal).lte("data", al).in("status", ["created", "already_exists"]).neq("jira_key", "");
    if (rErr) throw new Error("Lettura pw_jira_subtask: " + rErr.message);
    const righe = (righeDb || []) as Riga[];

    // Fornitori e Griglia delle settimane coinvolte
    const settimane = [...new Set(righe.map((r) => r.anno + "|" + r.week))].map((k) => { const [a, w] = k.split("|"); return { anno: +a, week: +w }; });
    const { data: dati, error: dErr } = await admin.rpc("fornitori_wl_dati", { p_settimane: settimane });
    if (dErr) throw new Error("Lettura Griglia/fornitori: " + dErr.message);
    const fornitori = new Map<string, { fornitore: string; email: string }>();
    (Array.isArray(dati?.fornitori) ? dati.fornitori : []).forEach((f: any) => (f?.dipendenti || []).forEach((d: any) => {
      const email = String(d?.email || "").trim();
      if (d?.nome_esteso && email) fornitori.set(String(d.nome_esteso), { fornitore: String(f.nome || ""), email });
    }));
    const griglia = (dati?.settimane || {}) as Record<string, any[]>;
    if (!fornitori.size) return json({ ok: true, dryRun, dal, al, coppie: [], avvisi: ["Nessun dipendente fornitore con email."] });

    const { data: scelte } = await admin.from("fornitori_worklog_sorgente").select("target_key,sorgente");
    const sceltaDi = new Map<string, string>(((scelte || []) as any[]).map((s) => [String(s.target_key), String(s.sorgente)]));

    const stessoPosto = (a: Riga, b: Riga) => a.anno === b.anno && a.week === b.week && a.giorno === b.giorno
      && a.commessa === b.commessa && norm(a.cantiere) === norm(b.cantiere);
    righe.filter((t) => fornitori.has(t.operatore)).forEach((t) => {
      const f = fornitori.get(t.operatore)!;
      const c: Coppia = {
        operatore: t.operatore, fornitore: f.fornitore, email: f.email, commessa: t.commessa, cantiere: t.cantiere,
        attivita: t.attivita || "", anno: t.anno, week: t.week, giorno: t.giorno, data: t.data, targetKey: t.jira_key,
        candidati: [], sorgente: "", sourceKey: "", scelta: "", creati: 0, aggiornati: 0, eliminati: 0,
      };
      // Interni con un sottotask sullo stesso cantiere quel giorno (uno per operatore: stessa attività prima)
      const perOp = new Map<string, Riga>();
      righe.filter((r) => !fornitori.has(r.operatore) && r.jira_key !== t.jira_key && stessoPosto(r, t))
        .sort((a, b) => Number(norm(b.attivita) === norm(t.attivita)) - Number(norm(a.attivita) === norm(t.attivita)))
        .forEach((r) => { if (!perOp.has(r.operatore)) perOp.set(r.operatore, r); });
      const squadra = squadraDi(griglia[t.anno + "|" + t.week] || [], t.commessa, t.operatore, t.cantiere, t.giorno);
      let cand = [...perOp.values()];
      const inSquadra = squadra ? cand.filter((r) => squadra.includes(r.operatore)) : [];
      if (inSquadra.length) cand = inSquadra;
      const pos = (n: string) => (squadra ? squadra.indexOf(n) : -1) < 0 ? 999 : squadra!.indexOf(n);
      cand.sort((a, b) => Number(norm(b.attivita) === norm(t.attivita)) - Number(norm(a.attivita) === norm(t.attivita))
        || pos(a.operatore) - pos(b.operatore) || a.operatore.localeCompare(b.operatore, "it"));
      c.candidati = [...perOp.keys()].sort((a, b) => pos(a) - pos(b) || a.localeCompare(b, "it"));
      const manuale = sceltaDi.get(t.jira_key);
      const scelto = (manuale && perOp.get(manuale)) || cand[0];
      if (scelto) {
        c.sorgente = scelto.operatore;
        c.sourceKey = scelto.jira_key;
        c.scelta = manuale && perOp.get(manuale) ? "manuale" : "auto";
      } else {
        c.nota = "nessun collega interno con sottotask sullo stesso cantiere quel giorno";
      }
      if (manuale && !perOp.get(manuale)) avvisi.push(`${t.operatore} ${t.data}: ${manuale} (scelto a mano) non ha un sottotask su ${t.cantiere} quel giorno, uso ${c.sorgente || "nessuno"}.`);
      coppie.push(c);
    });
    coppie.sort((a, b) => a.data.localeCompare(b.data) || a.operatore.localeCompare(b.operatore, "it"));

    const { data: copieDb } = coppie.length
      ? await admin.from("fornitori_worklog_copie").select("*").in("target_key", coppie.map((c) => c.targetKey))
      : { data: [] };
    const copieDi = new Map<string, any[]>();
    ((copieDb || []) as any[]).forEach((r) => {
      if (!copieDi.has(r.target_key)) copieDi.set(r.target_key, []);
      copieDi.get(r.target_key)!.push(r);
    });

    const lavora = async (c: Coppia) => {
      if (!c.sourceKey) return;
      if (Date.now() - t0 > BUDGET_MS) { c.nota = "rimandata al prossimo giro (tempo esaurito)"; return; }
      try {
        const [src, tgt, accFornitore] = await Promise.all([leggiTicket(c.sourceKey), leggiTicket(c.targetKey), accountIdDi(c.email)]);
        if (!accFornitore || tgt.assegnatario !== accFornitore) {
          c.errore = `il sottotask è assegnato a ${tgt.assegnatarioNome || "nessuno"}, non a ${c.operatore}: non lo tocco`;
          return;
        }
        // 1. stato
        c.stato = await allineaStato(c.targetKey, tgt.stato, src.stato, dryRun);
        if (c.stato.uscitoDaInProgress) await attendi(ATTESA_AUTOMAZIONE_MS);
        // 2. worklog
        const [srcWl, tgtWl] = await Promise.all([leggiWorklogs(c.sourceKey), leggiWorklogs(c.targetKey)]);
        const srcById = new Map(srcWl.map((w) => [w.id, w]));
        const tgtById = new Map(tgtWl.map((w) => [w.id, w]));
        const usati = new Set<string>();
        const simile = (w: Wl, ms: number, sec: number) => !usati.has(w.id) && Math.abs(w.ms - ms) < 60000 && w.seconds === sec;
        const copiati = new Set<string>();
        const ora = () => new Date().toISOString();

        for (const r of (copieDi.get(c.targetKey) || [])) {
          const s = srcById.get(String(r.source_worklog_id));
          let t = r.target_worklog_id ? tgtById.get(String(r.target_worklog_id)) : undefined;
          if (!t && !r.target_worklog_id) {
            // Copia fatta con Tempo che non aveva ancora l'id Jira: si riconosce dalla durata e
            // dall'inizio, con tolleranza di 14 ore (Tempo usa il fuso del profilo dell'autore):
            // senza tolleranza la si ricreerebbe a ogni giro.
            const ms0 = msDiStarted(r.source_started);
            t = tgtWl.find((w) => simile(w, ms0, r.source_seconds))
              || tgtWl.find((w) => !usati.has(w.id) && w.seconds === r.source_seconds && Math.abs(w.ms - ms0) < 14 * 3600000);
            if (t && !dryRun) await admin.from("fornitori_worklog_copie").update({ target_worklog_id: t.id, updated_at: ora() }).eq("id", r.id);
          }
          if (!s || r.source_key !== c.sourceKey) {
            // originale sparito (o sorgente cambiata): via la copia
            if (t) { usati.add(t.id); if (!dryRun) await eliminaWl(c.targetKey, t.id); c.eliminati++; }
            if (!dryRun) await admin.from("fornitori_worklog_copie").delete().eq("id", r.id);
            continue;
          }
          copiati.add(s.id);
          const cambiato = s.ms !== msDiStarted(r.source_started) || s.seconds !== r.source_seconds || s.commento !== (r.source_commento || "");
          if (t && !cambiato) { usati.add(t.id); continue; }
          if (t) { usati.add(t.id); if (!dryRun) await eliminaWl(c.targetKey, t.id); }
          const nuovoId = dryRun ? "" : await creaCopia(c.targetKey, tgt, s);
          if (nuovoId) usati.add(nuovoId);
          if (!dryRun) {
            await admin.from("fornitori_worklog_copie").update({
              target_worklog_id: nuovoId || null, source_started: s.started, source_seconds: s.seconds,
              source_commento: s.commento, sorgente: c.sorgente, updated_at: ora(),
            }).eq("id", r.id);
          }
          if (t) c.aggiornati++; else c.creati++;
        }

        for (const s of srcWl) {
          if (copiati.has(s.id)) continue;
          // Copia già presente ma non registrata (es. giro interrotto): si adotta
          const gia = tgtWl.find((w) => simile(w, s.ms, s.seconds));
          let idCopia = "";
          if (gia) { usati.add(gia.id); idCopia = gia.id; }
          else {
            idCopia = dryRun ? "" : await creaCopia(c.targetKey, tgt, s);
            if (idCopia) usati.add(idCopia);
            c.creati++;
          }
          if (!dryRun) {
            await admin.from("fornitori_worklog_copie").upsert({
              target_key: c.targetKey, target_worklog_id: idCopia || null, source_key: c.sourceKey, source_worklog_id: s.id,
              source_started: s.started, source_seconds: s.seconds, source_commento: s.commento,
              operatore: c.operatore, sorgente: c.sorgente, updated_at: ora(),
            }, { onConflict: "target_key,source_worklog_id" });
          }
        }

        // Ogni altro worklog sul sottotask del fornitore (automazione all'uscita da IN PROGRESS, a mano) si toglie
        for (const w of tgtWl) {
          if (usati.has(w.id)) continue;
          if (!dryRun) await eliminaWl(c.targetKey, w.id);
          c.eliminati++;
        }
      } catch (e) {
        c.errore = String((e as Error)?.message || e);
      }
    };

    for (let i = 0; i < coppie.length; i += PARALLELO) await Promise.all(coppie.slice(i, i + PARALLELO).map(lavora));
  } catch (e) {
    avvisi.push(String((e as Error)?.message || e));
  } finally {
    if (!dryRun) {
      const modifiche = coppie.filter((c) => c.creati || c.aggiornati || c.eliminati || (c.stato && c.stato.passi.length));
      const esito = { dal, al, origine: String(p?.origine || (chi === "cron" ? "cron" : "app")), avvisi, coppie };
      try {
        await admin.from("fornitori_worklog_stato").update({ ultimo_avvio: new Date(t0).toISOString(), ultimo_da: chi, ultimo_esito: esito }).eq("id", 1);
        if (modifiche.length) {
          await admin.from("activity_log").insert({
            user_email: chi, action: "Worklog fornitori allineati",
            details: { dal, al, coppie: modifiche.map((c) => ({ operatore: c.operatore, data: c.data, targetKey: c.targetKey, sorgente: c.sorgente,
              sourceKey: c.sourceKey, stato: c.stato?.passi, creati: c.creati, aggiornati: c.aggiornati, eliminati: c.eliminati, errore: c.errore })) },
          });
        }
      } catch { /* il log non deve far fallire il giro */ }
      await admin.rpc("fornitori_wl_unlock");
    }
  }
  return json({ ok: true, dryRun, dal, al, coppie, avvisi, tempo: !!TEMPO_API_TOKEN });
});
