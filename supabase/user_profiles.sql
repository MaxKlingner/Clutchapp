-- CLUTCH: profils utilisateurs app (Clerk) + rôle parent/tutor
-- Séparé de public.profiles (catalogue des tuteurs pour le swipe)

create extension if not exists "pgcrypto";

create table if not exists public.user_profiles (
  id uuid primary key default gen_random_uuid(),
  clerk_id text not null unique,
  role text not null check (role in ('parent', 'tutor')),
  full_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists user_profiles_clerk_id_idx
  on public.user_profiles (clerk_id);

create index if not exists user_profiles_role_idx
  on public.user_profiles (role);

alter table public.user_profiles enable row level security;

drop policy if exists "user_profiles_select_all" on public.user_profiles;
drop policy if exists "user_profiles_insert_all" on public.user_profiles;
drop policy if exists "user_profiles_update_all" on public.user_profiles;
drop policy if exists "user_profiles_delete_all" on public.user_profiles;

create policy "user_profiles_select_all"
  on public.user_profiles for select
  to anon, authenticated
  using (true);

create policy "user_profiles_insert_all"
  on public.user_profiles for insert
  to anon, authenticated
  with check (true);

create policy "user_profiles_update_all"
  on public.user_profiles for update
  to anon, authenticated
  using (true)
  with check (true);

create policy "user_profiles_delete_all"
  on public.user_profiles for delete
  to anon, authenticated
  using (true);

notify pgrst, 'reload schema';
