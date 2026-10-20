-- Funzioni/pagine nascoste ai non-admin dal pannello admin "🧩 Funzioni" (src/js/sb-funzioni.js).
-- Riga presente = funzione nascosta. Tutti leggono, solo admin inserisce/cancella.
create table if not exists public.app_funzioni_nascoste (
  chiave text primary key,
  nascosta_da text not null default (auth.jwt() ->> 'email'),
  nascosta_il timestamptz not null default now()
);
comment on table public.app_funzioni_nascoste is 'Funzioni/pagine nascoste ai non-admin (riga presente = nascosta). Gestita dal pannello admin "Funzioni".';
alter table public.app_funzioni_nascoste enable row level security;
create policy app_fn_select on public.app_funzioni_nascoste for select to authenticated using (true);
create policy app_fn_insert on public.app_funzioni_nascoste for insert to authenticated
  with check (((auth.jwt() -> 'user_metadata') ->> 'role') = 'admin');
create policy app_fn_delete on public.app_funzioni_nascoste for delete to authenticated
  using (((auth.jwt() -> 'user_metadata') ->> 'role') = 'admin');
alter publication supabase_realtime add table public.app_funzioni_nascoste;
