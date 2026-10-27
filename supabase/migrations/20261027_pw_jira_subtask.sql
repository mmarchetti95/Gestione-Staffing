-- v18.229.0 — Sottotask Jira giornalieri (applicata sul progetto Supabase il 2026-10-27, migrazione "pw_jira_subtask").
-- Un sottotask per operatore + cantiere + attività + GIORNO (prima uno per settimana).
-- Il legame cella della Griglia -> sottotask Jira sta qui e non più in pwData
-- (bc.jiraSubtask): con un sottotask al giorno la mappa sarebbe cresciuta di ~30 KB a
-- settimana dentro la riga di pianificazione, che si risincronizza a ogni salvataggio.
-- I collegamenti settimanali già salvati restano in bc.jiraSubtask (sola lettura,
-- valgono per tutti i giorni della settimana): vedi src/js/weekly-jira-subtask-db.js.
-- È anche la mappatura giornaliera cantiere/commessa -> ticket Jira, interrogabile da SQL.

create table if not exists public.pw_jira_subtask (
  id          bigint generated always as identity primary key,
  anno        int      not null,
  week        int      not null,
  commessa    text     not null,
  cantiere    text     not null,
  operatore   text     not null,                 -- nome operatore dell'app (come in Griglia)
  attivita    text     not null default '',
  giorno      smallint not null check (giorno between 0 and 5),  -- 0 = lunedì
  data        date     not null,                 -- il giorno del sottotask
  status      text     not null check (status in ('created', 'already_exists', 'error')),
  jira_key    text     not null default '',
  url         text     not null default '',
  message     text     not null default '',      -- motivo dell'errore (status 'error')
  task_key    text     not null default '',      -- Task Jira padre
  updated_at  timestamptz not null default now(),
  updated_by  text,
  constraint pw_jira_subtask_voce unique (anno, week, commessa, cantiere, operatore, attivita, giorno)
);
comment on table public.pw_jira_subtask is 'Sottotask Jira giornalieri creati dalla Griglia: uno per operatore/cantiere/attività/giorno.';

create index if not exists pw_jira_subtask_key_idx on public.pw_jira_subtask (jira_key) where jira_key <> '';
create index if not exists pw_jira_subtask_data_idx on public.pw_jira_subtask (data);

alter table public.pw_jira_subtask enable row level security;

-- Lettura per tutti gli autenticati; scrittura (creazione sottotask, correzioni dal
-- controllo sottotask) solo admin/responsabile, come il resto della Griglia.
create policy pw_jsub_select on public.pw_jira_subtask for select to authenticated using (true);
create policy pw_jsub_insert on public.pw_jira_subtask for insert to authenticated
  with check (((auth.jwt() -> 'user_metadata') ->> 'role') = any (array['admin', 'responsabile']));
create policy pw_jsub_update on public.pw_jira_subtask for update to authenticated
  using (((auth.jwt() -> 'user_metadata') ->> 'role') = any (array['admin', 'responsabile']))
  with check (((auth.jwt() -> 'user_metadata') ->> 'role') = any (array['admin', 'responsabile']));
create policy pw_jsub_delete on public.pw_jira_subtask for delete to authenticated
  using (((auth.jwt() -> 'user_metadata') ->> 'role') = any (array['admin', 'responsabile']));

alter publication supabase_realtime add table public.pw_jira_subtask;
