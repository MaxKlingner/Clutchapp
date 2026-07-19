-- CLUTCH: reset matches + messages pour retester le swipe
-- À exécuter dans Supabase → SQL Editor → Run

-- Vide les conversations et les matches
truncate table public.messages restart identity cascade;
truncate table public.matches restart identity cascade;

-- Autorise aussi les DELETE via l'API anon (pour les resets futurs)
drop policy if exists "Public can delete matches" on public.matches;
create policy "Public can delete matches"
  on public.matches for delete to anon, authenticated using (true);

drop policy if exists "Public can delete messages" on public.messages;
create policy "Public can delete messages"
  on public.messages for delete to anon, authenticated using (true);

notify pgrst, 'reload schema';
