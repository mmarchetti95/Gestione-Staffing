// supabase/functions/jira-create-subtask/index.ts
//
// Edge Function: crea sottotask Jira a partire dalla pianificazione della
// Griglia settimanale. Per ogni item: risolve l'accountId dell'operatore da
// email (assegnabile al progetto specifico), verifica se sotto il Task
// indicato esiste gia' un sottotask assegnato a quell'operatore PER LA STESSA
// WEEK (idempotenza — vedi findExistingSubtask) e, solo se manca, lo crea.
// Con dryRun:true fa solo il check di esistenza (usato per l'anteprima prima
// della conferma utente).
//
// Un secondo mode ("fields") espone i campi extra (Data di scadenza, Stima
// originale, Activity Type, Target Production, Production Weight (%), Start
// date pianificato, Tempo Team) che su alcuni progetti sono obbligatori in
// creazione ma NON sono segnalati come required=true da /issue/createmeta
// (limite noto di questa istanza Jira, verificato empiricamente: createmeta li
// marca required=false ma la POST /issue li rifiuta con "Inserire: <campo>").
// Il frontend li mostra come form con un sample precompilato, editabile,
// prima della creazione reale — vedi weekly-jira-subtask.js.
//
// SECRET RICHIESTI (gli stessi delle altre funzioni Jira):
//   JIRA_BASE_URL, JIRA_EMAIL, JIRA_API_TOKEN
// ENV OPZIONALE:
//   JIRA_SUBTASK_ISSUETYPE  (default "Sottotask")
//
// Contratto richiesta (POST, JSON) — creazione:
//   { "items": [
//       { "projectKey": "W07R", "taskKey": "W07R-45",
//         "operatorEmail": "mrossi@eagleprojects.it",
//         "summary": "Rilievo GPS - Ivrea - Rossi - Week 37",
//         "targetProduction": 12,     // opzionale, ereditato dal Task padre lato client
//         "productionWeight": 0.5,    // opzionale, per-Task, normalizzato a 1 (0.5 = 50%); il client converte dalla % mostrata in UI
//         "activityType": "14500" },  // opzionale, per attivita' della Griglia (v18.182.0), prevale su extraFields.activityType
//       ...
//     ],
//     "dryRun": false,
//     "week": 37,   // usata SOLO per il controllo anti-duplicati (vedi sotto)
//     "extraFields": { "duedate": "2026-09-02", "originalEstimate": "8h",
//                       "activityType": "14500",
//                       "startDatePianificato": "2026-08-31", "tempoTeam": "55" } }
//
// NB: targetProduction, productionWeight e activityType sono per-item (un
// batch puo' includere piu' Task/comuni/attivita' diversi, ciascuno col
// proprio Target Production ereditato, col proprio numero di operatori,
// quindi peso diverso, e col proprio Activity Type) — a differenza degli
// altri extraFields, condivisi da tutto il batch.
//
// Contratto risposta (JSON) — creazione:
//   { "results": [
//       { "taskKey", "operatorEmail", "status": "created"|"already_exists"|"would_create"|"error",
//         "key"?, "url"?, "message"? },
//       ...
//     ] }
//
// Contratto richiesta — scoperta campi extra:
//   { "mode": "fields", "projectKey": "W07R" }
// Contratto risposta:
//   { "fields": [ { "key", "name", "type", "allowedValues"? }, ... ] }
// (solo i campi tra quelli noti che esistono davvero per quel progetto/issuetype)
//
// Tempo Team (customfield_10602) e' un campo del plugin Tempo: i team vivono
// in Tempo, non in Jira, e createmeta non ne restituisce le voci (per questo
// il frontend mostrava un campo di testo in cui digitare l'id numerico). Le
// voci si ricavano dai valori gia' presenti sui ticket esistenti (prima del
// progetto, poi di tutta l'istanza) — vedi fetchTempoTeamValues. Un team mai
// usato su nessun ticket non compare: in quel caso resta il campo di testo.

const JIRA_BASE_URL      = (Deno.env.get("JIRA_BASE_URL")  || "").replace(/\/+$/, "");
const JIRA_EMAIL         =  Deno.env.get("JIRA_EMAIL")     || "";
const JIRA_API_TOKEN     =  Deno.env.get("JIRA_API_TOKEN") || "";
const SUBTASK_ISSUETYPE  =  Deno.env.get("JIRA_SUBTASK_ISSUETYPE") || "Sottotask";

// Campi extra noti che su questa istanza Jira possono essere obbligatori in
// creazione senza che createmeta lo segnali correttamente (vedi commento in
// testa al file). Chiave = customfield/system key Jira, extraKey = chiave
// usata nel payload extraFields lato frontend.
const KNOWN_EXTRA_FIELDS = [
  { key: "duedate",             extraKey: "duedate" },
  { key: "timetracking",        extraKey: "originalEstimate" },
  { key: "customfield_10402",   extraKey: "activityType" },
  { key: "customfield_11280",   extraKey: "targetProduction" },
  { key: "customfield_13027",   extraKey: "productionWeight" },
  { key: "customfield_13093",   extraKey: "startDatePianificato" },
  { key: "customfield_10602",   extraKey: "tempoTeam" },
];

const TEMPO_TEAM_FIELD = "customfield_10602";

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

function jiraAuthHeader(): string {
  return "Basic " + btoa(`${JIRA_EMAIL}:${JIRA_API_TOKEN}`);
}

async function jiraGet(path: string): Promise<Response> {
  return fetch(`${JIRA_BASE_URL}${path}`, {
    method: "GET",
    headers: { Authorization: jiraAuthHeader(), Accept: "application/json" },
  });
}

async function jiraPost(path: string, body: unknown): Promise<Response> {
  return fetch(`${JIRA_BASE_URL}${path}`, {
    method: "POST",
    headers: {
      Authorization: jiraAuthHeader(),
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

function jqlEscape(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

// Risolve l'accountId di un operatore SOLO tra gli utenti assegnabili al
// progetto indicato (non la ricerca utenti globale) — una email puo' matchare
// un account Jira esistente ma non autorizzato/assegnabile su quel
// progetto specifico, il che faceva fallire la creazione con un errore Jira
// poco chiaro ("Utente '...' non puo' essere assegnato ai ticket").
async function resolveAssignableAccountId(
  email: string,
  projectKey: string,
  cache: Map<string, string | null>,
): Promise<string | null> {
  const cacheKey = `${projectKey}::${email}`;
  if (cache.has(cacheKey)) return cache.get(cacheKey)!;
  const res = await jiraGet(`/rest/api/3/user/assignable/search?project=${encodeURIComponent(projectKey)}&query=${encodeURIComponent(email)}&maxResults=2`);
  if (!res.ok) { cache.set(cacheKey, null); return null; }
  const users = await res.json();
  if (!Array.isArray(users) || users.length === 0) { cache.set(cacheKey, null); return null; }
  const exact = users.find((u: any) => (u.emailAddress || "").toLowerCase() === email.toLowerCase());
  const chosen = exact || users[0];
  const accountId = chosen?.accountId || null;
  cache.set(cacheKey, accountId);
  return accountId;
}

// Un sottotask e' settimanale e nominativo: lo stesso operatore puo' avere un
// sottotask legittimo sotto lo stesso Task in week diverse (es. lavoro
// ricorrente sullo stesso cantiere/comune settimana dopo settimana). Il
// controllo di idempotenza va quindi ristretto, quando la week e' nota, alla
// week corrente (marker "Week N" nel summary — vedi pwJiraBuildSubtaskItem
// lato client) — altrimenti un vecchio sottotask di una week precedente
// risulterebbe erroneamente "already_exists" e bloccherebbe la creazione di
// quello nuovo. Se week non e' fornita (client meno recente), si ricade sul
// comportamento precedente (solo parent+assignee).
async function findExistingSubtask(taskKey: string, accountId: string, week: string): Promise<{ key: string } | null> {
  let jql = `parent = "${jqlEscape(taskKey)}" AND assignee = "${jqlEscape(accountId)}"`;
  if (week) jql += ` AND summary ~ "Week ${jqlEscape(week)}"`;
  const res = await jiraPost(`/rest/api/3/search/jql`, { jql, fields: ["summary"], maxResults: 1 });
  if (!res.ok) return null;
  const data = await res.json();
  const issue = (data.issues || [])[0];
  return issue ? { key: issue.key } : null;
}

async function resolveSubtaskIssueTypeId(projectKey: string): Promise<string | null> {
  const res = await jiraGet(`/rest/api/3/issue/createmeta/${encodeURIComponent(projectKey)}/issuetypes`);
  if (!res.ok) return null;
  const data = await res.json();
  const types = Array.isArray(data.issueTypes) ? data.issueTypes : [];
  const match = types.find((t: any) => (t.name || "").toLowerCase() === SUBTASK_ISSUETYPE.toLowerCase());
  return match?.id || null;
}

// Valore del campo Tempo Team letto da un ticket -> { id, value }. Il formato
// restituito dall'API non e' documentato in modo univoco (oggetto con
// id/name/title/value, oppure il solo id numerico o stringa): si accettano tutti.
function parseTempoTeamValue(v: any): { id: string; value: string } | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number" || typeof v === "string") {
    const id = String(v).trim();
    return id ? { id, value: `Team ${id}` } : null;
  }
  if (typeof v === "object") {
    const rawId = v.id ?? v.teamId ?? (typeof v.value === "object" ? v.value?.id : undefined);
    if (rawId === undefined || rawId === null || rawId === "") return null;
    const id = String(rawId).trim();
    const label = v.name || v.title || v.displayName || (typeof v.value === "string" ? v.value : "") || `Team ${id}`;
    return { id, value: String(label).trim() };
  }
  return null;
}

async function collectTempoTeams(jql: string, out: Map<string, string>): Promise<boolean> {
  const res = await jiraPost(`/rest/api/3/search/jql`, { jql, fields: [TEMPO_TEAM_FIELD], maxResults: 100 });
  if (!res.ok) return false;
  const data = await res.json();
  for (const issue of (data.issues || [])) {
    const parsed = parseTempoTeamValue(issue?.fields?.[TEMPO_TEAM_FIELD]);
    if (parsed && !out.has(parsed.id)) out.set(parsed.id, parsed.value);
  }
  return true;
}

// Voci per la tendina Tempo Team, dai ticket esistenti: prima quelli del
// progetto, poi (se nel progetto non ce n'e' nessuno) quelli dell'intera
// istanza — i team Tempo non sono per-progetto. Se la JQL con filtro sul campo
// non e' accettata (campo senza searcher), ripiega sui ticket piu' recenti
// del progetto, filtrando il valore qui.
async function fetchTempoTeamValues(projectKey: string): Promise<{ id: string; value: string }[]> {
  const out = new Map<string, string>();
  const pk = jqlEscape(projectKey);
  const ok = await collectTempoTeams(`project = "${pk}" AND cf[10602] is not EMPTY ORDER BY updated DESC`, out);
  if (!ok) await collectTempoTeams(`project = "${pk}" ORDER BY created DESC`, out);
  if (out.size === 0 && ok) await collectTempoTeams(`cf[10602] is not EMPTY ORDER BY updated DESC`, out);
  return [...out.entries()]
    .map(([id, value]) => ({ id, value }))
    .sort((a, b) => a.value.localeCompare(b.value, "it"));
}

async function fetchKnownExtraFields(projectKey: string): Promise<any[]> {
  const issueTypeId = await resolveSubtaskIssueTypeId(projectKey);
  if (!issueTypeId) return [];
  const res = await jiraGet(`/rest/api/3/issue/createmeta/${encodeURIComponent(projectKey)}/issuetypes/${issueTypeId}?maxResults=200`);
  if (!res.ok) return [];
  const data = await res.json();
  const allFields = Array.isArray(data.fields) ? data.fields : [];
  const byKey = new Map(allFields.map((f: any) => [f.fieldId || f.key, f]));
  const out: any[] = [];
  for (const known of KNOWN_EXTRA_FIELDS) {
    const f: any = byKey.get(known.key);
    if (!f) continue;
    let allowedValues = Array.isArray(f.allowedValues) && f.allowedValues.length
      ? f.allowedValues.map((v: any) => ({ id: v.id, value: v.value || v.name }))
      : undefined;
    if (!allowedValues && known.key === TEMPO_TEAM_FIELD) {
      try {
        const teams = await fetchTempoTeamValues(projectKey);
        if (teams.length) allowedValues = teams;
      } catch { /* resta il campo di testo */ }
    }
    out.push({
      key: known.key,
      extraKey: known.extraKey,
      name: String(f.name || known.key).trim(),
      type: f.schema?.type || "string",
      allowedValues,
    });
  }
  return out;
}

// Campi condivisi da tutto il batch (esclude targetProduction e
// productionWeight, entrambi per-item — vedi buildItemTargetProductionField
// e buildItemProductionWeightField; activityType puo' essere sovrascritto
// per-item, vedi buildItemActivityTypeField).
function buildExtraFieldsPayload(extraFields: any): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (!extraFields || typeof extraFields !== "object") return out;
  if (extraFields.duedate) out.duedate = String(extraFields.duedate);
  if (extraFields.originalEstimate) out.timetracking = { originalEstimate: String(extraFields.originalEstimate) };
  if (extraFields.activityType) out.customfield_10402 = { id: String(extraFields.activityType) };
  if (extraFields.startDatePianificato) out.customfield_13093 = String(extraFields.startDatePianificato);
  if (extraFields.tempoTeam) out.customfield_10602 = Number(extraFields.tempoTeam);
  return out;
}

// Target Production e' per-item (ereditato dal Task padre di QUELLO
// specifico item lato client, vedi pwJiraBuildSubtaskItem/jira-list-tasks):
// un batch puo' includere piu' Task/comuni con Target Production diversi,
// quindi non puo' essere un valore unico condiviso come gli altri extraFields.
function buildItemTargetProductionField(item: any): Record<string, unknown> {
  const v = item?.targetProduction;
  if (v === undefined || v === null || v === "") return {};
  return { customfield_11280: Number(v) };
}

// Production Weight (%) e' per-item, non condiviso da tutto il batch: un
// batch puo' includere piu' Task diversi, ciascuno con un numero diverso di
// operatori assegnati, quindi il peso corretto e' 100 / operatori sotto QUEL
// Task, non sul totale del batch — calcolato lato client raggruppando per
// taskKey (vedi pwJiraSubtaskOpenExtraFieldsModal) e inviato qui gia' pronto
// per item.
function buildItemProductionWeightField(item: any): Record<string, unknown> {
  const v = item?.productionWeight;
  if (v === undefined || v === null || v === "") return {};
  return { customfield_13027: Number(v) };
}

// Activity Type per-item: in Griglia ogni cantiere ha la sua attivita', e lo
// stesso cantiere con due attivita' diverse genera due sottotask con due
// Activity Type diversi nello stesso batch. Se presente prevale su
// extraFields.activityType (client meno recenti inviano solo quello).
function buildItemActivityTypeField(item: any): Record<string, unknown> {
  const v = item?.activityType;
  if (v === undefined || v === null || v === "") return {};
  return { customfield_10402: { id: String(v) } };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "Metodo non consentito" }, 405);

  const authz = req.headers.get("Authorization") || "";
  if (!authz.startsWith("Bearer ")) return json({ error: "Non autenticato" }, 401);

  if (!JIRA_BASE_URL || !JIRA_EMAIL || !JIRA_API_TOKEN) {
    return json({ error: "Secret Jira non configurati (JIRA_BASE_URL / JIRA_EMAIL / JIRA_API_TOKEN)" }, 500);
  }

  let payload: any;
  try { payload = await req.json(); } catch { return json({ error: "JSON non valido" }, 400); }

  if (payload?.mode === "fields") {
    const projectKey = String(payload?.projectKey || "").trim();
    if (!projectKey) return json({ error: "projectKey mancante" }, 400);
    try {
      const fields = await fetchKnownExtraFields(projectKey);
      return json({ fields });
    } catch (e) {
      return json({ error: String((e as Error)?.message || e) }, 500);
    }
  }

  const items: any[] = Array.isArray(payload?.items) ? payload.items : [];
  const dryRun = !!payload?.dryRun;
  const week = payload?.week !== undefined && payload?.week !== null ? String(payload.week).trim() : "";
  const extraFieldsPayload = buildExtraFieldsPayload(payload?.extraFields);
  if (items.length === 0) return json({ error: "Nessun item fornito" }, 400);

  const accountIdCache = new Map<string, string | null>();
  const results: any[] = [];

  for (const item of items) {
    const projectKey    = String(item?.projectKey || "").trim();
    const taskKey       = String(item?.taskKey || "").trim();
    const operatorEmail = String(item?.operatorEmail || "").trim();
    const summary       = String(item?.summary || "").trim();

    if (!projectKey || !taskKey || !operatorEmail || !summary) {
      results.push({ taskKey, operatorEmail, status: "error", message: "campi mancanti (projectKey/taskKey/operatorEmail/summary)" });
      continue;
    }

    try {
      const accountId = await resolveAssignableAccountId(operatorEmail, projectKey, accountIdCache);
      if (!accountId) {
        results.push({ taskKey, operatorEmail, status: "error", message: `Nessun utente Jira assegnabile su ${projectKey} per ${operatorEmail} (verificare permessi/membership del progetto)` });
        continue;
      }

      const existing = await findExistingSubtask(taskKey, accountId, week);
      if (existing) {
        results.push({
          taskKey, operatorEmail, status: "already_exists",
          key: existing.key, url: `${JIRA_BASE_URL}/browse/${existing.key}`,
        });
        continue;
      }

      if (dryRun) {
        results.push({ taskKey, operatorEmail, status: "would_create" });
        continue;
      }

      const createRes = await jiraPost(`/rest/api/3/issue`, {
        fields: {
          project: { key: projectKey },
          parent: { key: taskKey },
          issuetype: { name: SUBTASK_ISSUETYPE },
          summary,
          assignee: { accountId },
          ...extraFieldsPayload,
          ...buildItemTargetProductionField(item),
          ...buildItemProductionWeightField(item),
          ...buildItemActivityTypeField(item),
        },
      });

      if (!createRes.ok) {
        let detail = `POST issue HTTP ${createRes.status}`;
        try { const b = await createRes.json(); if (b) detail += " " + JSON.stringify(b); } catch { /* ignore */ }
        results.push({ taskKey, operatorEmail, status: "error", message: detail });
        continue;
      }

      const created = await createRes.json();
      results.push({
        taskKey, operatorEmail, status: "created",
        key: created.key, url: `${JIRA_BASE_URL}/browse/${created.key}`,
      });
    } catch (e) {
      results.push({ taskKey, operatorEmail, status: "error", message: String((e as Error)?.message || e) });
    }
  }

  return json({ results });
});
