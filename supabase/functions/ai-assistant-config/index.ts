// supabase/functions/ai-assistant-config/index.ts
//
// Edge Function: pannello admin "Gestione Assistente AI" — legge/scrive la
// configurazione dell'assistente (attivo/disattivo, provider, modello,
// istruzioni personalizzate) e imposta/revoca le API key dei provider LLM
// via Supabase Vault. Dal v18.187.0 c'è UNA CHIAVE PER PROVIDER (gemini, groq,
// anthropic, openrouter) e l'ultimo modello scelto per ciascuno
// (provider_models): cambiare provider dal menu non richiede di reinserire la
// chiave. La configurazione vale sia per l'assistente generico (ai-assistant)
// sia per quello dell'Auto-pianifica (ai-autoplan).
// La chiave vera non viene MAI restituita al client (nemmeno all'admin): solo
// l'elenco dei provider che ne hanno una. Usa la service_role key sia per
// bypassare la RLS di ai_assistant_settings sia per chiamare i wrapper di Vault
// (migrazione 20260930_ai_assistant_chiavi_per_provider).
//
// Autenticazione: il ruolo NON viene letto dai claim del JWT ma richiesto via
// Admin API (getUser), perché un JWT già emesso resta valido fino a scadenza
// anche se un altro admin ha nel frattempo retrocesso quell'utente.
//
// Contratto richiesta (POST, JSON):
//   { action: 'get' }
//   { action: 'set', enabled, provider, model, custom_instructions?, api_key?, revoke_api_key? }
//     api_key / revoke_api_key si riferiscono a `provider`.
//
// Contratto risposta (JSON):
//   { enabled, provider, model, custom_instructions, has_api_key, providers_with_key, provider_models }
//   | { ok: true } | { error }

import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

const PROVIDERS = ["gemini", "groq", "anthropic", "openrouter"];
const MAX_CUSTOM_INSTRUCTIONS_LEN = 2000;
const MAX_MODEL_LEN = 200;

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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "Metodo non consentito" }, 405);

  const authz = req.headers.get("Authorization") || "";
  if (!authz.startsWith("Bearer ")) return json({ error: "Non autenticato" }, 401);
  const jwt = authz.slice("Bearer ".length);

  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return json({ error: "Configurazione mancante (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)" }, 500);
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: callerData, error: callerErr } = await admin.auth.getUser(jwt);
  if (callerErr || !callerData?.user) return json({ error: "Sessione non valida" }, 401);
  if (callerData.user.user_metadata?.role !== "admin") {
    return json({ error: "Solo un amministratore può gestire l'assistente AI" }, 403);
  }

  let payload: any;
  try { payload = await req.json(); } catch { return json({ error: "JSON non valido" }, 400); }
  const action = String(payload?.action || "");

  try {
    if (action === "get") {
      const { data: settings, error: sErr } = await admin
        .from("ai_assistant_settings")
        .select("enabled, provider, model, custom_instructions, provider_models")
        .eq("id", 1)
        .maybeSingle();
      if (sErr) throw sErr;

      const { data: conChiave, error: kErr } = await admin.rpc("ai_assistant_providers_with_key");
      if (kErr) throw kErr;
      const providersWithKey: string[] = Array.isArray(conChiave) ? conChiave : [];
      const provider = settings?.provider || "gemini";

      return json({
        enabled: !!settings?.enabled,
        provider,
        model: settings?.model || "gemini-2.5-flash",
        custom_instructions: settings?.custom_instructions || "",
        has_api_key: providersWithKey.includes(provider),
        providers_with_key: providersWithKey,
        provider_models: settings?.provider_models || {},
      });
    }

    if (action === "set") {
      const enabled = !!payload?.enabled;
      const provider = String(payload?.provider || "");
      const model = String(payload?.model || "").trim().slice(0, MAX_MODEL_LEN);
      const customInstructions = String(payload?.custom_instructions || "").trim().slice(0, MAX_CUSTOM_INSTRUCTIONS_LEN);
      if (!PROVIDERS.includes(provider)) return json({ error: "Provider non valido" }, 400);
      if (!model) return json({ error: "Il modello non può essere vuoto" }, 400);

      const { data: cur, error: cErr } = await admin
        .from("ai_assistant_settings").select("provider_models").eq("id", 1).maybeSingle();
      if (cErr) throw cErr;
      const providerModels = { ...(cur?.provider_models || {}), [provider]: model };

      const { error: upErr } = await admin
        .from("ai_assistant_settings")
        .update({
          enabled, provider, model,
          provider_models: providerModels,
          custom_instructions: customInstructions || null,
          updated_at: new Date().toISOString(),
          updated_by: callerData.user.email,
        })
        .eq("id", 1);
      if (upErr) throw upErr;

      if (payload?.revoke_api_key === true) {
        const { error: revErr } = await admin.rpc("ai_assistant_revoke_provider_key", { p_provider: provider });
        if (revErr) throw revErr;
      } else if (typeof payload?.api_key === "string" && payload.api_key.trim()) {
        const { error: setErr } = await admin.rpc("ai_assistant_set_provider_key", { p_provider: provider, p_secret: payload.api_key.trim() });
        if (setErr) throw setErr;
      }

      return json({ ok: true });
    }

    return json({ error: "Azione non riconosciuta" }, 400);
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 500);
  }
});
