-- CLUTCH: annulations + litiges (transactions gelées)

-- Étendre les statuts message
alter table public.messages drop constraint if exists messages_payment_status_check;

alter table public.messages
  add constraint messages_payment_status_check
  check (
    payment_status is null
    or payment_status in ('pending', 'paid', 'cancelled', 'disputed')
  );

-- Journal des paiements / litiges
create table if not exists public.payment_transactions (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null unique
    references public.messages (id) on delete cascade,
  match_id uuid not null
    references public.matches (id) on delete cascade,
  parent_clerk_id text not null,
  tutor_clerk_id text not null,
  amount numeric(12, 2) not null check (amount > 0),
  status text not null default 'completed'
    check (status in ('completed', 'disputed', 'refunded')),
  is_frozen boolean not null default false,
  dispute_reason text,
  created_at timestamptz not null default now(),
  disputed_at timestamptz
);

create index if not exists payment_transactions_tutor_frozen_idx
  on public.payment_transactions (tutor_clerk_id, is_frozen);

create index if not exists payment_transactions_parent_idx
  on public.payment_transactions (parent_clerk_id);

alter table public.payment_transactions enable row level security;

drop policy if exists "payment_transactions_select_all" on public.payment_transactions;
drop policy if exists "payment_transactions_insert_all" on public.payment_transactions;
drop policy if exists "payment_transactions_update_all" on public.payment_transactions;
drop policy if exists "payment_transactions_delete_all" on public.payment_transactions;

create policy "payment_transactions_select_all"
  on public.payment_transactions for select
  to anon, authenticated
  using (true);

create policy "payment_transactions_insert_all"
  on public.payment_transactions for insert
  to anon, authenticated
  with check (true);

create policy "payment_transactions_update_all"
  on public.payment_transactions for update
  to anon, authenticated
  using (true)
  with check (true);

create policy "payment_transactions_delete_all"
  on public.payment_transactions for delete
  to anon, authenticated
  using (true);

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'payment_transactions'
  ) then
    alter publication supabase_realtime add table public.payment_transactions;
  end if;
end $$;

notify pgrst, 'reload schema';
