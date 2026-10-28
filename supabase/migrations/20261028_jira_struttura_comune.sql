-- v18.231.0 — Struttura Jira per comune (applicata sul progetto Supabase il 2026-10-28, migrazione "jira_struttura_comune").
-- Per ogni commessa con un MODELLO in Jira (state.commesse_attive_meta[commessa].jira_modello,
-- es. l'Iniziativa AI029-604 "MODELLO" con le sue Epic e i suoi Task), l'Edge Function
-- jira-struttura-comune copia l'albero per un comune (Iniziativa -> Epic -> Task, senza
-- sottotask) e salva qui le chiavi create o ritrovate: è il legame CERTO comune -> Epic/Task
-- con cui la creazione dei sottotask dalla Griglia propone Epic e Task.
-- Scrive solo l'Edge Function (service_role); il client legge.

create table if not exists public.jira_struttura_comune (
  id           bigint generated always as identity primary key,
  commessa     text not null,
  comune       text not null,                     -- come scritto dall'utente (nome del cantiere in Griglia)
  comune_norm  text not null,                     -- minuscolo, senza accenti/spazi doppi: chiave di confronto
  project_key  text not null,
  modello_key  text not null,                     -- radice del modello copiato
  radice_key   text not null default '',          -- radice creata/ritrovata per il comune
  nodi         jsonb not null default '[]'::jsonb, -- [{ modello, key, summary, tipo, livello }]
  stato        text not null default 'completa' check (stato in ('completa', 'parziale')),
  updated_at   timestamptz not null default now(),
  updated_by   text,
  constraint jira_struttura_comune_voce unique (commessa, comune_norm)
);
comment on table public.jira_struttura_comune is 'Strutture Jira (Iniziativa/Epic/Task) create o ritrovate per comune dal modello della commessa.';

alter table public.jira_struttura_comune enable row level security;

create policy jira_struttura_select on public.jira_struttura_comune for select to authenticated using (true);
