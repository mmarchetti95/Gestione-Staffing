// supabase/functions/jira-update-production/index.ts
//
// Edge Function: aggiorna il campo custom "Actual Production" sui sottotask Jira,
// e propaga lo stesso delta al Task padre diretto del sottotask (fields.parent),
// cosi' il totale sul padre resta allineato alla somma dei suoi sottotask.
// Per ogni update ricevuto: legge il valore attuale del campo sul sottotask, ci
// SOMMA il valore indicato e riscrive il totale; poi ripete la stessa somma sul
// padre diretto, se presente. Ritorna, per ogni issue, il vecchio e il nuovo
// valore (sottotask + padre), così il frontend aggiorna il proprio storico SOLO
// per gli issue effettivamente aggiornati.
//
// L'anti-doppio-conteggio NON e' gestito qui: la funzione somma sempre. E' il
// frontend (Controllo Produzione, modello delta per ticket) che invia come "add"
// solo la differenza fra il valore locale e l'ultimo valore che ha scritto su
// quel ticket (km_last_by_ticket), quindi "add" puo' essere negativo. Lo stesso
// identico delta (mai ricalcolato) viene applicato sia al sottotask sia al
// padre, quindi la garanzia anti-doppio-conteggio del sottotask si estende
// automaticamente al padre.
//
// Se l'update sul padre fallisce, l'update sul sottotask NON viene annullato (e'
// gia' stato scritto su Jira): l'errore viene riportato separatamente in
// "parentErrors" cosi' il frontend puo' avvisare l'utente senza bloccare il
// bookkeeping locale del sottotask (che deve restare in sync con Jira).
//
// --- Avanzamento (Actual Production progress (%)) ---
// Ogni volta che si scrive un nuovo Actual Production sul sottotask, se sono
// disponibili sia il Target Production del Task padre sia il campo
// "Actual Production progress (%)" sul sottotask, si scrive:
//   avanzamento = Actual Production del sottotask / Target Production del Task padre
// NORMALIZZATO A 1 (0.2 = 20%), come "Production Weight (%)": i campi
// percentuale di questa istanza Jira mostrano il valore x100 (inviare 20
// mostrava 2000%). Arrotondato a 4 decimali (= 2 decimali di %), nessun cap a
// 1 — un sottotask puo' superare il target.
// "Production Weight (%)" NON viene toccato qui: e' il peso del sottotask sul
// Task, impostato (e ricalcolato su tutti i sottotask del Task) da
// jira-create-subtask. Fino a v3 di questa funzione veniva sovrascritto con
// l'avanzamento in scala 0-100, perdendo il peso e mostrandolo x100.
// L'avanzamento e' condizionato, non incondizionato, per due motivi:
//  1) i campi "Target Production" e "Actual Production progress (%)" potrebbero
//     non esistere affatto su questa istanza Jira (nome non trovato in
//     /rest/api/3/field): in tal caso l'avanzamento non viene mai calcolato,
//     per nessuna commessa (canComputeProgress).
//  2) anche se il campo esiste a livello di istanza Jira, potrebbe non essere
//     sullo screen del sottotask di QUESTA commessa (commesse diverse possono
//     avere configurazioni diverse): in tal caso il PUT combinato fallisce e si
//     ritenta con il solo Actual Production, cosi' l'aggiornamento principale
//     non resta mai bloccato da un campo extra opzionale mancante (vedi
//     "progressErrors" nella risposta, stesso spirito di "parentErrors").
// Se il Task padre non ha un Target Production valorizzato (> 0), l'avanzamento
// viene saltato per quel sottotask (nessun errore: e' un caso atteso, non tutte
// le commesse valorizzano il Target Production).
//
// SECRET RICHIESTI (gli stessi della funzione worklog):
//   JIRA_BASE_URL, JIRA_EMAIL, JIRA_API_TOKEN
//
// Contratto richiesta (POST, JSON):
//   { "updates": [ { "issueKey": "AI029-171", "add": 3.183 }, ... ] }
//   e/o
//   { "reads": [ "AI029-171", ... ] }   // sola lettura dell'Actual Production
//
// Contratto risposta (JSON):
//   { "fieldId": "customfield_XXXXX",
//     "results": { "AI029-171": { "ok": true, "oldValue": 1, "newValue": 4.18,
//                                  "progress": 0.2,
//                                  "parentKey": "AI029-786", "parentOldValue": 2, "parentNewValue": 5.18 } },
//     "errors":  { "AI029-169": "motivo" },
//     "parentErrors": { "AI029-171": "AI029-786: motivo" },
//     "progressErrors": { "AI029-171": "motivo (avanzamento non scritto, Actual Production comunque aggiornato)" },
//     "values": { "AI029-171": 4.18 } }   // solo per "reads"

const JIRA_BASE_URL  = (Deno.env.get("JIRA_BASE_URL")  || "").replace(/\/+$/, "");
const JIRA_EMAIL     =  Deno.env.get("JIRA_EMAIL")     || "";
const JIRA_API_TOKEN =  Deno.env.get("JIRA_API_TOKEN") || "";

// Nomi esatti dei campi custom su Jira (come mostrati nell'interfaccia).
const FIELD_NAME             = "Actual Production";
const TARGET_FIELD_NAME      = "Target Production";
const PROGRESS_FIELD_NAME    = "Actual Production progress (%)";

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

async function jiraPut(path: string, body: unknown): Promise<Response> {
  return fetch(`${JIRA_BASE_URL}${path}`, {
    method: "PUT",
    headers: {
      Authorization: jiraAuthHeader(),
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

// Recupera l'intero elenco campi di Jira una sola volta per invocazione, cosi'
// la risoluzione di tutti i nomi (Actual Production + i 2 opzionali) costa
// una sola chiamata a /field invece di una per campo.
async function fetchJiraFields(): Promise<{ fields?: any[]; error?: string }> {
  const res = await jiraGet(`/rest/api/3/field`);
  if (!res.ok) return { error: `field list HTTP ${res.status}` };
  const fields = await res.json();
  if (!Array.isArray(fields)) return { error: "Risposta inattesa da /field" };
  return { fields };
}

// Cerca, nell'elenco gia' scaricato, l'id (customfield_XXXXX) del campo il cui
// nome corrisponde esattamente a `name`. Nessun match o piu' match ambigui ->
// nessun id (il chiamante decide se e' un errore bloccante o un'opzione da
// saltare, vedi commento in testa al file).
function findFieldId(fields: any[], name: string): { id?: string; ambiguous?: boolean } {
  const target = name.trim().toLowerCase();
  const matches = fields.filter((f: any) => String(f.name || "").trim().toLowerCase() === target);
  if (matches.length === 1) return { id: matches[0].id };
  if (matches.length > 1) return { ambiguous: true };
  return {};
}

// Legge il valore numerico attuale di un campo su un'issue. Usata per leggere
// il Target Production del Task padre (sola lettura, nessuna scrittura).
async function getFieldValue(issueKey: string, jiraFieldId: string): Promise<number | null> {
  const res = await jiraGet(`/rest/api/3/issue/${encodeURIComponent(issueKey)}?fields=${encodeURIComponent(jiraFieldId)}`);
  if (!res.ok) return null;
  const data = await res.json();
  const raw = data?.fields?.[jiraFieldId];
  if (raw == null || raw === "") return null;
  const num = Number(raw);
  return isFinite(num) ? num : null;
}

// Legge il valore attuale di fieldId su issueKey, ci somma "add" e riscrive il
// totale (arrotondato a 3 decimali, precisione al metro). Usata per il padre
// diretto del sottotask: stessa identica logica di somma usata sul sottotask.
async function addDeltaToField(issueKey: string, fieldId: string, add: number): Promise<{ oldValue: number; newValue: number; error?: undefined } | { error: string }> {
  const gres = await jiraGet(`/rest/api/3/issue/${encodeURIComponent(issueKey)}?fields=${encodeURIComponent(fieldId)}`);
  if (!gres.ok) return { error: `GET issue HTTP ${gres.status}` };
  const gdata = await gres.json();
  const raw = gdata?.fields?.[fieldId];
  const oldValue = (raw == null || raw === "") ? 0 : Number(raw);
  if (!isFinite(oldValue)) return { error: "Valore attuale non numerico" };

  const newValue = Math.round((oldValue + add) * 1000) / 1000;

  const pres = await jiraPut(`/rest/api/3/issue/${encodeURIComponent(issueKey)}`, {
    fields: { [fieldId]: newValue },
  });
  // PUT issue ritorna 204 in caso di successo
  if (pres.status !== 204 && !pres.ok) {
    let detail = `PUT issue HTTP ${pres.status}`;
    try { const b = await pres.json(); if (b) detail += " " + JSON.stringify(b); } catch { /* ignore */ }
    return { error: detail };
  }

  return { oldValue, newValue };
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

  const updates: any[] = Array.isArray(payload?.updates) ? payload.updates : [];
  const reads: any[]   = Array.isArray(payload?.reads)   ? payload.reads   : [];
  if (updates.length === 0 && reads.length === 0) return json({ error: "Nessun update o read fornito" }, 400);

  const fres = await fetchJiraFields();
  if (fres.error || !fres.fields) return json({ error: fres.error || "Elenco campi Jira non risolto" }, 500);
  const jiraFields = fres.fields;

  const actualProd = findFieldId(jiraFields, FIELD_NAME);
  if (!actualProd.id) {
    return json({
      error: actualProd.ambiguous
        ? `Trovati piu' campi "${FIELD_NAME}": specificare l'id esatto.`
        : `Campo "${FIELD_NAME}" non trovato su Jira`,
    }, 500);
  }
  const fieldId = actualProd.id;

  // Campi opzionali per il calcolo dell'avanzamento (vedi commento in testa al
  // file). Se anche solo uno dei due manca A LIVELLO DI ISTANZA Jira (nome non
  // trovato o ambiguo), l'avanzamento non viene MAI calcolato: non e' un
  // errore, e' semplicemente una funzionalita' non disponibile su questa
  // istanza/commessa.
  const targetField   = findFieldId(jiraFields, TARGET_FIELD_NAME);
  const progressField = findFieldId(jiraFields, PROGRESS_FIELD_NAME);
  const canComputeProgress = !!(targetField.id && progressField.id);

  const results: Record<string, { ok: boolean; oldValue: number; newValue: number; progress?: number; parentKey?: string; parentOldValue?: number; parentNewValue?: number }> = {};
  const errors: Record<string, string> = {};
  const parentErrors: Record<string, string> = {};
  const progressErrors: Record<string, string> = {};
  const values: Record<string, number | null> = {};

  // --- Sola lettura: ritorna il valore attuale di Actual Production per issue ---
  for (const rk of reads) {
    const issueKey = String(rk || "").trim();
    if (!issueKey) continue;
    try {
      const gres = await jiraGet(`/rest/api/3/issue/${encodeURIComponent(issueKey)}?fields=${encodeURIComponent(fieldId)}`);
      if (!gres.ok) { errors[issueKey] = `GET issue HTTP ${gres.status}`; continue; }
      const gdata = await gres.json();
      const raw = gdata?.fields?.[fieldId];
      values[issueKey] = (raw == null || raw === "") ? null : Number(raw);
    } catch (e) {
      errors[issueKey] = String((e as Error)?.message || e);
    }
  }

  for (const u of updates) {
    const issueKey = String(u?.issueKey || "").trim();
    const add = Number(u?.add);
    if (!issueKey) continue;
    if (!isFinite(add)) { errors[issueKey] = "Valore 'add' non numerico"; continue; }

    try {
      // Leggi il valore attuale del campo sul sottotask, insieme al padre diretto
      // (fields.parent: relazione standard Jira, distinta dall'Epic Link).
      const gres = await jiraGet(`/rest/api/3/issue/${encodeURIComponent(issueKey)}?fields=${encodeURIComponent(fieldId)},parent`);
      if (!gres.ok) { errors[issueKey] = `GET issue HTTP ${gres.status}`; continue; }
      const gdata = await gres.json();
      const raw = gdata?.fields?.[fieldId];
      const oldValue = (raw == null || raw === "") ? 0 : Number(raw);
      if (!isFinite(oldValue)) { errors[issueKey] = "Valore attuale non numerico"; continue; }

      // Somma e arrotonda a 3 decimali (precisione al metro)
      const newValue = Math.round((oldValue + add) * 1000) / 1000;
      const parentKey = gdata?.fields?.parent?.key;

      // Avanzamento rispetto al Target Production del Task padre, normalizzato
      // a 1 (vedi commento in testa al file). Nessun Target Production
      // valorizzato sul padre -> nessun avanzamento per questo sottotask (non
      // e' un errore).
      let progress: number | null = null;
      if (canComputeProgress && parentKey) {
        const targetValue = await getFieldValue(parentKey, targetField.id!);
        if (targetValue != null && targetValue > 0) {
          progress = Math.round((newValue / targetValue) * 10000) / 10000;
        }
      }

      const subtaskFields: Record<string, number> = { [fieldId]: newValue };
      if (progress != null) subtaskFields[progressField.id!] = progress;

      let pres = await jiraPut(`/rest/api/3/issue/${encodeURIComponent(issueKey)}`, { fields: subtaskFields });
      if (progress != null && pres.status !== 204 && !pres.ok) {
        // "Actual Production progress (%)" probabilmente non e' sullo screen di
        // questo sottotask (commessa senza quel campo): ritenta con il solo
        // Actual Production, cosi' l'aggiornamento principale non resta
        // bloccato da un campo extra opzionale.
        let detail = `PUT issue HTTP ${pres.status}`;
        try { const b = await pres.json(); if (b) detail += " " + JSON.stringify(b); } catch { /* ignore */ }
        progressErrors[issueKey] = detail;
        progress = null;
        pres = await jiraPut(`/rest/api/3/issue/${encodeURIComponent(issueKey)}`, { fields: { [fieldId]: newValue } });
      }
      // PUT issue ritorna 204 in caso di successo
      if (pres.status !== 204 && !pres.ok) {
        let detail = `PUT issue HTTP ${pres.status}`;
        try { const b = await pres.json(); if (b) detail += " " + JSON.stringify(b); } catch { /* ignore */ }
        errors[issueKey] = detail;
        continue;
      }

      results[issueKey] = { ok: true, oldValue, newValue };
      if (progress != null) results[issueKey].progress = progress;

      // Propaga lo stesso delta al Task padre diretto, se presente. Un fallimento
      // qui NON invalida l'update del sottotask (gia' scritto): viene riportato
      // a parte in parentErrors.
      if (parentKey) {
        const parentRes = await addDeltaToField(parentKey, fieldId, add);
        if (parentRes.error) {
          parentErrors[issueKey] = `${parentKey}: ${parentRes.error}`;
        } else {
          results[issueKey].parentKey = parentKey;
          results[issueKey].parentOldValue = parentRes.oldValue;
          results[issueKey].parentNewValue = parentRes.newValue;
        }
      }
    } catch (e) {
      errors[issueKey] = String((e as Error)?.message || e);
    }
  }

  return json({ fieldId, results, errors, parentErrors, progressErrors, values });
});
