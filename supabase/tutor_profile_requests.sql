-- CLUTCH: profil tuteur éditable + demandes de cours (matches.status)

-- Enrichir public.profiles pour lier un compte Clerk + infos swipe
alter table public.profiles
  add column if not exists clerk_id text;

alter table public.profiles
  add column if not exists bio text;

alter table public.profiles
  add column if not exists specialties text[] not null default '{}';

alter table public.profiles
  add column if not exists study_year text;

-- Un clerk_id = un profil tuteur max
create unique index if not exists profiles_clerk_id_uidx
  on public.profiles (clerk_id)
  where clerk_id is not null;

create index if not exists profiles_clerk_id_idx
  on public.profiles (clerk_id);

-- Statut des matches : pending → accept / decline
alter table public.matches
  add column if not exists status text;

update public.matches
set status = 'accepted'
where status is null;

alter table public.matches
  alter column status set default 'pending';

alter table public.matches
  alter column status set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'matches_status_check'
  ) then
    alter table public.matches
      add constraint matches_status_check
      check (status in ('pending', 'accepted', 'declined'));
  end if;
end $$;

create index if not exists matches_status_idx on public.matches (status);
create index if not exists matches_tutor_status_idx
  on public.matches (tutor_id, status);

-- Policies écriture sur profiles (édition / onboarding tuteur)
drop policy if exists "Public can read profiles" on public.profiles;
drop policy if exists "profiles_select_all" on public.profiles;
drop policy if exists "profiles_insert_all" on public.profiles;
drop policy if exists "profiles_update_all" on public.profiles;
drop policy if exists "profiles_delete_all" on public.profiles;

create policy "profiles_select_all"
  on public.profiles for select
  to anon, authenticated
  using (true);

create policy "profiles_insert_all"
  on public.profiles for insert
  to anon, authenticated
  with check (true);

create policy "profiles_update_all"
  on public.profiles for update
  to anon, authenticated
  using (true)
  with check (true);

create policy "profiles_delete_all"
  on public.profiles for delete
  to anon, authenticated
  using (true);

notify pgrst, 'reload schema';
