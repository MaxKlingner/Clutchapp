-- CLUTCH: push notifications (Expo Push Token + triggers pg_net)

create extension if not exists pg_net;

-- Tokens sur user_profiles (parent + tutor app) et profiles (catalogue tuteur)
alter table public.user_profiles
  add column if not exists expo_push_token text;

alter table public.profiles
  add column if not exists expo_push_token text;

create index if not exists user_profiles_push_token_idx
  on public.user_profiles (expo_push_token)
  where expo_push_token is not null;

create index if not exists profiles_push_token_idx
  on public.profiles (expo_push_token)
  where expo_push_token is not null;

-- Helper : envoie une notif Expo Push
create or replace function public.send_expo_push(
  p_token text,
  p_title text,
  p_body text,
  p_data jsonb default '{}'::jsonb
)
returns bigint
language plpgsql
security definer
as $$
declare
  request_id bigint;
begin
  if p_token is null or length(trim(p_token)) = 0 then
    return null;
  end if;

  select net.http_post(
    url := 'https://exp.host/--/api/v2/push/send',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Accept', 'application/json'
    ),
    body := jsonb_build_object(
      'to', p_token,
      'title', coalesce(p_title, 'CLUTCH'),
      'body', coalesce(p_body, ''),
      'sound', 'default',
      'data', coalesce(p_data, '{}'::jsonb)
    )
  ) into request_id;

  return request_id;
end;
$$;

-- Nouveau message → notif au destinataire
create or replace function public.notify_on_new_message()
returns trigger
language plpgsql
security definer
as $$
declare
  v_recipient_clerk text;
  v_token text;
  v_sender_name text;
  v_body text;
begin
  select
    case
      when NEW.sender_role = 'parent' then tutor_profile.clerk_id
      else m.parent_id
    end,
    case
      when NEW.sender_role = 'parent' then coalesce(sender_up.full_name, 'Un parent')
      else coalesce(tutor_profile.full_name, sender_up.full_name, 'Un tuteur')
    end
  into v_recipient_clerk, v_sender_name
  from public.matches m
  left join public.profiles tutor_profile on tutor_profile.id = m.tutor_id
  left join public.user_profiles sender_up on sender_up.clerk_id = NEW.sender_id
  where m.id = NEW.match_id;

  if v_recipient_clerk is null or v_recipient_clerk = NEW.sender_id then
    return NEW;
  end if;

  select coalesce(up.expo_push_token, pr.expo_push_token)
  into v_token
  from (select v_recipient_clerk as clerk_id) r
  left join public.user_profiles up on up.clerk_id = r.clerk_id
  left join public.profiles pr on pr.clerk_id = r.clerk_id;

  if v_token is null then
    return NEW;
  end if;

  v_body := left(coalesce(NEW.content, 'Nouveau message'), 120);

  perform public.send_expo_push(
    v_token,
    'Nouveau message de ' || coalesce(v_sender_name, 'CLUTCH'),
    v_body,
    jsonb_build_object(
      'type', 'message',
      'matchId', NEW.match_id,
      'messageId', NEW.id
    )
  );

  return NEW;
end;
$$;

drop trigger if exists trg_notify_on_new_message on public.messages;
create trigger trg_notify_on_new_message
  after insert on public.messages
  for each row
  execute function public.notify_on_new_message();

-- Nouveau match → notif au tuteur
create or replace function public.notify_on_new_match()
returns trigger
language plpgsql
security definer
as $$
declare
  v_token text;
  v_parent_name text;
begin
  select coalesce(pr.expo_push_token, up.expo_push_token)
  into v_token
  from public.profiles pr
  left join public.user_profiles up on up.clerk_id = pr.clerk_id
  where pr.id = NEW.tutor_id;

  if v_token is null then
    return NEW;
  end if;

  select coalesce(full_name, 'Un parent')
  into v_parent_name
  from public.user_profiles
  where clerk_id = NEW.parent_id;

  perform public.send_expo_push(
    v_token,
    'Nouveau match',
    coalesce(v_parent_name, 'Un parent') || ' souhaite te contacter sur CLUTCH.',
    jsonb_build_object(
      'type', 'match',
      'matchId', NEW.id,
      'parentId', NEW.parent_id
    )
  );

  return NEW;
end;
$$;

drop trigger if exists trg_notify_on_new_match on public.matches;
create trigger trg_notify_on_new_match
  after insert on public.matches
  for each row
  execute function public.notify_on_new_match();

notify pgrst, 'reload schema';
