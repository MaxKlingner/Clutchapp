-- Identité posée à l'inscription : nom, pour qui, localité.

alter table public.user_profiles
  add column if not exists first_name text;

alter table public.user_profiles
  add column if not exists last_name text;

alter table public.user_profiles
  add column if not exists seeking_for text;

alter table public.user_profiles
  add column if not exists city text;

alter table public.user_profiles
  add column if not exists postal_code text;

alter table public.user_profiles
  add column if not exists latitude double precision;

alter table public.user_profiles
  add column if not exists longitude double precision;

alter table public.user_profiles
  add column if not exists search_filters jsonb;

alter table public.user_profiles
  drop constraint if exists user_profiles_seeking_for_check;

alter table public.user_profiles
  add constraint user_profiles_seeking_for_check
  check (seeking_for is null or seeking_for in ('self', 'other'));

notify pgrst, 'reload schema';
