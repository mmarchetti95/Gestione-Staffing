// supabase/functions/jira-sync-worklogs/index.ts
//
// Edge Function: proxy sicuro verso Jira Cloud per la sincronizzazione dei worklog.
// Riceve una lista di email operatore + un intervallo di date (lunedì..sabato)
// e ritorna, per ogni email e per ogni giorno, le ore totali registrate su Jira
// e la lista dei ticket coinvolti. NON scrive su Supabase: la persistenza è
// gestita dal frontend (Deploy D).
//
// FIX (data odierna): il matching worklog<->operatore basato su worklog.author
// perdeva i worklog inseriti tramite l'app "Tempo Timesheets", perché in quel
// caso l'author del worklog e' l'account dell'app e non la persona.
// Ora il match e' basato sull'ISSUE (assignee, con fallback su summary), e per
// ogni issue si sommano TUTTI i worklog nel range di date, indipendentemente
// dall'autore.
//
// v18.210.0: ogni ticket porta anche "summary" e "worklogs" (i singoli worklog del
// giorno con orario di inizio, durata e commento) per l'infografica oraria della
// colonna "Ore Jira" in Controllo Produzione. Aggiunta retrocompatibile: "hours"
// resta la somma del ticket nel giorno.
//
// v18.230.0: ogni worklog porta anche "id" (l'id Jira del worklog), per correggerlo o
// eliminarlo dalla Timeline worklog tramite jira-worklog-edit. Aggiunta retrocompatibile.
//
// SECRET RICHIESTI (Supabase → Edge Functions → Secrets):
//   JIRA_BASE_URL   es. https://eagleprojects.atlassian.net   (senza slash finale)
//   JIRA_EMAIL      email dell'account Atlassian titolare del token
//   JIRA_API_TOKEN  API token generato su id.atlassian.com/manage-profile/security/api-tokens
//
// Contratto richiesta (POST, JSON):
//   { "emails": ["fangeluzzi@eagleprojects.it", ...],
//     "startDate": "2026-05-25", "endDate": "2026-05-30" }
//
// Contratto risposta (JSON):
//   { "results": {
//        "fangeluzzi@eagleprojects.it": {
//           "2026-05-25": { "hours": 8, "tickets": [{"key":"ABC-1","url":"...","hours":8,
//              "summary":"...", "epic": {...} | null,
//              "worklogs":[{"id":"10234","started":"2026-05-25T08:00:00.000+0200","seconds":28800,"comment":"..."}]}] }
//        }
//     },
//     "errors": { "email@...": "motivo" } }

const JIRA_BASE_URL  = (Deno.env.get("JIRA_BASE_URL")  || "").replace(/\/+$/, "");
const JIRA_EMAIL     =  Deno.env.get("JIRA_EMAIL")     || "";
const JIRA_API_TOKEN =  Deno.env.get("JIRA_API_TOKEN") || "";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Lunghezza massima del commento di un worklog restituito (finisce in jira_tickets)
const MAX_COMMENT = 300;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

// Header di autenticazione Basic verso Jira (email:token in base64)
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

// Escapa le doppie virgolette per un uso sicuro dentro literal JQL tra " ... "
function jqlEscape(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

// Testo semplice di un commento worklog (API v3: Atlassian Document Format)
function adfText(node: any): string {
  if (!node) return "";
  if (typeof node === "string") return node;
  if (node.type === "text") return node.text || "";
  if (node.type === "hardBreak") return " ";
  return (Array.isArray(node.content) ? node.content : []).map(adfText).join(" ");
}

function commentText(c: any): string {
  const t = adfText(c).replace(/\s+/g, " ").trim();
  return t.length > MAX_COMMENT ? t.slice(0, MAX_COMMENT - 1) + "…" : t;
}

// Risolve accountId + displayName Jira a partire dall'email. Ritorna null se non trovato.
async function resolveAccountId(email: string): Promise<{ accountId: string; displayName: string } | null> {
  const res = await jiraGet(`/rest/api/3/user/search?query=${encodeURIComponent(email)}&maxResults=2`);
  if (!res.ok) throw new Error(`user/search HTTP ${res.status}`);
  const users = await res.json();
  if (!Array.isArray(users) || users.length === 0) return null;
  // Preferisci il match esatto sull'email se disponibile, altrimenti il primo attivo
  const exact = users.find((u: any) => (u.emailAddress || "").toLowerCase() === email.toLowerCase());
  const chosen = exact || users.find((u: any) => u.active) || users[0];
  if (!chosen?.accountId) return null;
  return { accountId: chosen.accountId, displayName: chosen.displayName || "" };
}

type IssueRef = { key: string; summary: string };

// Esegue una ricerca JQL con paginazione (nextPageToken) e ritorna chiave + summary delle issue.
async function searchIssues(jql: string): Promise<IssueRef[]> {
  const out: IssueRef[] = [];
  let nextPageToken: string | undefined = undefined;
  do {
    const body: Record<string, unknown> = { jql, fields: ["summary"], maxResults: 100 };
    if (nextPageToken) body.nextPageToken = nextPageToken;
    const res = await jiraPost(`/rest/api/3/search/jql`, body);
    if (!res.ok) throw new Error(`search/jql HTTP ${res.status}`);
    const data = await res.json();
    (data.issues || []).forEach((iss: any) => {
      if (iss.key) out.push({ key: iss.key, summary: iss.fields?.summary || "" });
    });
    nextPageToken = data.nextPageToken;
  } while (nextPageToken);
  return out;
}

// Trova le issue rilevanti per l'operatore nell'intervallo di date.
// Match primario: assignee dell'issue (resta corretto anche sui worklog Tempo).
// Fallback (solo se il primario non trova nulla): nome operatore nel summary.
async function findIssuesForOperator(
  accountId: string, displayName: string, startDate: string, endDate: string,
): Promise<IssueRef[]> {
  const jqlAssignee =
    `assignee = "${accountId}" AND worklogDate >= "${startDate}" AND worklogDate <= "${endDate}"`;
  const byAssignee = await searchIssues(jqlAssignee);
  if (byAssignee.length > 0) return byAssignee;

  if (!displayName) return [];

  const jqlSummary =
    `summary ~ "${jqlEscape(displayName)}" AND worklogDate >= "${startDate}" AND worklogDate <= "${endDate}"`;
  return await searchIssues(jqlSummary);
}

type Worklog = { id: string; date: string; hours: number; started: string; seconds: number; comment: string };

// Legge TUTTI i worklog di una issue nel range (indipendentemente dall'autore:
// i worklog inseriti tramite Tempo Timesheets hanno come author l'app, non la
// persona, ma l'issue e' comunque quella corretta grazie al match su assignee).
async function fetchAllWorklogsForIssue(
  issueKey: string,
  startMs: number, endMs: number,
  dateFrom: string, dateTo: string,
): Promise<Worklog[]> {
  const out: Worklog[] = [];
  let startAt = 0;
  const pageSize = 1000;
  while (true) {
    const res = await jiraGet(
      `/rest/api/3/issue/${encodeURIComponent(issueKey)}/worklog` +
      `?startedAfter=${startMs}&startedBefore=${endMs}&startAt=${startAt}&maxResults=${pageSize}`,
    );
    if (!res.ok) throw new Error(`worklog HTTP ${res.status}`);
    const data = await res.json();
    const logs = data.worklogs || [];
    for (const wl of logs) {
      // NB: nessun filtro per wl.author — e' proprio questo il bug corretto.
      const started: string = wl.started || "";
      if (!started) continue;
      const date = started.slice(0, 10); // YYYY-MM-DD nel fuso del worklog
      if (date < dateFrom || date > dateTo) continue;
      const seconds = Number(wl.timeSpentSeconds) || 0;
      if (seconds > 0) out.push({ id: String(wl.id || ""), date, hours: seconds / 3600, started, seconds, comment: commentText(wl.comment) });
    }
    startAt += logs.length;
    if (logs.length < pageSize || startAt >= (data.total || 0)) break;
  }
  return out;
}

// Risale la gerarchia sottotask → Story → Epic e ritorna l'Epic di riferimento.
// Usa una cache per-richiesta (concurrency-safe) per non rifare le stesse chiamate.
type EpicInfo = { key: string; name: string; url: string } | null;

async function resolveEpic(
  issueKey: string, cache: Map<string, EpicInfo>, depth = 0,
): Promise<EpicInfo> {
  if (cache.has(issueKey)) return cache.get(issueKey) as EpicInfo;
  if (depth > 4) { cache.set(issueKey, null); return null; }

  const res = await jiraGet(
    `/rest/api/3/issue/${encodeURIComponent(issueKey)}?fields=summary,issuetype,parent`,
  );
  if (!res.ok) { cache.set(issueKey, null); return null; }
  const data = await res.json();

  const itype = data?.fields?.issuetype;
  const isEpic = !!itype && (itype.name === "Epic" || itype.hierarchyLevel === 1);
  if (isEpic) {
    const epic = { key: data.key, name: data.fields?.summary || data.key, url: `${JIRA_BASE_URL}/browse/${data.key}` };
    cache.set(issueKey, epic);
    return epic;
  }

  const parent = data?.fields?.parent;
  if (parent?.key) {
    // Se il parent è già l'Epic, evita una chiamata extra
    const pit = parent.fields?.issuetype;
    if (pit && (pit.name === "Epic" || pit.hierarchyLevel === 1)) {
      const epic = { key: parent.key, name: parent.fields?.summary || parent.key, url: `${JIRA_BASE_URL}/browse/${parent.key}` };
      cache.set(issueKey, epic);
      return epic;
    }
    const epic = await resolveEpic(parent.key, cache, depth + 1);
    cache.set(issueKey, epic);
    return epic;
  }

  cache.set(issueKey, null);
  return null;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "Metodo non consentito" }, 405);

  // Richiede un token utente Supabase (impedisce chiamate anonime)
  const authz = req.headers.get("Authorization") || "";
  if (!authz.startsWith("Bearer ")) return json({ error: "Non autenticato" }, 401);

  if (!JIRA_BASE_URL || !JIRA_EMAIL || !JIRA_API_TOKEN) {
    return json({ error: "Secret Jira non configurati (JIRA_BASE_URL / JIRA_EMAIL / JIRA_API_TOKEN)" }, 500);
  }

  let payload: any;
  try { payload = await req.json(); } catch { return json({ error: "JSON non valido" }, 400); }

  const emails: string[] = Array.isArray(payload?.emails)
    ? payload.emails.map((e: any) => String(e).trim()).filter(Boolean)
    : [];
  const startDate = String(payload?.startDate || "");
  const endDate   = String(payload?.endDate || "");

  if (emails.length === 0) return json({ error: "Nessuna email fornita" }, 400);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
    return json({ error: "Date non valide (atteso YYYY-MM-DD)" }, 400);
  }

  // Finestra epoch (millis) allargata di ±1 giorno per coprire i fusi orari.
  const startMs = new Date(startDate + "T00:00:00Z").getTime() - 86400000;
  const endMs   = new Date(endDate   + "T23:59:59Z").getTime() + 86400000;

  const results: Record<string, Record<string, { hours: number; tickets: any[] }>> = {};
  const errors: Record<string, string> = {};

  // Deduplica le email preservando l'input
  const uniqueEmails = [...new Set(emails.map((e) => e.toLowerCase()))];

  // Cache Epic per-richiesta (molti sottotask condividono la stessa Story/Epic)
  const epicCache = new Map<string, EpicInfo>();

  for (const email of uniqueEmails) {
    try {
      const user = await resolveAccountId(email);
      if (!user) { errors[email] = "Account Jira non trovato"; continue; }
      const { accountId, displayName } = user;

      const issues = await findIssuesForOperator(accountId, displayName, startDate, endDate);
      const summaryByKey: Record<string, string> = {};
      issues.forEach((i) => { summaryByKey[i.key] = i.summary; });

      // Aggrega per giorno: { date: { hours, tickets: { key: { hours, worklogs } } } }
      type TicketDay = { hours: number; worklogs: { id: string; started: string; seconds: number; comment: string }[] };
      const perDay: Record<string, { hours: number; tickets: Record<string, TicketDay> }> = {};

      for (const { key } of issues) {
        const wls = await fetchAllWorklogsForIssue(key, startMs, endMs, startDate, endDate);
        for (const { id, date, hours, started, seconds, comment } of wls) {
          if (!perDay[date]) perDay[date] = { hours: 0, tickets: {} };
          perDay[date].hours += hours;
          const t = perDay[date].tickets[key] || (perDay[date].tickets[key] = { hours: 0, worklogs: [] });
          t.hours += hours;
          t.worklogs.push({ id, started, seconds, comment });
        }
      }

      // Trasforma in formato di output, risolvendo l'Epic di ogni ticket
      const dayMap: Record<string, { hours: number; tickets: any[] }> = {};
      for (const [date, d] of Object.entries(perDay)) {
        const tickets = [];
        for (const [k, t] of Object.entries(d.tickets)) {
          const epic = await resolveEpic(k, epicCache);
          tickets.push({
            key: k,
            url: `${JIRA_BASE_URL}/browse/${k}`,
            hours: Math.round(t.hours * 100) / 100,
            summary: summaryByKey[k] || "",
            epic, // { key, name, url } | null
            worklogs: t.worklogs.sort((a, b) => a.started.localeCompare(b.started)),
          });
        }
        dayMap[date] = { hours: Math.round(d.hours * 100) / 100, tickets };
      }
      results[email] = dayMap;
    } catch (e) {
      errors[email] = String((e as Error)?.message || e);
    }
  }

  return json({ results, errors });
});
