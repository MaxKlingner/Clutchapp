-- CLUTCH: photo de profil tuteur (avatar)
-- À exécuter dans Supabase → SQL Editor → Run

alter table public.profiles
  add column if not exists avatar_url text;

-- Bucket public pour les avatars
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'tutor-avatars',
  'tutor-avatars',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Lecture publique
drop policy if exists "Public read tutor avatars" on storage.objects;
create policy "Public read tutor avatars"
  on storage.objects
  for select
  to anon, authenticated
  using (bucket_id = 'tutor-avatars');

-- Upload / update / delete (clé anon — app Clerk)
drop policy if exists "Anon upload tutor avatars" on storage.objects;
create policy "Anon upload tutor avatars"
  on storage.objects
  for insert
  to anon, authenticated
  with check (bucket_id = 'tutor-avatars');

drop policy if exists "Anon update tutor avatars" on storage.objects;
create policy "Anon update tutor avatars"
  on storage.objects
  for update
  to anon, authenticated
  using (bucket_id = 'tutor-avatars')
  with check (bucket_id = 'tutor-avatars');

drop policy if exists "Anon delete tutor avatars" on storage.objects;
create policy "Anon delete tutor avatars"
  on storage.objects
  for delete
  to anon, authenticated
  using (bucket_id = 'tutor-avatars');
