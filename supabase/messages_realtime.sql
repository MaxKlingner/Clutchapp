-- CLUTCH: table messages + Realtime Supabase
-- sender_id = identifiant Clerk (text), pas l'uuid profiles

create extension if not exists "pgcrypto";

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches (id) on delete cascade,
  sender_id text not null,
  sender_role text not null check (sender_role in ('parent', 'tutor')),
  content text not null check (char_length(trim(content)) > 0),
  created_at timestamptz not null default now()
);

create index if not exists messages_match_id_idx
  on public.messages (match_id, created_at);

alter table public.messages enable row level security;

drop policy if exists "Public can read messages" on public.messages;
drop policy if exists "Public can insert messages" on public.messages;
drop policy if exists "Public can delete messages" on public.messages;
drop policy if exists "Public can update messages" on public.messages;
drop policy if exists "messages_select_all" on public.messages;
drop policy if exists "messages_insert_all" on public.messages;
drop policy if exists "messages_update_all" on public.messages;
drop policy if exists "messages_delete_all" on public.messages;

create policy "messages_select_all"
  on public.messages for select
  to anon, authenticated
  using (true);

create policy "messages_insert_all"
  on public.messages for insert
  to anon, authenticated
  with check (true);

create policy "messages_update_all"
  on public.messages for update
  to anon, authenticated
  using (true)
  with check (true);

create policy "messages_delete_all"
  on public.messages for delete
  to anon, authenticated
  using (true);

-- Active Realtime sur messages (idempotent)
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'messages'
  ) then
    alter publication supabase_realtime add table public.messages;
  end if;
end $$;

-- Utile pour les filtres realtime
alter table public.messages replica identity full;

notify pgrst, 'reload schema';
