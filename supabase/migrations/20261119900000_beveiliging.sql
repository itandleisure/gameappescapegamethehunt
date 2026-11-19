-- =============================================================================
-- Beveiliging aangescherpt (uitkomst van de security review, november 2026)
--
-- 1. Spelers lezen alleen nog hun eigen team. Voorheen zag elke speler alle
--    teams van de hunt, inclusief de teamcode. Met die code kon iedereen in de
--    hunt via rejoin_team() bij een ander team inloggen en diens antwoorden,
--    route en telefoonnummer zien, of namens dat team antwoorden insturen.
--    De speler-app leest alleen het eigen team; de ranglijst loopt via
--    session_results() (zonder teamcodes).
-- 2. build_session_results() en team_distance() zijn weer alleen intern.
--    De migratie "beheer" gaf per ongeluk alle functies opnieuw vrij, waardoor
--    elke (ook anonieme) gebruiker met een sessie-id de resultaten, teamnamen
--    en fotopaden van elke hunt kon opvragen, buiten session_results() om.
-- 3. Een team kan geen "manualOpen" meer insturen: die gebeurtenis is voor de
--    spelleiding en opent een opdracht zonder dat het team ter plekke is.
-- 4. Een team registreert alleen foto's uit de eigen map (<team_id>/…). Anders
--    kon een team een fotopad van een andere hunt opnemen, waarna de gedeelde
--    resultatenlink of het fotoboek er een geldige link naar maakte.
-- 5. De bucket photos accepteert alleen afbeeldingen tot 15 MB.
-- =============================================================================

-- 1. Teams: speler ziet alleen het eigen team.
drop policy teams_select_player on public.teams;
create policy teams_select_player on public.teams for select to authenticated
  using (public.is_team_member(id));

-- 2. Interne functies niet aanroepbaar van buitenaf.
revoke execute on function public.build_session_results(uuid) from public, anon, authenticated;
revoke execute on function public.team_distance(uuid, timestamptz, timestamptz) from public, anon, authenticated;

-- 3. Gebeurtenissen: manualOpen alleen door de spelleiding.
drop policy events_insert on public.events;
create policy events_insert on public.events for insert to authenticated with check (
  (public.is_team_member(team_id) and type <> 'manualOpen')
  or public.can_run_session(public.team_session(team_id))
);

-- 4. Foto's: pad moet in de map van het eigen team liggen.
drop policy photos_insert on public.photos;
create policy photos_insert on public.photos for insert to authenticated with check (
  public.is_team_member(team_id) and split_part(path, '/', 1) = team_id::text
);

-- 5. Bucket photos: alleen afbeeldingen, maximaal 15 MB per bestand.
do $$
begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'storage' and table_name = 'buckets' and column_name = 'file_size_limit') then
    update storage.buckets
       set file_size_limit = 15 * 1024 * 1024,
           allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/heic']
     where id = 'photos';
  end if;
end $$;
