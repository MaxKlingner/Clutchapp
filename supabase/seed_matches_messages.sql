-- CLUTCH: matches + messages
-- À exécuter dans Supabase → SQL Editor → Run

create extension if not exists "pgcrypto";

create table if not exists public.matches (
  id uuid primary key default gen_random_uuid(),
  parent_id text not null,
  tutor_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (parent_id, tutor_id)
);

create index if not exists matches_parent_id_idx on public.matches (parent_id);
create index if not exists matches_tutor_id_idx on public.matches (tutor_id);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches (id) on delete cascade,
  sender_id text not null,
  sender_role text not null check (sender_role in ('parent', 'tutor')),
  content text not null check (char_length(trim(content)) > 0),
  created_at timestamptz not null default now()
);

create index if not exists messages_match_id_idx on public.messages (match_id, created_at);

alter table public.matches enable row level security;
alter table public.messages enable row level security;

drop policy if exists "Public can read matches" on public.matches;
create policy "Public can read matches"
  on public.matches for select to anon, authenticated using (true);

drop policy if exists "Public can insert matches" on public.matches;
create policy "Public can insert matches"
  on public.matches for insert to anon, authenticated with check (true);

drop policy if exists "Public can read messages" on public.messages;
create policy "Public can read messages"
  on public.messages for select to anon, authenticated using (true);

drop policy if exists "Public can insert messages" on public.messages;
create policy "Public can insert messages"
  on public.messages for insert to anon, authenticated with check (true);

-- Force PostgREST à recharger le cache du schéma
notify pgrst, 'reload schema';
