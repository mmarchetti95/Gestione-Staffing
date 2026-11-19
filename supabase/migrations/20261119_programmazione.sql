-- v18.295.0 — Programmazione: board tipo Monday per la fase che precede la partenza operativa
-- dei rilievi (ODL, contatti col comune, documenti, sopralluoghi, qualità del dato, stato).
-- Client: src/js/programmazione*.js. Sostituisce Monday (abbandonato: niente API, si teneva
-- allineato a mano con Jira e con la dashboard).
-- Tabelle dedicate e non staffing_state: centinaia di elementi modificati da più persone in
-- contemporanea; un conflitto su un dominio unico farebbe perdere modifiche.
--   prg_board     una board (es. SINFI WALKOUT) con la definizione delle colonne (jsonb)
--   prg_elemento  una riga della board; i valori delle colonne in `valori` (id colonna -> valore)
--   prg_commento  aggiornamenti/commenti per elemento (anche quelli importati da Monday)
--   prg_storico   chi ha cambiato cosa e quando (scritto solo dal trigger)
-- Scrittura: admin e responsabile. Lettura: tutti gli autenticati.

create table if not exists public.prg_board (
  id          bigint generated always as identity primary key,
  nome        text not null check (char_length(nome) between 1 and 120),
  commessa    text,
  colonne     jsonb not null default '[]'::jsonb,
  config      jsonb not null default '{}'::jsonb,
  ordine      integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  updated_by  text default (auth.jwt() ->> 'email')
);
comment on table public.prg_board is 'Programmazione: board (colonne in jsonb, config.gruppo = colonna di stato che raggruppa).';

create table if not exists public.prg_elemento (
  id          bigint generated always as identity primary key,
  board_id    bigint not null references public.prg_board(id) on delete cascade,
  nome        text not null default '' check (char_length(nome) <= 300),
  valori      jsonb not null default '{}'::jsonb,
  ordine      double precision not null default 0,
  monday_id   text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  updated_by  text default (auth.jwt() ->> 'email'),
  unique (board_id, monday_id)
);
create index if not exists prg_elemento_board_idx on public.prg_elemento (board_id);
comment on table public.prg_elemento is 'Programmazione: elementi di una board; valori = { id colonna: valore }.';

create table if not exists public.prg_commento (
  id              bigint generated always as identity primary key,
  elemento_id     bigint not null references public.prg_elemento(id) on delete cascade,
  board_id        bigint not null references public.prg_board(id) on delete cascade,
  testo           text not null check (char_length(testo) between 1 and 10000),
  user_id         uuid not null default auth.uid(),
  autore_email    text not null default (auth.jwt() ->> 'email'),
  autore_nome     text,
  origine         text not null default 'app' check (origine in ('app', 'monday')),
  autore_originale text,
  data_originale  timestamptz,
  monday_post_id  text,
  created_at      timestamptz not null default now(),
  unique (board_id, monday_post_id)
);
create index if not exists prg_commento_elemento_idx on public.prg_commento (elemento_id);
create index if not exists prg_commento_board_idx on public.prg_commento (board_id);
comment on table public.prg_commento is 'Programmazione: aggiornamenti per elemento (origine monday = importati, con autore e data originali).';

create table if not exists public.prg_storico (
  id           bigint generated always as identity primary key,
  elemento_id  bigint not null references public.prg_elemento(id) on delete cascade,
  board_id     bigint not null,
  campo        text not null,
  prima        jsonb,
  dopo         jsonb,
  autore_email text,
  created_at   timestamptz not null default now()
);
create index if not exists prg_storico_elemento_idx on public.prg_storico (elemento_id, created_at desc);
comment on table public.prg_storico is 'Programmazione: storico modifiche per campo (scritto dal trigger prg_elemento_storico).';

-- updated_at / updated_by su ogni modifica
create or replace function public.prg_touch() returns trigger
language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  new.updated_by := coalesce(auth.jwt() ->> 'email', new.updated_by);
  return new;
end $$;

drop trigger if exists prg_board_touch on public.prg_board;
create trigger prg_board_touch before update on public.prg_board for each row execute function public.prg_touch();
drop trigger if exists prg_elemento_touch on public.prg_elemento;
create trigger prg_elemento_touch before update on public.prg_elemento for each row execute function public.prg_touch();

-- Storico: una riga per campo cambiato (nome = '__nome'). Security definer perché
-- prg_storico non ha policy di insert: lo scrive solo questo trigger.
create or replace function public.prg_elemento_storico() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  k text;
begin
  if new.nome is distinct from old.nome then
    insert into prg_storico (elemento_id, board_id, campo, prima, dopo, autore_email)
    values (new.id, new.board_id, '__nome', to_jsonb(old.nome), to_jsonb(new.nome), auth.jwt() ->> 'email');
  end if;
  for k in
    select key from jsonb_object_keys(old.valori) as t(key)
    union
    select key from jsonb_object_keys(new.valori) as t(key)
  loop
    if (old.valori -> k) is distinct from (new.valori -> k) then
      insert into prg_storico (elemento_id, board_id, campo, prima, dopo, autore_email)
      values (new.id, new.board_id, k, old.valori -> k, new.valori -> k, auth.jwt() ->> 'email');
    end if;
  end loop;
  return null;
end $$;

drop trigger if exists prg_elemento_storico on public.prg_elemento;
create trigger prg_elemento_storico after update on public.prg_elemento for each row execute function public.prg_elemento_storico();

-- Modifica di UN campo senza riscrivere gli altri: due colleghi che cambiano celle diverse
-- dello stesso elemento non si sovrascrivono. p_campo '__nome' = nome dell'elemento;
-- p_valore null = svuota. Security invoker: valgono le RLS dell'utente.
create or replace function public.prg_imposta(p_id bigint, p_campo text, p_valore jsonb)
returns setof public.prg_elemento
language sql security invoker set search_path = public as $$
  update prg_elemento set
    nome = case when p_campo = '__nome' then coalesce(p_valore #>> '{}', '') else nome end,
    valori = case
      when p_campo = '__nome' then valori
      when p_valore is null or p_valore = 'null'::jsonb then valori - p_campo
      else valori || jsonb_build_object(p_campo, p_valore)
    end
  where id = p_id
  returning *;
$$;

alter table public.prg_board    enable row level security;
alter table public.prg_elemento enable row level security;
alter table public.prg_commento enable row level security;
alter table public.prg_storico  enable row level security;

create policy prg_board_select on public.prg_board for select to authenticated using (true);
create policy prg_board_insert on public.prg_board for insert to authenticated with check (((auth.jwt() -> 'user_metadata') ->> 'role') = any (array['admin', 'responsabile']));
create policy prg_board_update on public.prg_board for update to authenticated using (((auth.jwt() -> 'user_metadata') ->> 'role') = any (array['admin', 'responsabile']));
create policy prg_board_delete on public.prg_board for delete to authenticated using (((auth.jwt() -> 'user_metadata') ->> 'role') = any (array['admin', 'responsabile']));

create policy prg_elemento_select on public.prg_elemento for select to authenticated using (true);
create policy prg_elemento_insert on public.prg_elemento for insert to authenticated with check (((auth.jwt() -> 'user_metadata') ->> 'role') = any (array['admin', 'responsabile']));
create policy prg_elemento_update on public.prg_elemento for update to authenticated using (((auth.jwt() -> 'user_metadata') ->> 'role') = any (array['admin', 'responsabile']));
create policy prg_elemento_delete on public.prg_elemento for delete to authenticated using (((auth.jwt() -> 'user_metadata') ->> 'role') = any (array['admin', 'responsabile']));

create policy prg_commento_select on public.prg_commento for select to authenticated using (true);
create policy prg_commento_insert on public.prg_commento for insert to authenticated with check (
  user_id = auth.uid()
  and autore_email = (auth.jwt() ->> 'email')
  and ((auth.jwt() -> 'user_metadata') ->> 'role') = any (array['admin', 'responsabile'])
);
create policy prg_commento_delete on public.prg_commento for delete to authenticated using (
  user_id = auth.uid() or ((auth.jwt() -> 'user_metadata') ->> 'role') = 'admin'
);

create policy prg_storico_select on public.prg_storico for select to authenticated using (true);

-- Realtime: la board aperta si aggiorna quando un collega modifica.
alter publication supabase_realtime add table public.prg_board;
alter publication supabase_realtime add table public.prg_elemento;
alter publication supabase_realtime add table public.prg_commento;

-- Le funzioni non sono API: il trigger dello storico non si chiama via /rpc (avviso Supabase
-- «security definer eseguibile»; un trigger non richiede EXECUTE a chi modifica la riga).
revoke execute on function public.prg_elemento_storico() from public, anon, authenticated;
revoke execute on function public.prg_touch() from public, anon;
revoke execute on function public.prg_imposta(bigint, text, jsonb) from public, anon;
grant execute on function public.prg_imposta(bigint, text, jsonb) to authenticated;
