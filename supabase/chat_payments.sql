-- CLUTCH: wallets + messages payment_request

create table if not exists public.wallets (
  clerk_id text primary key,
  balance numeric(12, 2) not null default 50
    check (balance >= 0),
  updated_at timestamptz not null default now()
);

alter table public.wallets enable row level security;

drop policy if exists "wallets_select_all" on public.wallets;
drop policy if exists "wallets_insert_all" on public.wallets;
drop policy if exists "wallets_update_all" on public.wallets;
drop policy if exists "wallets_delete_all" on public.wallets;

create policy "wallets_select_all"
  on public.wallets for select
  to anon, authenticated
  using (true);

create policy "wallets_insert_all"
  on public.wallets for insert
  to anon, authenticated
  with check (true);

create policy "wallets_update_all"
  on public.wallets for update
  to anon, authenticated
  using (true)
  with check (true);

create policy "wallets_delete_all"
  on public.wallets for delete
  to anon, authenticated
  using (true);

-- Colonnes paiement sur messages
alter table public.messages
  add column if not exists message_type text;

alter table public.messages
  add column if not exists hours numeric(6, 2);

alter table public.messages
  add column if not exists amount numeric(12, 2);

alter table public.messages
  add column if not exists hourly_rate numeric(10, 2);

alter table public.messages
  add column if not exists payment_status text;

update public.messages
set message_type = 'text'
where message_type is null;

alter table public.messages
  alter column message_type set default 'text';

alter table public.messages
  alter column message_type set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'messages_message_type_check'
  ) then
    alter table public.messages
      add constraint messages_message_type_check
      check (message_type in ('text', 'payment_request'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'messages_payment_status_check'
  ) then
    alter table public.messages
      add constraint messages_payment_status_check
      check (
        payment_status is null
        or payment_status in ('pending', 'paid')
      );
  end if;
end $$;

-- Realtime wallets (optionnel mais utile)
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'wallets'
  ) then
    alter publication supabase_realtime add table public.wallets;
  end if;
end $$;

notify pgrst, 'reload schema';
