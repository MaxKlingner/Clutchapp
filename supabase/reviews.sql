-- CLUTCH: avis / notation des tuteurs

create extension if not exists "pgcrypto";

create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null unique
    references public.matches (id) on delete cascade,
  reviewer_id text not null,
  tutor_id uuid not null
    references public.profiles (id) on delete cascade,
  rating integer not null check (rating >= 1 and rating <= 5),
  comment text,
  created_at timestamptz not null default now()
);

create index if not exists reviews_tutor_id_idx on public.reviews (tutor_id);
create index if not exists reviews_reviewer_id_idx on public.reviews (reviewer_id);

alter table public.profiles
  add column if not exists review_count integer not null default 0;

alter table public.reviews enable row level security;

drop policy if exists "reviews_select_all" on public.reviews;
drop policy if exists "reviews_insert_all" on public.reviews;
drop policy if exists "reviews_update_all" on public.reviews;
drop policy if exists "reviews_delete_all" on public.reviews;

create policy "reviews_select_all"
  on public.reviews for select
  to anon, authenticated
  using (true);

create policy "reviews_insert_all"
  on public.reviews for insert
  to anon, authenticated
  with check (true);

create policy "reviews_update_all"
  on public.reviews for update
  to anon, authenticated
  using (true)
  with check (true);

create policy "reviews_delete_all"
  on public.reviews for delete
  to anon, authenticated
  using (true);

notify pgrst, 'reload schema';
