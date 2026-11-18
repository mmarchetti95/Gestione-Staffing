-- v18.278.0 — Controllo anomalie produzione: lista condivisa delle anomalie ignorate.
-- Client: src/js/produzione-anomalie-ignorate.js. Prima stavano nel localStorage del browser
-- (chiave cpa_ignorate_v1): su un altro PC, per un collega o dopo una pulizia dei dati del
-- browser ricomparivano tutte e i conteggi del controllo (e della Chiusura settimana)
-- sembravano sempre da rifare. Una riga = un'anomalia archiviata come ignorata.
-- anomalia_id è l'id stabile del motore (tipo|||anno|||week|||...), quindi un nuovo controllo
-- della stessa settimana ritrova la stessa anomalia.

create table if not exists public.cpa_anomalie_ignorate (
  anomalia_id  text primary key check (char_length(anomalia_id) between 1 and 500),
  anno         integer  not null,
  week         integer  not null check (week between 1 and 53),
  tipo         text     not null,
  giorno       smallint check (giorno between 0 and 5),
  titolo       text,
  dove         text,
  user_id      uuid     not null default auth.uid(),
  autore_email text     not null default (auth.jwt() ->> 'email'),
  autore_nome  text,
  created_at   timestamptz not null default now()
);
create index if not exists cpa_anomalie_ignorate_settimana_idx on public.cpa_anomalie_ignorate (anno, week);
comment on table public.cpa_anomalie_ignorate is 'Controllo anomalie produzione: anomalie archiviate come ignorate (condivise fra gli utenti).';

alter table public.cpa_anomalie_ignorate enable row level security;

-- Lettura: tutti gli autenticati. Ignorare / ripristinare: admin e responsabile (chi può
-- modificare la Griglia), firmato col proprio utente. Il ripristino lo può fare qualsiasi
-- admin/responsabile: la lista è di squadra, non personale.
create policy cpa_ign_select on public.cpa_anomalie_ignorate for select to authenticated using (true);
create policy cpa_ign_insert on public.cpa_anomalie_ignorate for insert to authenticated with check (
  user_id = auth.uid()
  and autore_email = (auth.jwt() ->> 'email')
  and ((auth.jwt() -> 'user_metadata') ->> 'role') = any (array['admin', 'responsabile'])
);
create policy cpa_ign_delete on public.cpa_anomalie_ignorate for delete to authenticated using (
  ((auth.jwt() -> 'user_metadata') ->> 'role') = any (array['admin', 'responsabile'])
);

-- Realtime: contatori e modal aperto si aggiornano quando un collega ignora o ripristina.
alter publication supabase_realtime add table public.cpa_anomalie_ignorate;
