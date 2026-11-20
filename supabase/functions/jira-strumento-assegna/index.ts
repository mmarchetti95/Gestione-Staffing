// supabase/functions/jira-strumento-assegna/index.ts
//
// Edge Function (v18.302.0): quando in Griglia si assegna uno strumento GAR a una
// squadra, lo assegna su Jira all'operatore scelto e lo porta in stato IN USO.
//
// - Solo admin e responsabile (ruolo letto dall'utente Supabase, non dal client).
// - Solo ticket del progetto GAR dei tipi Strumentazione / Drone / Hard disk.
// - Operatore indicato per email -> accountId (user/search, email identica).
// - Uno strumento in KO / MANUTENZIONE* non viene rimesso IN USO senza "forza": la
//   funzione risponde 409 { codice: "stato_bloccato", stato } e il client chiede conferma.
// - Lo stato si cambia con la transizione che porta a "IN USO" (nel workflow GAR e'
//   la globale "Assegnazione"), cercata per nome dello stato di arrivo.
// - Prima/dopo vanno in activity_log (service_role).
//
// Richiesta (POST, JSON):
//   { key: "GAR-18", email: "op@...", operatore: "Nome Cognome",
//     forza?: boolean, contesto?: { anno, week, commessa, squadra } }   // contesto solo per il log
// Risposta:
//   { key, assignee: { accountId, displayName, email }, stato, statoCat,
//     cambiatoAssegnatario: boolean, cambiatoStato: boolean, avviso? }

import { createClient } from "npm:@supabase/supabase-js@2";

const JIRA_BASE_URL  = (Deno.env.get("JIRA_BASE_URL")  || "").replace(/\/+$/, "");
const JIRA_EMAIL     =  Deno.env.get("JIRA_EMAIL")     || "";
const JIRA_API_TOKEN =  Deno.env.get("JIRA_API_TOKEN") || "";
const SUPABASE_URL   =  Deno.env.get("SUPABASE_URL") || "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

const PROGETTO = "GAR";
const TIPI = ["strumentazione", "drone", "hard disk"];
const STATO_IN_USO = "IN USO";
const STATI_BLOCCATI = /^(KO|MANUTENZIONE)/i;

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
    det = [...(j.errorMessages || []), ...Object.values(j.errors || {})].join(" ");
  } catch { /* corpo vuoto */ }
  if (res.status === 403 || res.status === 401) {
    det = (det ? det + " — " : "") + "l'account di servizio Jira non ha il permesso nel progetto GAR (servono «Assign Issues» e «Transition Issues»)";
  }
  if (res.status === 404) det = (det ? det + " — " : "") + "strumento non trovato su Jira";
  return `${cosa}: HTTP ${res.status}${det ? " · " + det : ""}`;
}

function normEmail(e: unknown): string {
  return String(e || "").trim().toLowerCase();
}

type Lettura = { summary: string; tipo: string; progetto: string; stato: string; statoCat: string;
  assignee: { accountId: string; displayName: string; email: string } | null };

async function leggi(key: string): Promise<{ l?: Lettura; errore?: string }> {
  const res = await jira("GET", `/rest/api/3/issue/${encodeURIComponent(key)}?fields=summary,status,assignee,issuetype,project`);
  if (!res.ok) return { errore: await jiraErr(res, "Lettura dello strumento") };
  const f = (await res.json())?.fields || {};
  const a = f.assignee;
  return {
    l: {
      summary: String(f.summary || ""),
      tipo: String(f.issuetype?.name || ""),
      progetto: String(f.project?.key || ""),
      stato: String(f.status?.name || ""),
      statoCat: String(f.status?.statusCategory?.key || ""),
      assignee: a && a.accountId ? { accountId: String(a.accountId), displayName: a.displayName || "", email: normEmail(a.emailAddress) } : null,
    },
  };
}

async function accountIdDaEmail(email: string): Promise<string | null> {
  const res = await jira("GET", `/rest/api/3/user/search?query=${encodeURIComponent(email)}&maxResults=5`);
  if (!res.ok) return null;
  const users = (await res.json() || []).filter((u: any) => u && u.accountId && u.accountType !== "app");
  const exact = users.find((u: any) => normEmail(u.emailAddress) === email);
  const chosen = exact || (users.length === 1 ? users[0] : null);
  return chosen ? String(chosen.accountId) : null;
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
  if (role !== "admin" && role !== "responsabile") return json({ error: "Solo admin e responsabili possono assegnare strumenti" }, 403);

  let p: any;
  try { p = await req.json(); } catch { return json({ error: "JSON non valido" }, 400); }
  const key = String(p?.key || "").trim().toUpperCase();
  const email = normEmail(p?.email);
  const operatore = String(p?.operatore || "").trim();
  const forza = p?.forza === true;
  const contesto = p?.contesto && typeof p.contesto === "object" ? p.contesto : {};
  if (!/^[A-Z][A-Z0-9_]*-\d+$/.test(key)) return json({ error: "Chiave strumento non valida" }, 400);
  if (!email.includes("@")) return json({ error: `${operatore || "L'operatore"} non ha un'email in anagrafica: impossibile trovarlo su Jira` }, 400);

  try {
    const r0 = await leggi(key);
    if (r0.errore) return json({ error: r0.errore }, 502);
    const prima = r0.l!;
    if (prima.progetto !== PROGETTO || !TIPI.includes(prima.tipo.toLowerCase())) {
      return json({ error: `${key} non è uno strumento del progetto ${PROGETTO}` }, 400);
    }
    if (STATI_BLOCCATI.test(prima.stato) && !forza) {
      return json({ error: `${key} è in stato ${prima.stato}`, codice: "stato_bloccato", stato: prima.stato }, 409);
    }

    const accountId = await accountIdDaEmail(email);
    if (!accountId) return json({ error: `Nessun utente Jira trovato con l'email di ${operatore || email}`, codice: "utente_non_trovato" }, 404);

    let cambiatoAssegnatario = false, cambiatoStato = false, avviso = "";
    if (prima.assignee?.accountId !== accountId) {
      const res = await jira("PUT", `/rest/api/3/issue/${encodeURIComponent(key)}/assignee`, { accountId });
      if (!res.ok) return json({ error: await jiraErr(res, "Cambio assegnatario") }, 502);
      cambiatoAssegnatario = true;
    }

    if (prima.stato.toUpperCase() !== STATO_IN_USO) {
      const rt = await jira("GET", `/rest/api/3/issue/${encodeURIComponent(key)}/transitions`);
      if (!rt.ok) {
        avviso = await jiraErr(rt, "Lettura transizioni");
      } else {
        const tr = ((await rt.json())?.transitions || []).find((t: any) => String(t?.to?.name || "").toUpperCase() === STATO_IN_USO);
        if (!tr) {
          avviso = `nessuna transizione verso ${STATO_IN_USO} da ${prima.stato}: stato non cambiato`;
        } else {
          const rp = await jira("POST", `/rest/api/3/issue/${encodeURIComponent(key)}/transitions`, { transition: { id: String(tr.id) } });
          if (!rp.ok) avviso = await jiraErr(rp, `Passaggio a ${STATO_IN_USO}`);
          else cambiatoStato = true;
        }
      }
    }

    // Un'eventuale automazione Jira sulla transizione potrebbe cambiare
    // l'assegnatario: si rilegge e, se serve, lo si rimette.
    let dopo = prima;
    const r1 = await leggi(key);
    if (r1.l) {
      dopo = r1.l;
      if (dopo.assignee?.accountId !== accountId) {
        const res = await jira("PUT", `/rest/api/3/issue/${encodeURIComponent(key)}/assignee`, { accountId });
        if (res.ok) { const r2 = await leggi(key); if (r2.l) dopo = r2.l; }
        else avviso = (avviso ? avviso + " · " : "") + await jiraErr(res, "Ripristino assegnatario");
      }
    }

    if (cambiatoAssegnatario || cambiatoStato) {
      try {
        await admin.from("activity_log").insert({
          user_email: callerData.user.email,
          action: "Strumento Jira assegnato",
          details: {
            key, summary: prima.summary, operatore, contesto, forza,
            prima: { stato: prima.stato, assegnatario: prima.assignee?.displayName || "" },
            dopo: { stato: dopo.stato, assegnatario: dopo.assignee?.displayName || "" },
            avviso: avviso || undefined,
          },
        });
      } catch { /* il log non deve far fallire l'assegnazione gia' fatta */ }
    }

    return json({
      key, assignee: dopo.assignee, stato: dopo.stato, statoCat: dopo.statoCat,
      cambiatoAssegnatario, cambiatoStato, avviso: avviso || undefined,
    });
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 500);
  }
});
