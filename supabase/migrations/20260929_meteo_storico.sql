-- v18.181.0 — Storico meteo (già applicata sul progetto Supabase il 2026-09-29, migrazione "meteo_storico").
-- Popolate dal client (src/js/meteo-storico.js) per i giorni passati pianificati in Griglia.

-- Storico meteo osservato (archivio Open-Meteo) per località e giorno, condiviso tra utenti.
create table if not exists public.meteo_storico (
  pos_key    text not null,               -- "lat,lon" arrotondati a 2 decimali (stessa chiave di _meteoCache)
  data       date not null,
  lat        double precision not null,
  lng        double precision not null,
  code       integer,                     -- WMO weathercode giornaliero
  tmax       real,
  tmin       real,
  precip_mm  real,                        -- pioggia totale del giorno
  hourly     jsonb not null default '[]'::jsonb,  -- [{hour, temp, code, precip}]
  definitivo boolean not null default false,       -- false = dato recente, riscaricato quando l'archivio si consolida
  updated_at timestamptz not null default now(),
  primary key (pos_key, data)
);
create index if not exists meteo_storico_data_idx on public.meteo_storico (data);
comment on table public.meteo_storico is 'Meteo osservato per cantiere/giorno (Open-Meteo archive), popolato dal client per i giorni passati pianificati in Griglia.';

-- Criticità Protezione Civile del bollettino del giorno, per cantiere (null = comune non presente nel bollettino).
create table if not exists public.pc_storico (
  data         date not null,
  cantiere_key text not null,             -- nome cantiere normalizzato (minuscolo, spazi compattati)
  info         jsonb,                     -- {zona, idraulico, temporali, idrogeologico} | null
  bollettino   text,
  updated_at   timestamptz not null default now(),
  primary key (data, cantiere_key)
);
comment on table public.pc_storico is 'Criticità del bollettino Protezione Civile per cantiere/giorno, popolato dal client per i giorni passati.';

alter table public.meteo_storico enable row level security;
alter table public.pc_storico enable row level security;

-- Dati derivati da fonti pubbliche: ogni utente autenticato (anche sola lettura) può leggerli
-- e contribuire al recupero; nessuna policy di delete.
create policy meteo_storico_select on public.meteo_storico for select to authenticated using (true);
create policy meteo_storico_insert on public.meteo_storico for insert to authenticated with check (true);
create policy meteo_storico_update on public.meteo_storico for update to authenticated using (true) with check (true);
create policy pc_storico_select on public.pc_storico for select to authenticated using (true);
create policy pc_storico_insert on public.pc_storico for insert to authenticated with check (true);
create policy pc_storico_update on public.pc_storico for update to authenticated using (true) with check (true);
