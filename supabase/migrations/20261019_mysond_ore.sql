-- v18.208.0 — Ore MySond nel Controllo produzione (già applicata sul progetto Supabase il 2026-10-19, migrazione "mysond_ore").
-- Popolata dal client (src/js/produzione-mysond.js, "📥 Carica MySond"): una riga per
-- operatore+giorno con il totale ore e la composizione. Un nuovo caricamento cancella e
-- reinserisce i giorni coperti dal file.

create table if not exists public.mysond_ore (
  data        date not null,
  operatore   text not null,               -- nome operatore dell'app (nome_esteso, come in Griglia)
  dipendente  text,                        -- nome come compare nell'export MySond
  ore         numeric not null default 0,  -- totale del giorno, tutte le commesse
  dettaglio   jsonb not null default '[]'::jsonb, -- [{commessa, voce, att1, att2, descrizione, tipo, ore}]
  caricato_at timestamptz not null default now(),
  caricato_da text,
  primary key (data, operatore)
);
comment on table public.mysond_ore is 'Ore inserite in MySond per operatore/giorno, caricate dal Controllo produzione (export Excel).';

alter table public.mysond_ore enable row level security;

-- Lettura per tutti gli autenticati; caricamento (delete + insert) solo admin/responsabile.
create policy mysond_ore_select on public.mysond_ore for select to authenticated using (true);
create policy mysond_ore_insert on public.mysond_ore for insert to authenticated
  with check (((auth.jwt() -> 'user_metadata') ->> 'role') = any (array['admin', 'responsabile']));
create policy mysond_ore_delete on public.mysond_ore for delete to authenticated
  using (((auth.jwt() -> 'user_metadata') ->> 'role') = any (array['admin', 'responsabile']));
