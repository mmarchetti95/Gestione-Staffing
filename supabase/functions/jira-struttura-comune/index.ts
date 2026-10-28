// supabase/functions/jira-struttura-comune/index.ts
//
// Edge Function: crea su Jira la struttura di un comune (es. Iniziativa -> Epic -> Task)
// copiando il MODELLO della commessa (v18.231.0). Il modello è un albero vero in Jira, es.
// l'Iniziativa AI029-604 "MODELLO" con le Epic "_MODELLO - Walk Out" / "_MODELLO - Digital
// Twin" e i Task "MODELLO - Rilievo Auto" ecc.: la chiave della radice è salvata nella
// commessa (state.commesse_attive_meta[commessa].jira_modello.key). Cambiare la struttura =
// cambiare il modello in Jira, non il codice.
//
// - Si copia la radice e tutto quello che ha sotto fino al livello Task (hierarchyLevel 0):
//   i SOTTOTASK no, li crea la Griglia giorno per giorno.
// - Titolo: "MODELLO" (anche "_MODELLO") diventa il nome del comune.
// - Campi: si copiano i valori del modello per i campi presenti nella schermata di creazione
//   di quel tipo di issue (assegnatario, Tempo Team, Target Production, campi a scelta…).
//   Non si copiano stime, stato, sprint, collegamenti all'Epic e i testi che citano una
//   chiave del modello (sono i campi "padre" riempiti dalle automazioni). Se Jira rifiuta
//   un campo, si riprova senza e lo si segnala.
// - Date (v18.233.0): quelle del modello sono vecchie e non si copiano. Dove il modello ha
//   compilato "Data di scadenza" / "Start date pianificato" (in SINFI i Task: un validatore
//   Jira li vuole in creazione insieme a Target Production) si scrivono le date scelte
//   nella finestra di creazione (date: { inizio, scadenza }).
// - Idempotente: se il comune ha già la radice (stesso tipo, stesso titolo a meno di
//   maiuscole/accenti) la si completa con le sole parti mancanti, riconosciute per tipo e
//   titolo sotto lo stesso padre. Il titolo si confronta per pezzi separati da " - " in
//   qualunque ordine: i comuni fatti a mano prima del modello hanno "Rilievo Auto -
//   Cividate Camuno" invece di "Cividate Camuno - Rilievo Auto". Così si "adottano" anche
//   le strutture fatte a mano senza duplicarle.
// - Senza dryRun, le chiavi (create o ritrovate) vanno nella tabella jira_struttura_comune
//   (service_role) e l'operazione in activity_log.
// - Solo admin e responsabile (ruolo letto dall'utente Supabase, non dal client).
//
// SECRET: JIRA_BASE_URL, JIRA_EMAIL, JIRA_API_TOKEN (come le altre jira-*),
//         SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (automatici).
//
// Richiesta — lettura del modello (anteprima nella scheda commessa):
//   { mode: "modello", modelloKey: "AI029-604" }
// Risposta: { modello: { key, projectKey, base, nodi: [{ key, summary, tipo, tipoId, livello,
//             parentKey, assegnatario, campi: [nome], saltati: [nome], date: [nome] }], avvisi: [testo],
//             date: [nomi dei campi data da chiedere alla creazione] } }
//
// Richiesta — un comune (anteprima con dryRun, poi creazione):
//   { mode: "comune", commessa: "Sinfi", modelloKey: "AI029-604", comune: "Frontone", dryRun: true,
//     date: { inizio: "2026-11-02", scadenza: "2026-12-31" },   // date: obbligatorie se il modello ne ha
//     escludi: ["AI029-713"] }   // v18.234.0: issue del modello da NON creare (tolte la spunta in anteprima);
//                                // chi sta sotto un'esclusa mancante resta senza padre e viene saltato
// Risposta: { comune, radiceKey, salvato, nodi: [{ modello, summary, tipo, livello, key?, url?,
//             stato: "esiste"|"da_creare"|"creato"|"errore"|"saltato", message? }] }

import { createClient } from "npm:@supabase/supabase-js@2";

const JIRA_BASE_URL  = (Deno.env.get("JIRA_BASE_URL")  || "").replace(/\/+$/, "");
const JIRA_EMAIL     =  Deno.env.get("JIRA_EMAIL")     || "";
const JIRA_API_TOKEN =  Deno.env.get("JIRA_API_TOKEN") || "";
const SUPABASE_URL   =  Deno.env.get("SUPABASE_URL") || "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

const TABELLA = "jira_struttura_comune";
const MAX_NODI = 60;
const SEGNAPOSTO = /_?MODELLO/g;
const START_DATE_FIELD = "customfield_13093"; // Start date pianificato

// Campi mai copiati: li decide Jira, la creazione stessa o chi lavora sul comune.
const CAMPI_ESCLUSI = new Set([
  "summary", "project", "issuetype", "parent", "reporter", "duedate", "timetracking",
  "attachment", "issuelinks", "status", "resolution", "customfield_10014",
]);

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

async function jiraErr(res: Response, cosa: string): Promise<string> {
  let det = "";
  try {
    const j = await res.json();
    det = [...(j.errorMessages || []), ...Object.entries(j.errors || {}).map(([k, v]) => `${k}: ${v}`)].join(" · ");
  } catch { /* corpo vuoto */ }
  if (res.status === 401 || res.status === 403) det = (det ? det + " — " : "") + "permesso negato all'account di servizio Jira";
  if (res.status === 404) det = (det ? det + " — " : "") + "non trovato";
  return `${cosa}: HTTP ${res.status}${det ? " · " + det : ""}`;
}

function jqlEscape(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

// Confronto tollerante a maiuscole, accenti e "_"/spazi (stesso criterio di caNorm lato client).
function normNome(s: string): string {
  return String(s || "").normalize("NFD").replace(/\p{M}/gu, "")
    .replace(/[_\s]+/g, " ").trim().toLowerCase();
}

// Titolo come insieme di pezzi separati da "-": "Rilievo Auto - Cividate Camuno" e
// "Cividate Camuno - Rilievo Auto" sono la stessa issue.
function chiaveTitolo(s: string): string {
  return normNome(s).split(/\s*-\s*/).map((x) => x.trim()).filter(Boolean).sort().join("|");
}

function sostituisci(s: string, comune: string): string {
  return String(s || "").replace(SEGNAPOSTO, comune).replace(/\s+/g, " ").trim().slice(0, 255);
}

/* ---------- Lettura del modello ---------- */

type Nodo = {
  key: string; summary: string; tipoId: string; tipo: string; livello: number;
  parentKey: string; fields: Record<string, any>;
};

function nodoDa(issue: any, parentKey: string): Nodo {
  const f = issue?.fields || {};
  return {
    key: String(issue.key), summary: String(f.summary || ""),
    tipoId: String(f.issuetype?.id || ""), tipo: String(f.issuetype?.name || ""),
    livello: Number(f.issuetype?.hierarchyLevel ?? 0), parentKey, fields: f,
  };
}

async function cerca(jql: string, fields: string[], max = 100): Promise<any[]> {
  const out: any[] = [];
  let nextPageToken: string | undefined;
  for (let page = 0; page < 5 && out.length < max; page++) {
    const body: Record<string, unknown> = { jql, fields, maxResults: 100 };
    if (nextPageToken) body.nextPageToken = nextPageToken;
    const res = await jira("POST", "/rest/api/3/search/jql", body);
    if (!res.ok) throw new Error(await jiraErr(res, "Ricerca Jira"));
    const data = await res.json();
    out.push(...(data.issues || []));
    nextPageToken = data.nextPageToken;
    if (!nextPageToken || data.isLast) break;
  }
  return out;
}

// Radice + discendenti fino al livello Task, in ordine dall'alto (un padre prima dei figli).
async function leggiModello(modelloKey: string): Promise<{ projectKey: string; nodi: Nodo[] }> {
  const res = await jira("GET", `/rest/api/3/issue/${encodeURIComponent(modelloKey)}?fields=*all`);
  if (!res.ok) throw new Error(await jiraErr(res, `Lettura del modello ${modelloKey}`));
  const radiceIssue = await res.json();
  const radice = nodoDa(radiceIssue, String(radiceIssue?.fields?.parent?.key || ""));
  if (radiceIssue?.fields?.issuetype?.subtask) throw new Error(`${modelloKey} è un sottotask: il modello deve partire da un'Iniziativa, un'Epic o un Task.`);
  const projectKey = String(radiceIssue?.fields?.project?.key || "");
  const nodi: Nodo[] = [radice];
  let livello = [radice];
  while (livello.length && nodi.length < MAX_NODI) {
    const padri = livello.filter((n) => n.livello > 0);
    if (!padri.length) break;
    const figli = await cerca(
      `parent in (${padri.map((n) => `"${jqlEscape(n.key)}"`).join(",")}) ORDER BY key ASC`,
      ["*all"], MAX_NODI,
    );
    livello = figli
      .filter((i) => !i?.fields?.issuetype?.subtask)
      .map((i) => nodoDa(i, String(i?.fields?.parent?.key || "")));
    nodi.push(...livello);
  }
  return { projectKey, nodi: nodi.slice(0, MAX_NODI) };
}

/* ---------- Campi da copiare ---------- */

const createMetaCache = new Map<string, Map<string, any>>();

async function campiCreazione(projectKey: string, tipoId: string): Promise<Map<string, any>> {
  const k = `${projectKey}::${tipoId}`;
  if (createMetaCache.has(k)) return createMetaCache.get(k)!;
  const res = await jira("GET", `/rest/api/3/issue/createmeta/${encodeURIComponent(projectKey)}/issuetypes/${encodeURIComponent(tipoId)}?maxResults=200`);
  const out = new Map<string, any>();
  if (res.ok) {
    const data = await res.json();
    for (const f of (Array.isArray(data.fields) ? data.fields : [])) out.set(String(f.fieldId || f.key), f);
  }
  createMetaCache.set(k, out);
  return out;
}

function vuoto(v: any): boolean {
  return v === null || v === undefined || v === "" || (Array.isArray(v) && v.length === 0);
}

// Testo ADF con il segnaposto sostituito nei nodi di testo.
function adfSostituisci(node: any, comune: string): any {
  if (Array.isArray(node)) return node.map((n) => adfSostituisci(n, comune));
  if (!node || typeof node !== "object") return node;
  const out: any = {};
  for (const [k, v] of Object.entries(node)) {
    out[k] = k === "text" && typeof v === "string" ? v.replace(SEGNAPOSTO, comune) : adfSostituisci(v, comune);
  }
  return out;
}

// Valore del modello -> valore per la POST di creazione. undefined = non copiabile.
function valoreCopia(meta: any, v: any, comune: string): any {
  const s = meta?.schema || {};
  const tipo = String(s.type || ""), items = String(s.items || ""), custom = String(s.custom || "");
  if (/gh-sprint|gh-lexo-rank|gh-epic-link/.test(custom)) return undefined;
  if (tipo === "date" || tipo === "datetime") return undefined;
  if (/tempo/i.test(custom) || meta?.fieldId === "customfield_10602") {
    const id = typeof v === "object" ? v?.id : v;
    return id === undefined || id === null || id === "" ? undefined : Number(id);
  }
  switch (tipo) {
    case "user": return v?.accountId ? { accountId: v.accountId } : undefined;
    case "priority": case "option": case "component": case "version": case "resolution":
      return v?.id ? { id: String(v.id) } : undefined;
    case "option-with-child":
      return v?.id ? { id: String(v.id), ...(v.child?.id ? { child: { id: String(v.child.id) } } : {}) } : undefined;
    case "number": return typeof v === "number" ? v : undefined;
    case "string":
      if (typeof v === "string") return v.replace(SEGNAPOSTO, comune);
      if (v && typeof v === "object" && v.type === "doc") return adfSostituisci(v, comune);
      return undefined;
    case "array": {
      if (!Array.isArray(v)) return undefined;
      if (items === "string") return v.filter((x) => typeof x === "string");
      if (items === "user") return v.filter((x) => x?.accountId).map((x) => ({ accountId: x.accountId }));
      if (["option", "component", "version"].includes(items)) return v.filter((x) => x?.id).map((x) => ({ id: String(x.id) }));
      return undefined;
    }
    default: return undefined;
  }
}

type DateScelte = { inizio: string; scadenza: string } | null;

// Date che il modello ha compilato e che vanno chieste all'utente: fieldId -> "inizio"|"scadenza".
function campiData(nodo: Nodo, meta: Map<string, any>): Map<string, "inizio" | "scadenza"> {
  const out = new Map<string, "inizio" | "scadenza">();
  if (meta.has("duedate") && !vuoto(nodo.fields.duedate)) out.set("duedate", "scadenza");
  if (meta.has(START_DATE_FIELD) && !vuoto(nodo.fields[START_DATE_FIELD])) out.set(START_DATE_FIELD, "inizio");
  return out;
}

// Campi del modello da passare alla creazione (con le date scelte), più i nomi di quelli
// lasciati fuori e delle date da chiedere.
function pianoCampi(nodo: Nodo, meta: Map<string, any>, chiaviModello: string[], comune: string, date: DateScelte = null) {
  const campi: Record<string, any> = {};
  const nomi: string[] = [];
  const saltati: string[] = [];
  const daChiedere: string[] = [];
  for (const [fieldId, quale] of campiData(nodo, meta)) {
    daChiedere.push(String(meta.get(fieldId)?.name || fieldId));
    if (date && date[quale]) campi[fieldId] = date[quale];
  }
  for (const [fieldId, m] of meta) {
    if (CAMPI_ESCLUSI.has(fieldId) || fieldId in campi || fieldId === START_DATE_FIELD) continue;
    const v = nodo.fields[fieldId];
    if (vuoto(v)) continue;
    const nome = String(m?.name || fieldId);
    // Testi che citano il modello (es. chiave/URL dell'Epic padre riempiti da automazioni):
    // copiati punterebbero al modello invece che al comune.
    const testo = typeof v === "string" ? v : "";
    if (testo && chiaviModello.some((k) => testo.includes(k))) { saltati.push(nome); continue; }
    const out = valoreCopia(m, v, comune);
    if (out === undefined || vuoto(out)) { saltati.push(nome); continue; }
    campi[fieldId] = out;
    nomi.push(nome);
  }
  return { campi, nomi, saltati, daChiedere };
}

/* ---------- Struttura del comune ---------- */

type Esito = {
  modello: string; summary: string; tipo: string; livello: number;
  key?: string; url?: string; stato: string; message?: string;
};

function url(key: string): string {
  return `${JIRA_BASE_URL}/browse/${key}`;
}

async function trovaRadice(projectKey: string, radice: Nodo, summary: string): Promise<string[]> {
  let jql = `project = "${jqlEscape(projectKey)}" AND issuetype = ${radice.tipoId} AND summary ~ "\\"${jqlEscape(summary)}\\""`;
  if (radice.parentKey) jql += ` AND parent = "${jqlEscape(radice.parentKey)}"`;
  const trovate = await cerca(jql + " ORDER BY created ASC", ["summary"], 50);
  return trovate
    .filter((i) => i.key !== radice.key && chiaveTitolo(i?.fields?.summary) === chiaveTitolo(summary))
    .map((i) => String(i.key));
}

// Figli esistenti di una issue del comune: tipo+titolo -> chiave (il più vecchio vince).
async function figliDi(key: string): Promise<Map<string, string>> {
  const figli = await cerca(`parent = "${jqlEscape(key)}" ORDER BY created ASC`, ["summary", "issuetype"], 200);
  const out = new Map<string, string>();
  for (const i of figli) {
    if (i?.fields?.issuetype?.subtask) continue;
    const k = `${i?.fields?.issuetype?.id}::${chiaveTitolo(i?.fields?.summary)}`;
    if (!out.has(k)) out.set(k, String(i.key));
  }
  return out;
}

async function creaIssue(projectKey: string, nodo: Nodo, summary: string, parentKey: string, campi: Record<string, any>) {
  const base: Record<string, any> = { project: { key: projectKey }, issuetype: { id: nodo.tipoId }, summary };
  if (parentKey) base.parent = { key: parentKey };
  let extra = { ...campi };
  const rifiutati: string[] = [];
  for (let tentativo = 0; tentativo < 3; tentativo++) {
    const res = await jira("POST", "/rest/api/3/issue", { fields: { ...base, ...extra } });
    if (res.ok) return { key: String((await res.json()).key), rifiutati };
    const msg = await jiraErr(res.clone(), "Creazione");
    let errori: Record<string, string> = {};
    try { errori = (await res.json()).errors || {}; } catch { /* nessun dettaglio */ }
    // Un campo copiato che Jira rifiuta (valore non più valido, campo non modificabile…):
    // si riprova senza, così la struttura nasce comunque.
    const daTogliere = Object.keys(errori).filter((k) => k in extra);
    if (res.status !== 400 || !daTogliere.length) throw new Error(msg);
    daTogliere.forEach((k) => { rifiutati.push(`${k}: ${errori[k]}`); delete extra[k]; });
  }
  throw new Error("Creazione: Jira continua a rifiutare i campi copiati");
}

async function strutturaComune(modelloKey: string, comune: string, dryRun: boolean, date: DateScelte, escludi: Set<string>) {
  const { projectKey, nodi } = await leggiModello(modelloKey);
  const chiaviModello = nodi.map((n) => n.key);
  const radice = nodi[0];
  const mappa = new Map<string, string>(); // chiave modello -> chiave del comune
  const esiti: Esito[] = [];
  const avvisi: string[] = [];

  const titoloRadice = sostituisci(radice.summary, comune);
  if (!/_?MODELLO/.test(radice.summary)) throw new Error(`Il titolo della radice del modello ("${radice.summary}") non contiene "MODELLO": tutti i comuni avrebbero lo stesso titolo.`);
  const esistenti = await trovaRadice(projectKey, radice, titoloRadice);
  if (esistenti.length > 1) throw new Error(`Per "${titoloRadice}" esistono già più ${radice.tipo} (${esistenti.join(", ")}): sistemale su Jira prima di continuare.`);
  if (esistenti.length === 1) mappa.set(radice.key, esistenti[0]);

  const figliCache = new Map<string, Map<string, string>>();
  for (const nodo of nodi) {
    const summary = sostituisci(nodo.summary, comune);
    const esito: Esito = { modello: nodo.key, summary, tipo: nodo.tipo, livello: nodo.livello, stato: "" };
    esiti.push(esito);
    let parentKey = "";
    if (nodo !== radice) {
      parentKey = mappa.get(nodo.parentKey) || "";
      if (parentKey) {
        if (!figliCache.has(parentKey)) figliCache.set(parentKey, await figliDi(parentKey));
        const trovato = figliCache.get(parentKey)!.get(`${nodo.tipoId}::${chiaveTitolo(summary)}`);
        if (trovato) mappa.set(nodo.key, trovato);
      }
    } else {
      parentKey = radice.parentKey;
    }
    const gia = mappa.get(nodo.key);
    if (gia) { Object.assign(esito, { stato: "esiste", key: gia, url: url(gia) }); continue; }
    const padreMancante = nodo !== radice && !parentKey;
    if (escludi.has(nodo.key)) { Object.assign(esito, { stato: "saltato", message: "non selezionata" }); continue; }
    if (dryRun) { esito.stato = "da_creare"; continue; }
    if (padreMancante) { Object.assign(esito, { stato: "saltato", message: "padre non creato" }); continue; }
    try {
      const meta = await campiCreazione(projectKey, nodo.tipoId);
      const { campi, daChiedere } = pianoCampi(nodo, meta, chiaviModello, comune, date);
      if (daChiedere.length && !date) throw new Error("Date mancanti: " + daChiedere.join(", "));
      const { key, rifiutati } = await creaIssue(projectKey, nodo, summary, parentKey, campi);
      mappa.set(nodo.key, key);
      Object.assign(esito, { stato: "creato", key, url: url(key) });
      if (rifiutati.length) esito.message = "Campi non copiati: " + rifiutati.join(" · ");
    } catch (e) {
      Object.assign(esito, { stato: "errore", message: String((e as Error)?.message || e) });
    }
  }
  return { projectKey, radice, esiti, avvisi };
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
  if (role !== "admin" && role !== "responsabile") return json({ error: "Solo admin e responsabili possono creare strutture Jira" }, 403);

  let p: any;
  try { p = await req.json(); } catch { return json({ error: "JSON non valido" }, 400); }
  const modelloKey = String(p?.modelloKey || "").trim().toUpperCase();
  if (!/^[A-Z][A-Z0-9_]*-\d+$/.test(modelloKey)) return json({ error: "Chiave del modello non valida (es. AI029-604)" }, 400);

  if (p?.mode === "modello") {
    try {
      const { projectKey, nodi } = await leggiModello(modelloKey);
      const chiavi = nodi.map((n) => n.key);
      const avvisi: string[] = [];
      const out = [];
      const dateDaChiedere = new Set<string>();
      for (const n of nodi) {
        const meta = await campiCreazione(projectKey, n.tipoId);
        const piano = pianoCampi(n, meta, chiavi, "MODELLO");
        piano.daChiedere.forEach((d) => dateDaChiedere.add(d));
        if (!/_?MODELLO/.test(n.summary)) avvisi.push(`${n.key} "${n.summary}": il titolo non contiene "MODELLO", verrà copiato uguale per ogni comune.`);
        out.push({
          key: n.key, summary: n.summary, tipo: n.tipo, tipoId: n.tipoId, livello: n.livello, parentKey: n.parentKey,
          assegnatario: String(n.fields?.assignee?.displayName || ""), campi: piano.nomi, saltati: piano.saltati, date: piano.daChiedere,
        });
      }
      if (nodi.length >= MAX_NODI) avvisi.push(`Il modello ha più di ${MAX_NODI} issue: copiate solo le prime ${MAX_NODI}.`);
      return json({ modello: { key: modelloKey, projectKey, base: JIRA_BASE_URL, nodi: out, avvisi, date: [...dateDaChiedere] } });
    } catch (e) {
      return json({ error: String((e as Error)?.message || e) }, 502);
    }
  }

  if (p?.mode !== "comune") return json({ error: "Modalità non valida" }, 400);
  const commessa = String(p?.commessa || "").trim();
  const comune = String(p?.comune || "").replace(/\s+/g, " ").trim();
  const dryRun = !!p?.dryRun;
  const isoOk = (d: unknown) => /^\d{4}-\d{2}-\d{2}$/.test(String(d || ""));
  const date: DateScelte = p?.date && (isoOk(p.date.inizio) || isoOk(p.date.scadenza))
    ? { inizio: isoOk(p.date.inizio) ? String(p.date.inizio) : "", scadenza: isoOk(p.date.scadenza) ? String(p.date.scadenza) : "" }
    : null;
  if (date && date.inizio && date.scadenza && date.inizio > date.scadenza) return json({ error: "La data di inizio è dopo la scadenza" }, 400);
  const escludi = new Set<string>(Array.isArray(p?.escludi) ? p.escludi.map((k: unknown) => String(k).trim().toUpperCase()).filter(Boolean) : []);
  if (!commessa) return json({ error: "Commessa mancante" }, 400);
  if (!comune || comune.length > 120) return json({ error: "Nome del comune non valido" }, 400);

  let r;
  try {
    r = await strutturaComune(modelloKey, comune, dryRun, date, escludi);
  } catch (e) {
    return json({ comune, error: String((e as Error)?.message || e) }, 502);
  }
  const radiceKey = r.esiti[0]?.key || "";
  if (dryRun) return json({ comune, radiceKey, salvato: false, nodi: r.esiti, avvisi: r.avvisi });

  let salvato = false;
  const conChiave = r.esiti.filter((e) => e.key);
  if (radiceKey) {
    const { error } = await admin.from(TABELLA).upsert({
      commessa, comune, comune_norm: normNome(comune), project_key: r.projectKey, modello_key: modelloKey,
      radice_key: radiceKey,
      nodi: conChiave.map((e) => ({ modello: e.modello, key: e.key, summary: e.summary, tipo: e.tipo, livello: e.livello })),
      stato: conChiave.length === r.esiti.length ? "completa" : "parziale",
      updated_at: new Date().toISOString(), updated_by: callerData.user.email,
    }, { onConflict: "commessa,comune_norm" });
    salvato = !error;
    if (error) r.avvisi.push("Chiavi non salvate nell'app: " + error.message);
  }
  const creati = r.esiti.filter((e) => e.stato === "creato").map((e) => e.key);
  if (creati.length) {
    try {
      await admin.from("activity_log").insert({
        user_email: callerData.user.email,
        action: "Struttura Jira comune creata",
        details: { commessa, comune, modello: modelloKey, radice: radiceKey, creati, errori: r.esiti.filter((e) => e.stato === "errore").length },
      });
    } catch { /* il log non deve far fallire la creazione già fatta */ }
  }
  return json({ comune, radiceKey, salvato, nodi: r.esiti, avvisi: r.avvisi });
});
