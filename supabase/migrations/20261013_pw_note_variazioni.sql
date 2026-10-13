-- v18.201.0 — Lavagna "Note/Variazioni" della Griglia settimanale (già applicata sul progetto
-- Supabase il 2026-10-13, migrazione "pw_note_variazioni"). Client: src/js/weekly-note-variazioni.js.
-- Una riga per messaggio, solo aggiunta: data/ora e autore li mette il server (default), così
-- non dipendono dall'orologio del browser e due utenti che scrivono insieme non si sovrascrivono
-- (a differenza di un campo dentro pwData, dove un conflitto di sync farebbe perdere la nota).

create table if not exists public.pw_note_variazioni (
  id           bigint generated always as identity primary key,
  anno         integer  not null,
  week         integer  not null check (week between 1 and 53),
  giorno       smallint check (giorno between 0 and 5),             -- null = tutta la settimana
  tipo         text     not null default 'nota' check (tipo in ('nota', 'variazione')),
  testo        text     not null check (char_length(testo) between 1 and 2000),
  user_id      uuid     not null default auth.uid(),
  autore_email text     not null default (auth.jwt() ->> 'email'),
  autore_nome  text,
  created_at   timestamptz not null default now()
);
create index if not exists pw_note_variazioni_settimana_idx on public.pw_note_variazioni (anno, week, created_at desc);
comment on table public.pw_note_variazioni is 'Lavagna Note/Variazioni della Griglia settimanale: messaggi con autore e data/ora, solo aggiunta.';

alter table public.pw_note_variazioni enable row level security;

-- Lettura: tutti gli autenticati. Scrittura: stessi ruoli che possono modificare la Griglia
-- (staffing_state.allow_write), firmata con il proprio utente. Nessun update: un messaggio
-- sbagliato si cancella (solo il proprio, o qualsiasi per l'admin) e si riscrive.
create policy pw_nv_select on public.pw_note_variazioni for select to authenticated using (true);
create policy pw_nv_insert on public.pw_note_variazioni for insert to authenticated with check (
  user_id = auth.uid()
  and autore_email = (auth.jwt() ->> 'email')
  and ((auth.jwt() -> 'user_metadata') ->> 'role') = any (array['admin', 'responsabile'])
);
create policy pw_nv_delete on public.pw_note_variazioni for delete to authenticated using (
  user_id = auth.uid() or ((auth.jwt() -> 'user_metadata') ->> 'role') = 'admin'
);

-- Realtime: il modal aperto e il contatore sul bottone si aggiornano quando scrive un collega.
alter publication supabase_realtime add table public.pw_note_variazioni;
