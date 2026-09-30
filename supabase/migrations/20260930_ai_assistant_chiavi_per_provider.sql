-- Assistente AI: una API key per provider (Gemini, Groq, Anthropic, OpenRouter) e
-- l'ultimo modello scelto per ciascuno, così dal pannello admin si passa da un provider
-- all'altro senza reinserire la chiave. Migrazione solo additiva: le funzioni
-- ai_assistant_*_api_key() senza provider e il segreto 'ai_assistant_llm_api_key'
-- restano (le Edge Function precedenti li usano) e si possono togliere più avanti.

alter table public.ai_assistant_settings
  add column if not exists provider_models jsonb not null default '{}'::jsonb;

-- Nome del segreto in Vault per un provider (solo valori noti: niente nomi arbitrari)
create or replace function public.ai_assistant_key_name(p_provider text)
returns text
language plpgsql
immutable
as $$
begin
  if p_provider not in ('gemini', 'groq', 'anthropic', 'openrouter') then
    raise exception 'Provider non valido: %', p_provider;
  end if;
  return 'ai_assistant_llm_api_key_' || p_provider;
end;
$$;

create or replace function public.ai_assistant_get_provider_key(p_provider text)
returns text
language sql
stable
security definer
set search_path to 'public', 'vault'
as $$
  select decrypted_secret from vault.decrypted_secrets where name = public.ai_assistant_key_name(p_provider);
$$;

create or replace function public.ai_assistant_set_provider_key(p_provider text, p_secret text)
returns void
language plpgsql
security definer
set search_path to 'public', 'vault'
as $$
declare
  k text := public.ai_assistant_key_name(p_provider);
  existing_id uuid;
begin
  select id into existing_id from vault.secrets where name = k;
  if existing_id is null then
    perform vault.create_secret(p_secret, k, 'AI assistant LLM API key (' || p_provider || ')');
  else
    perform vault.update_secret(existing_id, p_secret);
  end if;
end;
$$;

create or replace function public.ai_assistant_revoke_provider_key(p_provider text)
returns void
language plpgsql
security definer
set search_path to 'public', 'vault'
as $$
begin
  delete from vault.secrets where name = public.ai_assistant_key_name(p_provider);
end;
$$;

-- Provider che hanno una chiave configurata (mai la chiave stessa)
create or replace function public.ai_assistant_providers_with_key()
returns text[]
language sql
stable
security definer
set search_path to 'public', 'vault'
as $$
  select coalesce(array_agg(replace(name, 'ai_assistant_llm_api_key_', '') order by name), '{}')
  from vault.secrets
  where name like 'ai\_assistant\_llm\_api\_key\_%';
$$;

-- Come le funzioni esistenti: eseguibili solo con la service_role (Edge Function)
revoke all on function public.ai_assistant_key_name(text) from public, anon, authenticated;
revoke all on function public.ai_assistant_get_provider_key(text) from public, anon, authenticated;
revoke all on function public.ai_assistant_set_provider_key(text, text) from public, anon, authenticated;
revoke all on function public.ai_assistant_revoke_provider_key(text) from public, anon, authenticated;
revoke all on function public.ai_assistant_providers_with_key() from public, anon, authenticated;
grant execute on function public.ai_assistant_key_name(text) to service_role;
grant execute on function public.ai_assistant_get_provider_key(text) to service_role;
grant execute on function public.ai_assistant_set_provider_key(text, text) to service_role;
grant execute on function public.ai_assistant_revoke_provider_key(text) to service_role;
grant execute on function public.ai_assistant_providers_with_key() to service_role;

-- La chiave unica esistente appartiene al provider configurato oggi: la si copia sotto
-- il nome per provider (il segreto originale resta dov'è).
do $$
declare
  legacy text;
  prov text;
begin
  select decrypted_secret into legacy from vault.decrypted_secrets where name = 'ai_assistant_llm_api_key';
  select provider into prov from public.ai_assistant_settings where id = 1;
  if legacy is not null and prov in ('gemini', 'groq', 'anthropic', 'openrouter')
     and not exists (select 1 from vault.secrets where name = 'ai_assistant_llm_api_key_' || prov) then
    perform vault.create_secret(legacy, 'ai_assistant_llm_api_key_' || prov, 'AI assistant LLM API key (' || prov || ')');
  end if;
  update public.ai_assistant_settings
     set provider_models = jsonb_build_object(provider, model)
   where id = 1 and provider_models = '{}'::jsonb;
end;
$$;
