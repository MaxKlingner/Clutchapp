-- CLUTCH: policies RLS ouvertes pour matches + messages (dev / Expo Go)
-- SELECT, INSERT, UPDATE, DELETE pour anon + authenticated

-- matches
alter table public.matches enable row level security;

drop policy if exists "Public can read matches" on public.matches;
drop policy if exists "Public can insert matches" on public.matches;
drop policy if exists "Public can delete matches" on public.matches;
drop policy if exists "Public can update matches" on public.matches;
drop policy if exists "matches_select_all" on public.matches;
drop policy if exists "matches_insert_all" on public.matches;
drop policy if exists "matches_update_all" on public.matches;
drop policy if exists "matches_delete_all" on public.matches;

create policy "matches_select_all"
  on public.matches for select
  to anon, authenticated
  using (true);

create policy "matches_insert_all"
  on public.matches for insert
  to anon, authenticated
  with check (true);

create policy "matches_update_all"
  on public.matches for update
  to anon, authenticated
  using (true)
  with check (true);

create policy "matches_delete_all"
  on public.matches for delete
  to anon, authenticated
  using (true);

-- messages
alter table public.messages enable row level security;

drop policy if exists "Public can read messages" on public.messages;
drop policy if exists "Public can insert messages" on public.messages;
drop policy if exists "Public can delete messages" on public.messages;
drop policy if exists "Public can update messages" on public.messages;
drop policy if exists "messages_select_all" on public.messages;
drop policy if exists "messages_insert_all" on public.messages;
drop policy if exists "messages_update_all" on public.messages;
drop policy if exists "messages_delete_all" on public.messages;

create policy "messages_select_all"
  on public.messages for select
  to anon, authenticated
  using (true);

create policy "messages_insert_all"
  on public.messages for insert
  to anon, authenticated
  with check (true);

create policy "messages_update_all"
  on public.messages for update
  to anon, authenticated
  using (true)
  with check (true);

create policy "messages_delete_all"
  on public.messages for delete
  to anon, authenticated
  using (true);

notify pgrst, 'reload schema';
