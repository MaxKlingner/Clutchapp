-- CLUTCH: favoris + localisation tuteurs + formats de cours
-- À exécuter dans le SQL Editor Supabase (une seule fois).

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- 1) Favoris (parent Clerk id ↔ profil tuteur UUID)
-- ---------------------------------------------------------------------------
create table if not exists public.favorite_tutors (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  tutor_id uuid not null
    references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint favorite_tutors_user_tutor_uidx unique (user_id, tutor_id)
);

create index if not exists favorite_tutors_user_id_idx
  on public.favorite_tutors (user_id);

create index if not exists favorite_tutors_tutor_id_idx
  on public.favorite_tutors (tutor_id);

alter table public.favorite_tutors enable row level security;

drop policy if exists "favorite_tutors_select_all" on public.favorite_tutors;
drop policy if exists "favorite_tutors_insert_all" on public.favorite_tutors;
drop policy if exists "favorite_tutors_update_all" on public.favorite_tutors;
drop policy if exists "favorite_tutors_delete_all" on public.favorite_tutors;

create policy "favorite_tutors_select_all"
  on public.favorite_tutors for select
  to anon, authenticated
  using (true);

create policy "favorite_tutors_insert_all"
  on public.favorite_tutors for insert
  to anon, authenticated
  with check (true);

create policy "favorite_tutors_update_all"
  on public.favorite_tutors for update
  to anon, authenticated
  using (true)
  with check (true);

create policy "favorite_tutors_delete_all"
  on public.favorite_tutors for delete
  to anon, authenticated
  using (true);

-- ---------------------------------------------------------------------------
-- 2) Localisation + formats sur profiles
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists city text;

alter table public.profiles
  add column if not exists postal_code text;

alter table public.profiles
  add column if not exists latitude double precision;

alter table public.profiles
  add column if not exists longitude double precision;

alter table public.profiles
  add column if not exists teaching_formats text[] not null default '{}';

create index if not exists profiles_city_idx
  on public.profiles (lower(city));

create index if not exists profiles_postal_code_idx
  on public.profiles (postal_code);

create index if not exists profiles_teaching_formats_gin
  on public.profiles using gin (teaching_formats);

-- Seed soft : Louvain-la-Neuve pour les tuteurs sans ville
update public.profiles
set
  city = coalesce(nullif(trim(city), ''), 'Ottignies-Louvain-la-Neuve'),
  postal_code = coalesce(nullif(trim(postal_code), ''), '1348'),
  latitude = coalesce(latitude, 50.6681),
  longitude = coalesce(longitude, 4.6115),
  teaching_formats = case
    when teaching_formats is null or cardinality(teaching_formats) = 0
      then array['Présentiel', 'En ligne']::text[]
    else teaching_formats
  end
where role = 'tutor';

notify pgrst, 'reload schema';
