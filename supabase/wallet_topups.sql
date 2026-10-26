-- Recharges du portefeuille, affichées dans l’activité.

create table if not exists public.wallet_topups (
  id uuid primary key default gen_random_uuid(),
  clerk_id text not null,
  amount numeric(12, 2) not null check (amount > 0),
  created_at timestamptz not null default now()
);

create index if not exists wallet_topups_clerk_created_idx
  on public.wallet_topups (clerk_id, created_at desc);

alter table public.wallet_topups enable row level security;

drop policy if exists "wallet_topups_select_all" on public.wallet_topups;
drop policy if exists "wallet_topups_insert_all" on public.wallet_topups;
drop policy if exists "wallet_topups_update_all" on public.wallet_topups;
drop policy if exists "wallet_topups_delete_all" on public.wallet_topups;

create policy "wallet_topups_select_all"
  on public.wallet_topups for select
  to anon, authenticated
  using (true);

create policy "wallet_topups_insert_all"
  on public.wallet_topups for insert
  to anon, authenticated
  with check (true);

create policy "wallet_topups_update_all"
  on public.wallet_topups for update
  to anon, authenticated
  using (true)
  with check (true);

create policy "wallet_topups_delete_all"
  on public.wallet_topups for delete
  to anon, authenticated
  using (true);

notify pgrst, 'reload schema';
