-- CLUTCH: table profiles + seed tuteurs
-- À exécuter dans Supabase → SQL Editor → Run

create extension if not exists "pgcrypto";

create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  subject text not null,
  hourly_rate numeric(10, 2) not null check (hourly_rate >= 0),
  rating numeric(2, 1) not null default 0
    check (rating >= 0 and rating <= 5),
  role text not null check (role in ('tutor', 'student')),
  created_at timestamptz not null default now()
);

create index if not exists profiles_role_idx on public.profiles (role);

-- Lecture publique des profils (nécessaire pour Expo Go avec la clé anon)
alter table public.profiles enable row level security;

drop policy if exists "Public can read profiles" on public.profiles;
create policy "Public can read profiles"
  on public.profiles
  for select
  to anon, authenticated
  using (true);

-- Seed: faux tuteurs pour tester le swipe
insert into public.profiles (full_name, subject, hourly_rate, rating, role)
values
  ('Camille Dupont', 'Mathématiques', 28.00, 4.8, 'tutor'),
  ('Lucas Martin', 'Physique-Chimie', 32.00, 4.6, 'tutor'),
  ('Sofia Benali', 'Anglais', 25.00, 4.9, 'tutor'),
  ('Nina Moreau', 'Histoire-Géo', 27.00, 4.5, 'tutor'),
  ('Adam Rossi', 'Informatique', 35.00, 4.7, 'tutor');
