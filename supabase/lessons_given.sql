-- CLUTCH: nombre de cours donnés, incrémenté à chaque paiement validé

alter table public.profiles
  add column if not exists lessons_given integer not null default 0;

-- Valeurs de départ des tuteurs fictifs (environ 4 cours par avis).
update public.profiles set lessons_given = 48
where role = 'tutor' and full_name = 'Adam Rossi' and coalesce(clerk_id, '') = '';
update public.profiles set lessons_given = 24
where role = 'tutor' and full_name = 'Camille Dupont' and coalesce(clerk_id, '') = '';
update public.profiles set lessons_given = 4
where role = 'tutor' and full_name = 'Chloé Renard' and coalesce(clerk_id, '') = '';
update public.profiles set lessons_given = 12
where role = 'tutor' and full_name = 'Hugo Lambert' and coalesce(clerk_id, '') = '';
update public.profiles set lessons_given = 32
where role = 'tutor' and full_name = 'Inès Petit' and coalesce(clerk_id, '') = '';
update public.profiles set lessons_given = 16
where role = 'tutor' and full_name = 'Léa Bernard' and coalesce(clerk_id, '') = '';
update public.profiles set lessons_given = 0
where role = 'tutor' and full_name = 'Lucas Martin' and coalesce(clerk_id, '') = '';
update public.profiles set lessons_given = 0
where role = 'tutor' and full_name = 'Nina Moreau' and coalesce(clerk_id, '') = '';
update public.profiles set lessons_given = 60
where role = 'tutor' and full_name = 'Sofia Benali' and coalesce(clerk_id, '') = '';
update public.profiles set lessons_given = 0
where role = 'tutor' and full_name = 'Thomas Leroy' and coalesce(clerk_id, '') = '';

create or replace function public.bump_lessons_given()
returns trigger
language plpgsql
security definer
as $$
begin
  if new.status = 'completed'
     and new.tutor_clerk_id is not null
     and (tg_op = 'INSERT' or old.status is distinct from 'completed') then
    update public.profiles
    set lessons_given = lessons_given + 1
    where id = (
      select id
      from public.profiles
      where clerk_id = new.tutor_clerk_id
      order by created_at asc
      limit 1
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_bump_lessons_given on public.payment_transactions;
create trigger trg_bump_lessons_given
  after insert or update of status on public.payment_transactions
  for each row
  execute function public.bump_lessons_given();

notify pgrst, 'reload schema';

select full_name, lessons_given
from public.profiles
where role = 'tutor'
order by full_name;
