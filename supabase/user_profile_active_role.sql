-- Rôle d'inscription figé + côté actuellement affiché + premier passage de chaque côté.

alter table public.user_profiles
  add column if not exists active_role text;

alter table public.user_profiles
  add column if not exists visited_parent_at timestamptz;

alter table public.user_profiles
  add column if not exists visited_tutor_at timestamptz;

update public.user_profiles
set active_role = role
where active_role is null
  and role in ('parent', 'tutor');

update public.user_profiles
set visited_parent_at = coalesce(visited_parent_at, created_at)
where active_role = 'parent'
  and visited_parent_at is null;

update public.user_profiles
set visited_tutor_at = coalesce(visited_tutor_at, created_at)
where active_role = 'tutor'
  and visited_tutor_at is null;

alter table public.user_profiles
  drop constraint if exists user_profiles_active_role_check;

alter table public.user_profiles
  add constraint user_profiles_active_role_check
  check (active_role is null or active_role in ('parent', 'tutor'));

notify pgrst, 'reload schema';
