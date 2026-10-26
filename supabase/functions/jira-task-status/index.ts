// supabase/functions/jira-task-status/index.ts
//
// Edge Function: dato un elenco di chiavi di SOTTOTASK Jira, risale al Task
// padre di ciascuno e ne restituisce lo stato. Sola lettura.
//
// Usata dallo screen "Mappa" (src/js/mappa-live.js) per colorare i cantieri in
// base allo stato di avanzamento del Task, non del sottotask: il sottotask e'
// settimanale e nominativo (uno per operatore/week), il Task e' il cantiere/
// comune vero e proprio, quindi e' il Task a dire se quel cantiere e' da fare,
// in corso o concluso.
//
// Perche' si parte dai sottotask e non dal nome del comune: l'associazione
// cantiere -> Task NON e' ricostruibile per euristica. Epic e Task vengono
// scelti a mano dall'utente nel modale "Sottotask Jira" e di quella scelta
// resta traccia solo nella chiave del sottotask creato (bc.jiraSubtask in
// pwData). Il campo "parent" del sottotask e' quindi l'unico legame certo.
// I cantieri senza sottotask restano deliberatamente senza stato.
//
// SECRET RICHIESTI (gli stessi delle altre funzioni Jira):
//   JIRA_BASE_URL, JIRA_EMAIL, JIRA_API_TOKEN
//
// Contratto richiesta (POST, JSON):
//   { "subtaskKeys": ["W07R-451", "W07R-452", ...],    // max 500
//     "soloSottotask": true,                           // opzionale: salta i Task padre
//     "statoDa": true,                                 // opzionale: ora dell'ultimo cambio di stato
//     "emails": ["mario.rossi@...", ...] }             // opzionale (max 300): email -> accountId
//
// Contratto risposta (JSON):
//   {
//     "bySubtask": { "W07R-451": "W07R-45", ... },      // sottotask -> Task padre
//     "tasks": {
//       "W07R-45": {
//         "key": "W07R-45", "summary": "...", "issuetype": "Story",
//         "status": "In Progress", "statusCategory": "indeterminate",
//         "url": "https://.../browse/W07R-45",
//         "targetProduction": 12, "resolutiondate": null,
//         "assignee": "Mario Rossi",
//         "epicKey": "W07R-12", "epicName": "..."
//       }, ...
//     },
//     "subtasks": {                                     // stato del sottotask stesso
//       "W07R-451": { "key": "W07R-451", "summary": "...", "status": "Done",
//                     "statusCategory": "done", "url": "https://.../browse/W07R-451",
//                     "statoDa": "2026-10-23T05:42:11.000Z",      // solo con "statoDa": true
//                     "statoDaAutore": "Mario Rossi",
//                     "assignee": { "accountId": "...", "displayName": "Mario Rossi" } | null }
//     },
//     "accountByEmail": { "mario.rossi@...": "5b10...", "x@...": null },   // solo con "emails"
//     "count": 1
//   }
// "subtasks" e' usato dalla colonna "Stato" di Controllo Produzione
// (src/js/produzione-core.js); la Mappa legge solo bySubtask/tasks.
// statusCategory e' una delle tre categorie Jira ("new" | "indeterminate" |
// "done"): il frontend colora su quella, non sul nome dello stato, che varia
// da workflow a workflow.
//
// "statoDa" (dalla v18.220.0, richiesto da Controllo Produzione): per i sottotask
// in categoria "indeterminate" (IN PROGRESS / IN PENDING) e' l'ora dell'ultima
// transizione verso lo stato attuale, letta dal changelog. Serve a mostrare da
// quando un operatore sta lavorando: il worklog lo crea un'automazione Jira solo
// all'uscita da IN PROGRESS, quindi fino ad allora l'unica traccia e' la
// transizione. Il campo di sistema "statuscategorychangedate" non basta: IN
// PENDING -> IN PROGRESS resta nella stessa categoria e non lo aggiorna.
// Se il changelog non si legge, i sottotask escono senza "statoDa" (nessun errore).
//
// "assignee" + "emails" (dalla v18.223.0, controllo "🎫 Sottotask" della Griglia):
// un sottotask riassegnato su Jira a un altro operatore resta in Griglia sotto il
// primo. Il confronto si fa sull'accountId, non sul nome ne' sull'email
// dell'assegnatario (Jira la nasconde spesso per privacy): il client manda le
// email degli operatori in anagrafica e qui diventano accountId con la ricerca
// utenti (email esatta, oppure l'unico utente trovato). null = email non
// risolta: il client non confronta quell'operatore.

const JIRA_BASE_URL  = (Deno.env.get("JIRA_BASE_URL")  || "").replace(/\/+$/, "");
const JIRA_EMAIL     =  Deno.env.get("JIRA_EMAIL")     || "";
const JIRA_API_TOKEN =  Deno.env.get("JIRA_API_TOKEN") || "";

// Limite di chiavi per singola JQL "key in (...)": Jira accetta liste lunghe ma
// la query ha un tetto pratico; 100 e' lo stesso batch usato da jira-list-tasks.
const CHUNK = 100;
const MAX_SUBTASKS = 500;

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

function chunked<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function jiraGet(path: string): Promise<Response> {
  return fetch(`${JIRA_BASE_URL}${path}`, {
    headers: { Authorization: jiraAuthHeader(), Accept: "application/json" },
  });
}

// Ultima transizione verso lo stato attuale fra le history di un changelog
// (confronto sull'id dello stato, oppure sul nome se l'id non torna).
// "created" arriva come millisecondi dalla bulkfetch e come stringa Jira
// ("2026-10-23T07:42:11.000+0200") dal changelog per issue: esce sempre ISO UTC.
function ultimaTransizione(histories: any[], statusId: string, statusName: string): { created: string; autore: string } | null {
  const nome = statusName.trim().toLowerCase();
  let best: any = null, bestT = -Infinity;
  for (const h of histories || []) {
    const ok = (h.items || []).some((it: any) =>
      (it.fieldId === "status" || it.field === "status") &&
      (String(it.to) === statusId || (!!nome && typeof it.toString === "string" && it.toString.trim().toLowerCase() === nome)));
    if (!ok) continue;
    const t = typeof h.created === "number"
      ? h.created
      : Date.parse(String(h.created || "").replace(/([+-]\d{2})(\d{2})$/, "$1:$2"));
    if (isNaN(t) || t <= bestT) continue;
    bestT = t;
    best = { created: new Date(t).toISOString(), autore: h.author?.displayName || "" };
  }
  return best;
}

// Changelog (solo campo status) delle issue indicate: chiave issue -> history.
// Prima la bulkfetch (una chiamata per tutte); le issue che non ne escono con
// almeno una history passano dal changelog per issue.
async function changelogStato(issues: { id: string; key: string }[]): Promise<Record<string, any[]>> {
  const out: Record<string, any[]> = {};
  await changelogBulk(issues, out);
  const mancanti = issues.filter((i) => !(out[i.key] || []).length);
  if (mancanti.length) await changelogPerIssue(mancanti, out);
  return out;
}

async function changelogBulk(issues: { id: string; key: string }[], out: Record<string, any[]>): Promise<void> {
  try {
    const keyById: Record<string, string> = {};
    issues.forEach((i) => { keyById[i.id] = i.key; });
    let nextPageToken: string | undefined = undefined;
    do {
      const body: Record<string, unknown> = {
        issueIdsOrKeys: issues.map((i) => i.key), fieldIds: ["status"], maxResults: 1000,
      };
      if (nextPageToken) body.nextPageToken = nextPageToken;
      const res = await jiraPost(`/rest/api/3/changelog/bulkfetch`, body);
      if (!res.ok) throw new Error(`changelog/bulkfetch HTTP ${res.status}`);
      const data = await res.json();
      const logs = data.issueChangeLogs || [];
      if (!logs.length) console.warn("[jira-task-status] bulkfetch vuota, chiavi risposta:", Object.keys(data || {}).join(","));
      logs.forEach((c: any) => {
        const k = keyById[String(c.issueId)] || String(c.issueKey || c.issueId);
        out[k] = (out[k] || []).concat(c.changeHistories || []);
      });
      nextPageToken = data.nextPageToken;
    } while (nextPageToken);
  } catch (e) {
    console.warn("[jira-task-status] bulkfetch non disponibile, changelog per issue:", String(e));
  }
}

async function changelogPerIssue(issues: { id: string; key: string }[], out: Record<string, any[]>): Promise<void> {
  for (const i of issues) {
    try {
      // Il changelog e' in ordine cronologico: basta l'ultima pagina.
      let res = await jiraGet(`/rest/api/3/issue/${encodeURIComponent(i.key)}/changelog?maxResults=100`);
      if (!res.ok) { console.warn(`[jira-task-status] changelog ${i.key} HTTP ${res.status}`); continue; }
      let data = await res.json();
      if (Number(data.total) > 100) {
        res = await jiraGet(`/rest/api/3/issue/${encodeURIComponent(i.key)}/changelog?maxResults=100&startAt=${Number(data.total) - 100}`);
        if (!res.ok) continue;
        data = await res.json();
      }
      out[i.key] = data.values || [];
    } catch { /* senza statoDa */ }
  }
}

const MAX_EMAILS = 300;

// email (minuscola) -> accountId | null, poche richieste alla volta.
async function accountIdDaEmail(emails: string[]): Promise<Record<string, string | null>> {
  const out: Record<string, string | null> = {};
  for (const group of chunked(emails, 8)) {
    await Promise.all(group.map(async (email) => {
      try {
        const res = await jiraGet(`/rest/api/3/user/search?query=${encodeURIComponent(email)}&maxResults=5`);
        if (!res.ok) { out[email] = null; return; }
        const users = (await res.json() || []).filter((u: any) => u && u.accountId && u.accountType !== "app");
        const exact = users.find((u: any) => (u.emailAddress || "").toLowerCase() === email);
        const chosen = exact || (users.length === 1 ? users[0] : null);
        out[email] = chosen ? String(chosen.accountId) : null;
      } catch { out[email] = null; }
    }));
  }
  return out;
}

// Esegue una search JQL paginata e restituisce tutte le issue trovate.
// Le chiavi inesistenti o non visibili all'utente Jira vengono semplicemente
// omesse dal risultato (nessun errore): il chiamante le tratta come "senza stato".
async function jiraSearch(keys: string[], fields: string[]): Promise<any[]> {
  const issues: any[] = [];
  for (const group of chunked(keys, CHUNK)) {
    const jql = `key in (${group.map((k) => `"${jqlEscape(k)}"`).join(",")})`;
    let nextPageToken: string | undefined = undefined;
    do {
      const body: Record<string, unknown> = { jql, fields, maxResults: CHUNK };
      if (nextPageToken) body.nextPageToken = nextPageToken;
      const res = await jiraPost(`/rest/api/3/search/jql`, body);
      if (!res.ok) {
        let detail = `search/jql HTTP ${res.status}`;
        try { const b = await res.json(); if (b) detail += " " + JSON.stringify(b); } catch { /* ignore */ }
        throw new Error(detail);
      }
      const data = await res.json();
      (data.issues || []).forEach((iss: any) => issues.push(iss));
      nextPageToken = data.nextPageToken;
    } while (nextPageToken);
  }
  return issues;
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

  const rawKeys = Array.isArray(payload?.subtaskKeys) ? payload.subtaskKeys : [];
  const subtaskKeys = [...new Set(
    rawKeys.map((k: unknown) => String(k || "").trim()).filter((k: string) => k),
  )] as string[];

  const emails = [...new Set(
    (Array.isArray(payload?.emails) ? payload.emails : [])
      .map((e: unknown) => String(e || "").trim().toLowerCase()).filter((e: string) => e.includes("@")),
  )].slice(0, MAX_EMAILS) as string[];

  if (!subtaskKeys.length) return json({ bySubtask: {}, tasks: {}, subtasks: {}, count: 0 });
  if (subtaskKeys.length > MAX_SUBTASKS) {
    return json({ error: `Troppi sottotask richiesti (${subtaskKeys.length}, massimo ${MAX_SUBTASKS})` }, 400);
  }

  try {
    // Passo 1: sottotask -> chiave del Task padre, piu' lo stato del sottotask stesso.
    const [subIssues, accountByEmail] = await Promise.all([
      jiraSearch(subtaskKeys, ["parent", "status", "summary", "assignee"]),
      emails.length ? accountIdDaEmail(emails) : Promise.resolve(undefined),
    ]);
    const bySubtask: Record<string, string> = {};
    const subtasks: Record<string, any> = {};
    subIssues.forEach((iss: any) => {
      if (!iss.key) return;
      const f = iss.fields || {};
      if (f.parent?.key) bySubtask[iss.key] = f.parent.key;
      subtasks[iss.key] = {
        key: iss.key,
        summary: f.summary || iss.key,
        status: f.status?.name || "",
        statusCategory: f.status?.statusCategory?.key || "",
        url: `${JIRA_BASE_URL}/browse/${iss.key}`,
        assignee: f.assignee?.accountId
          ? { accountId: String(f.assignee.accountId), displayName: f.assignee.displayName || "" }
          : null,
      };
    });

    if (payload?.statoDa === true) {
      const inCorso = subIssues.filter((iss: any) =>
        iss.key && iss.id && iss.fields?.status?.statusCategory?.key === "indeterminate");
      if (inCorso.length) {
        const logs = await changelogStato(inCorso.map((iss: any) => ({ id: String(iss.id), key: iss.key })));
        inCorso.forEach((iss: any) => {
          const tr = ultimaTransizione(logs[iss.key] || [], String(iss.fields.status.id || ""), String(iss.fields.status.name || ""));
          if (tr) { subtasks[iss.key].statoDa = tr.created; subtasks[iss.key].statoDaAutore = tr.autore; return; }
          const h = logs[iss.key] || [];
          const recenti = h.slice(-3).map((x: any) => x.created + " " + (x.items || [])
            .filter((it: any) => it.fieldId === "status" || it.field === "status")
            .map((it: any) => `${it.fromString}(${it.from})->${it.toString}(${it.to})`).join(",")).join(" | ");
          console.warn(`[jira-task-status] ${iss.key}: nessuna transizione verso ${iss.fields.status.name}(${iss.fields.status.id}) fra ${h.length} history; ultime: ${recenti}`);
        });
      }
    }

    // Il polling di Controllo Produzione (ogni 30s) vuole solo lo stato dei
    // sottotask: niente seconda search sui Task padre.
    if (payload?.soloSottotask === true) {
      return json({ bySubtask, tasks: {}, subtasks, accountByEmail, count: 0 });
    }

    const taskKeys = [...new Set(Object.values(bySubtask))];
    if (!taskKeys.length) return json({ bySubtask, tasks: {}, subtasks, accountByEmail, count: 0 });

    // Passo 2: dati dei Task padre. "parent" e' richiesto anche qui perche' il
    // padre del Task e' l'Epic (stessa gerarchia via campo parent usata da
    // jira-list-tasks), utile al frontend per raggruppare per Epic.
    const taskIssues = await jiraSearch(taskKeys, [
      "summary", "issuetype", "status", "customfield_11280", "resolutiondate", "assignee", "parent",
    ]);

    const tasks: Record<string, unknown> = {};
    taskIssues.forEach((iss: any) => {
      if (!iss.key) return;
      const f = iss.fields || {};
      const tp = f.customfield_11280;
      tasks[iss.key] = {
        key: iss.key,
        summary: f.summary || iss.key,
        issuetype: f.issuetype?.name || "",
        status: f.status?.name || "",
        statusCategory: f.status?.statusCategory?.key || "",
        url: `${JIRA_BASE_URL}/browse/${iss.key}`,
        targetProduction: (tp === undefined || tp === null) ? null : Number(tp),
        resolutiondate: f.resolutiondate || null,
        assignee: f.assignee?.displayName || "",
        epicKey: f.parent?.key || "",
        epicName: f.parent?.fields?.summary || "",
      };
    });

    return json({ bySubtask, tasks, subtasks, accountByEmail, count: Object.keys(tasks).length });
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 500);
  }
});
