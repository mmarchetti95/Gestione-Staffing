-- v18.251.0 — Worklog dei dipendenti fornitore copiati dal collega Eagle (Edge Function
-- jira-fornitori-worklog). I dipendenti dei fornitori con email hanno i sottotask giornalieri
-- ma non usano Jira: stato e worklog del loro sottotask seguono quelli del collega interno
-- della stessa squadra, stesso cantiere e giorno.

-- Legame copia ↔ originale: un worklog del collega (source) ↔ la sua copia sul sottotask del
-- fornitore (target). Serve a non duplicare, ad aggiornare la copia se l'originale cambia e a
-- toglierla se sparisce. target_worklog_id null = copia fatta con Tempo, id Jira non ancora noto.
create table if not exists public.fornitori_worklog_copie (
  id                bigint generated always as identity primary key,
  target_key        text not null,          -- sottotask del dipendente fornitore
  target_worklog_id text,
  source_key        text not null,          -- sottotask del collega interno
  source_worklog_id text not null,
  source_started    text not null,          -- valori dell'originale al momento della copia
  source_seconds    int  not null,
  source_commento   text not null default '',
  operatore         text not null default '',
  sorgente          text not null default '',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint fornitori_wl_copia unique (target_key, source_worklog_id)
);
comment on table public.fornitori_worklog_copie is 'Worklog copiati dal collega interno sui sottotask dei dipendenti fornitore (jira-fornitori-worklog).';

-- Collega da cui copiare scelto a mano, per sottotask del fornitore (se manca: scelta automatica).
create table if not exists public.fornitori_worklog_sorgente (
  target_key  text primary key,
  sorgente    text not null,                 -- nome operatore interno, come in Griglia
  updated_at  timestamptz not null default now(),
  updated_by  text
);
comment on table public.fornitori_worklog_sorgente is 'Collega interno scelto a mano come sorgente dei worklog di un sottotask fornitore.';

-- Un solo giro alla volta (cron e app) + esito dell'ultimo giro, letto dall'app.
create table if not exists public.fornitori_worklog_stato (
  id            int primary key default 1 check (id = 1),
  lock_fino     timestamptz,
  ultimo_avvio  timestamptz,
  ultimo_da     text,
  ultimo_esito  jsonb
);
insert into public.fornitori_worklog_stato (id) values (1) on conflict do nothing;

alter table public.fornitori_worklog_copie    enable row level security;
alter table public.fornitori_worklog_sorgente enable row level security;
alter table public.fornitori_worklog_stato    enable row level security;

-- Copie e stato: lettura per tutti gli autenticati, scrittura solo dalla Edge Function (service_role).
create policy fornitori_wl_copie_select on public.fornitori_worklog_copie for select to authenticated using (true);
create policy fornitori_wl_stato_select on public.fornitori_worklog_stato for select to authenticated using (true);
-- Scelta del collega: admin/responsabile, come la Griglia.
create policy fornitori_wl_sorg_select on public.fornitori_worklog_sorgente for select to authenticated using (true);
create policy fornitori_wl_sorg_insert on public.fornitori_worklog_sorgente for insert to authenticated
  with check (((auth.jwt() -> 'user_metadata') ->> 'role') = any (array['admin', 'responsabile']));
create policy fornitori_wl_sorg_update on public.fornitori_worklog_sorgente for update to authenticated
  using (((auth.jwt() -> 'user_metadata') ->> 'role') = any (array['admin', 'responsabile']))
  with check (((auth.jwt() -> 'user_metadata') ->> 'role') = any (array['admin', 'responsabile']));
create policy fornitori_wl_sorg_delete on public.fornitori_worklog_sorgente for delete to authenticated
  using (((auth.jwt() -> 'user_metadata') ->> 'role') = any (array['admin', 'responsabile']));

create or replace function public.fornitori_wl_lock(p_secondi int)
returns boolean language plpgsql security definer set search_path to 'public' as $$
begin
  update fornitori_worklog_stato set lock_fino = now() + make_interval(secs => p_secondi)
   where id = 1 and (lock_fino is null or lock_fino < now());
  return found;
end $$;

create or replace function public.fornitori_wl_unlock()
returns void language sql security definer set search_path to 'public' as $$
  update fornitori_worklog_stato set lock_fino = null where id = 1;
$$;

-- Fornitori (riga core) e Griglia delle sole settimane richieste ([{anno, week}]), senza
-- scaricare tutta la pianificazione. Chiavi del risultato: "anno|week".
create or replace function public.fornitori_wl_dati(p_settimane jsonb)
returns jsonb language sql stable security definer set search_path to 'public' as $$
  select jsonb_build_object(
    'fornitori', coalesce((select payload -> 'fornitori' from staffing_state where id = 1), '[]'::jsonb),
    'settimane', coalesce((
      select jsonb_object_agg((s ->> 'anno') || '|' || (s ->> 'week'),
                              coalesce(st.payload -> 'pw_data' -> (s ->> 'anno') -> (s ->> 'week'), '[]'::jsonb))
        from jsonb_array_elements(coalesce(p_settimane, '[]'::jsonb)) s, staffing_state st
       where st.id = 2), '{}'::jsonb));
$$;

-- Token con cui il cron chiama la Edge Function (generato qui, resta solo in Vault).
select vault.create_secret(replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''), 'fornitori_wl_cron_token')
 where not exists (select 1 from vault.secrets where name = 'fornitori_wl_cron_token');

create or replace function public.fornitori_wl_cron_token()
returns text language sql stable security definer set search_path to 'public', 'vault' as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'fornitori_wl_cron_token';
$$;

revoke all on function public.fornitori_wl_lock(int)         from public, anon, authenticated;
revoke all on function public.fornitori_wl_unlock()          from public, anon, authenticated;
revoke all on function public.fornitori_wl_dati(jsonb)       from public, anon, authenticated;
revoke all on function public.fornitori_wl_cron_token()      from public, anon, authenticated;
grant execute on function public.fornitori_wl_lock(int)      to service_role;
grant execute on function public.fornitori_wl_unlock()       to service_role;
grant execute on function public.fornitori_wl_dati(jsonb)    to service_role;
grant execute on function public.fornitori_wl_cron_token()   to service_role;

-- pg_net: con lei il cron (e la prova in anteprima da SQL) chiama la Edge Function.
create extension if not exists pg_net;

-- Il giro automatico (pg_cron) è in 20261106_fornitori_worklog_cron.sql, attivato dopo la prova.
