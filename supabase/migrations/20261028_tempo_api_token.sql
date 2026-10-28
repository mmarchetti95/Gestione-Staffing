-- Token API Tempo per jira-worklog-edit (v18.237.0): con Tempo il worklog aggiunto dalla
-- Timeline è intestato all'assegnatario del sottotask (le API Jira non permettono di
-- scegliere l'autore). Il token sta in Vault con nome 'tempo_api_token' (inserito a parte,
-- mai nel repo); la Edge Function lo legge con questa funzione se il secret d'ambiente
-- TEMPO_API_TOKEN non c'è. Come le chiavi dell'assistente AI: solo service_role.

create or replace function public.tempo_get_api_token()
returns text
language sql
stable
security definer
set search_path to 'public', 'vault'
as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'tempo_api_token';
$$;

revoke all on function public.tempo_get_api_token() from public, anon, authenticated;
grant execute on function public.tempo_get_api_token() to service_role;
