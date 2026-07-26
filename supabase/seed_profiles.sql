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
  bio text,
  avatar_url text,
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
insert into public.profiles (full_name, subject, hourly_rate, rating, role, avatar_url, bio)
values
  (
    'Camille Dupont',
    'Mathématiques',
    28.00,
    4.8,
    'tutor',
    'https://i.pravatar.cc/400?img=5',
    'Étudiante en maths à l’université, j’aide collégiens et lycéens à reprendre confiance en algèbre, analyse et préparation aux examens. Cours clairs, patient·e et orientés méthode.'
  ),
  (
    'Lucas Martin',
    'Physique-Chimie',
    32.00,
    4.6,
    'tutor',
    'https://i.pravatar.cc/400?img=12',
    'Passionné de physique-chimie, je rends les notions concrètes avec des exemples du quotidien et des exercices progressifs. Idéal pour le lycée et les prépas légères.'
  ),
  (
    'Sofia Benali',
    'Anglais',
    25.00,
    4.9,
    'tutor',
    'https://i.pravatar.cc/400?img=32',
    'Tuteure d’anglais bilingue : conversation, grammaire et préparation aux oraux. Ambiance détendue, focus sur la fluidité et le vocabulaire utile au quotidien comme à l’école.'
  ),
  (
    'Nina Moreau',
    'Histoire-Géo',
    27.00,
    4.5,
    'tutor',
    'https://i.pravatar.cc/400?img=47',
    'Diplômée en histoire-géographie, j’accompagne sur les programmes du collège au lycée : fiches, dissertations et cartes mentales pour mémoriser sans stress.'
  ),
  (
    'Adam Rossi',
    'Informatique',
    35.00,
    4.7,
    'tutor',
    'https://i.pravatar.cc/400?img=15',
    'Étudiant en informatique, je propose du soutien en algorithmique, Python et bases du web. Pédagogie pas à pas, du débutant au premier projet concret.'
  );
