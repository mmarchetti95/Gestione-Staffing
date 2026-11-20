// supabase/functions/jira-list-strumenti/index.ts
//
// Edge Function: elenca gli strumenti dal progetto Jira GAR ("Gestione Asset
// Rilievi"), tipi ticket "Strumentazione", "Drone", "Hard disk". Sola lettura.
//
// Dalla v18.302.0 ogni strumento porta anche assegnatario e stato (IN USO /
// DISPONIBILE / KO / MANUTENZIONE INTERNA / MANUTENZIONE FORNITORE): la Griglia
// propone a una squadra gli strumenti che i suoi operatori hanno su Jira e mostra
// chi ha in mano ogni strumento. La scrittura (assegnatario + IN USO) e' in
// jira-strumento-assegna.
//
// SECRET RICHIESTI (gli stessi delle altre funzioni Jira):
//   JIRA_BASE_URL, JIRA_EMAIL, JIRA_API_TOKEN
//
// Contratto richiesta (POST, JSON, body opzionale):
//   {}                       -> default (progetto GAR, tutti i tipi di strumento)
//   { "project": "GAR" }     -> override opzionale
//   { "emails": ["..."] }    -> opzionale (max 300): email -> accountId, per
//                               riconoscere gli operatori quando Jira non mostra
//                               l'email dell'assegnatario
//
// Contratto risposta (JSON):
//   { "strumenti": [ { "key": "GAR-12", "name": "GOOGLE - 1", "tipo": "Strumentazione",
//                      "stato": "IN USO", "statoCat": "indeterminate",
//                      "assignee": { "accountId", "displayName", "email" } | null }, ... ],
//     "count": N,
//     "accountByEmail": { "mario.rossi@...": "5b10..." | null }   // solo con "emails"
//   }

const JIRA_BASE_URL  = (Deno.env.get("JIRA_BASE_URL")  || "").replace(/\/+$/, "");
const JIRA_EMAIL     =  Deno.env.get("JIRA_EMAIL")     || "";
const JIRA_API_TOKEN =  Deno.env.get("JIRA_API_TOKEN") || "";

const DEFAULT_PROJECT = "GAR";
const MAX_EMAILS = 300;

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

async function jiraGet(path: string): Promise<Response> {
  return fetch(`${JIRA_BASE_URL}${path}`, {
    headers: { Authorization: jiraAuthHeader(), Accept: "application/json" },
  });
}

function jqlEscape(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function normEmail(e: unknown): string {
  return String(e || "").trim().toLowerCase();
}

// email (minuscola) -> accountId | null, poche richieste alla volta (stessa regola
// di jira-task-status: email identica, altrimenti l'unico utente trovato).
async function accountIdDaEmail(emails: string[]): Promise<Record<string, string | null>> {
  const out: Record<string, string | null> = {};
  for (let i = 0; i < emails.length; i += 8) {
    await Promise.all(emails.slice(i, i + 8).map(async (email) => {
      try {
        const res = await jiraGet(`/rest/api/3/user/search?query=${encodeURIComponent(email)}&maxResults=5`);
        if (!res.ok) { out[email] = null; return; }
        const users = (await res.json() || []).filter((u: any) => u && u.accountId && u.accountType !== "app");
        const exact = users.find((u: any) => normEmail(u.emailAddress) === email);
        const chosen = exact || (users.length === 1 ? users[0] : null);
        out[email] = chosen ? String(chosen.accountId) : null;
      } catch { out[email] = null; }
    }));
  }
  return out;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "Metodo non consentito" }, 405);

  const authz = req.headers.get("Authorization") || "";
  if (!authz.startsWith("Bearer ")) return json({ error: "Non autenticato" }, 401);

  if (!JIRA_BASE_URL || !JIRA_EMAIL || !JIRA_API_TOKEN) {
    return json({ error: "Secret Jira non configurati (JIRA_BASE_URL / JIRA_EMAIL / JIRA_API_TOKEN)" }, 500);
  }

  let payload: any = {};
  try { payload = await req.json(); } catch { payload = {}; }
  const project = String(payload?.project || DEFAULT_PROJECT).trim();
  const emails = [...new Set((Array.isArray(payload?.emails) ? payload.emails : [])
    .map(normEmail).filter((e: string) => e.includes("@")))].slice(0, MAX_EMAILS) as string[];

  const jql = `project = "${jqlEscape(project)}" AND (issuetype = "Strumentazione" OR issuetype = "Drone" OR issuetype = "Hard disk") ORDER BY summary ASC`;

  const strumenti: any[] = [];
  let nextPageToken: string | undefined = undefined;

  try {
    const accountsP = emails.length ? accountIdDaEmail(emails) : Promise.resolve(undefined);
    do {
      const body: Record<string, unknown> = { jql, fields: ["summary", "assignee", "status", "issuetype"], maxResults: 100 };
      if (nextPageToken) body.nextPageToken = nextPageToken;
      const res = await jiraPost(`/rest/api/3/search/jql`, body);
      if (!res.ok) {
        let detail = `search/jql HTTP ${res.status}`;
        try { const b = await res.json(); if (b) detail += " " + JSON.stringify(b); } catch { /* ignore */ }
        return json({ error: detail }, 502);
      }
      const data = await res.json();
      (data.issues || []).forEach((iss: any) => {
        if (!iss.key) return;
        const f = iss.fields || {};
        const a = f.assignee;
        strumenti.push({
          key: iss.key,
          name: f.summary || iss.key,
          tipo: f.issuetype?.name || "",
          stato: f.status?.name || "",
          statoCat: f.status?.statusCategory?.key || "",
          assignee: a && a.accountId
            ? { accountId: String(a.accountId), displayName: a.displayName || "", email: normEmail(a.emailAddress) }
            : null,
        });
      });
      nextPageToken = data.nextPageToken;
    } while (nextPageToken);
    const accountByEmail = await accountsP;
    return json(accountByEmail ? { strumenti, count: strumenti.length, accountByEmail } : { strumenti, count: strumenti.length });
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 500);
  }
});
