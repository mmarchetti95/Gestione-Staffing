-- v18.224.0 — Controllo Produzione: campo Jira di produzione per commessa.
-- Le commesse col nuovo formato (per ora SINFI) registrano la produzione su
-- "KPI_Quantità lavorata" invece che su "Actual Production". Su Jira non si può
-- ricavare: il campo è sullo screen dei sottotask di tutte le commesse (verificato
-- il 26/10/2026 su AI029, WT036, PS019), quindi la scelta è un'impostazione dell'app.
-- Commessa assente = Actual Production. Lettura per tutti, modifica admin/responsabile.
create table if not exists public.cp_campo_produzione (
  commessa text primary key,
  campo text not null check (campo in ('Actual Production', 'KPI_Quantità lavorata')),
  aggiornato_da text not null default (auth.jwt() ->> 'email'),
  aggiornato_il timestamptz not null default now()
);
comment on table public.cp_campo_produzione is 'Campo Jira su cui Controllo Produzione scrive il Km/Cad dei sottotask, per commessa (nome come in pwData). Commessa assente = Actual Production. Dalla v18.224.0.';
alter table public.cp_campo_produzione enable row level security;
create policy cp_campo_select on public.cp_campo_produzione for select to authenticated using (true);
create policy cp_campo_insert on public.cp_campo_produzione for insert to authenticated
  with check (((auth.jwt() -> 'user_metadata') ->> 'role') = any (array['admin', 'responsabile']));
create policy cp_campo_update on public.cp_campo_produzione for update to authenticated
  using (((auth.jwt() -> 'user_metadata') ->> 'role') = any (array['admin', 'responsabile']))
  with check (((auth.jwt() -> 'user_metadata') ->> 'role') = any (array['admin', 'responsabile']));
create policy cp_campo_delete on public.cp_campo_produzione for delete to authenticated
  using (((auth.jwt() -> 'user_metadata') ->> 'role') = any (array['admin', 'responsabile']));
insert into public.cp_campo_produzione (commessa, campo, aggiornato_da)
  values ('Sinfi', 'KPI_Quantità lavorata', 'migrazione v18.224.0')
  on conflict (commessa) do nothing;
