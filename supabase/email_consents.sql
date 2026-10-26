-- Choix d'e-mails promotionnels, posé à l'inscription.
-- promo_emails = true : on peut écrire à cette adresse pour une promo.
-- promo_emails = false : vérification du compte seulement.

create table if not exists public.email_consents (
  clerk_id text primary key,
  email text not null,
  promo_emails boolean not null default false,
  decided_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists email_consents_promo_idx
  on public.email_consents (promo_emails)
  where promo_emails;

alter table public.email_consents enable row level security;

drop policy if exists "email_consents_select_all" on public.email_consents;
drop policy if exists "email_consents_insert_all" on public.email_consents;
drop policy if exists "email_consents_update_all" on public.email_consents;
drop policy if exists "email_consents_delete_all" on public.email_consents;

create policy "email_consents_select_all"
  on public.email_consents for select
  to anon, authenticated
  using (true);

create policy "email_consents_insert_all"
  on public.email_consents for insert
  to anon, authenticated
  with check (true);

create policy "email_consents_update_all"
  on public.email_consents for update
  to anon, authenticated
  using (true)
  with check (true);

create policy "email_consents_delete_all"
  on public.email_consents for delete
  to anon, authenticated
  using (true);

notify pgrst, 'reload schema';
