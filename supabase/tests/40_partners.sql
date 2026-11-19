-- Tests voor partners in het buitenland en tijdzones.
\set ON_ERROR_STOP on
begin;

create schema tests;
create function tests.login(p_user uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', p_user::text, true);
  perform set_config('role', 'authenticated', true);
end $$;
grant usage on schema tests to authenticated;
grant execute on all functions in schema tests to authenticated;

-- Badass Games (eigenaar), partner in Spanje, partner in Italië
insert into auth.users (id) values
  ('a0000000-0000-0000-0000-000000000001'), ('e5000000-0000-0000-0000-000000000001'), ('17000000-0000-0000-0000-000000000001');
insert into public.organizations (id, name, is_platform) values
  ('0a000000-0000-0000-0000-00000000000a', 'Badass Games', true),
  ('0e500000-0000-0000-0000-00000000000e', 'Partner Madrid', true),
  ('01700000-0000-0000-0000-000000000017', 'Partner Roma', true);
insert into public.memberships values
  ('0a000000-0000-0000-0000-00000000000a', 'a0000000-0000-0000-0000-000000000001', 'owner'),
  ('0e500000-0000-0000-0000-00000000000e', 'e5000000-0000-0000-0000-000000000001', 'admin'),
  ('01700000-0000-0000-0000-000000000017', '17000000-0000-0000-0000-000000000001', 'admin');
insert into public.games (id, org_id, layer, slug, languages) values
  ('6a000000-0000-0000-0000-000000000001', '0a000000-0000-0000-0000-00000000000a', 'base', 'the-hunt', array['nl','en','es','it']);
insert into public.games (id, org_id, parent_id, layer, slug) values
  ('6a000000-0000-0000-0000-000000000002', '0a000000-0000-0000-0000-00000000000a', '6a000000-0000-0000-0000-000000000001', 'city', 'the-hunt-leeuwarden');
insert into public.tasks (id, game_id, key) values
  ('7a500000-0000-0000-0000-000000000001', '6a000000-0000-0000-0000-000000000001', 'puzzel-tangram'),
  ('7a500000-0000-0000-0000-000000000002', '6a000000-0000-0000-0000-000000000001', 'puzzel-morse');
-- Een klant mag de morsecode-puzzel aanpassen (bijvoorbeeld de bedrijfsnaam als antwoord).
insert into public.overridable_fields (game_id, task_id, field, layers) values
  ('6a000000-0000-0000-0000-000000000001', '7a500000-0000-0000-0000-000000000002', 'answer', array['client']::public.game_layer[]),
  ('6a000000-0000-0000-0000-000000000001', '7a500000-0000-0000-0000-000000000002', 'body', array['client']::public.game_layer[]),
  ('6a000000-0000-0000-0000-000000000001', null, 'mapOverlay', array['city']::public.game_layer[]);

-- Badass Games maakt de stad Madrid (locaties, overlay) en deelt die met de partner.
select tests.login('a0000000-0000-0000-0000-000000000001');
insert into public.games (id, org_id, parent_id, layer, slug) values
  ('6a000000-0000-0000-0000-000000000003', '0a000000-0000-0000-0000-00000000000a', '6a000000-0000-0000-0000-000000000001', 'city', 'the-hunt-madrid');
insert into public.task_locations (game_id, task_id, lat, lng, radius) values
  ('6a000000-0000-0000-0000-000000000003', '7a500000-0000-0000-0000-000000000001', 40.4168, -3.7038, 25);
insert into public.overrides (game_id, field, value) values
  ('6a000000-0000-0000-0000-000000000003', 'mapOverlay', '{"image":"madrid.png"}');
insert into public.game_shares (game_id, org_id) values ('6a000000-0000-0000-0000-000000000003', '0e500000-0000-0000-0000-00000000000e');
do $$ begin
  begin
    insert into public.tasks (game_id, key) values ('6a000000-0000-0000-0000-000000000003', 'extra');
    raise exception 'opdracht toegevoegd in een stadsvariant';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.overrides (game_id, task_id, field, value)
    values ('6a000000-0000-0000-0000-000000000003', '7a500000-0000-0000-0000-000000000001', 'points', '500');
    raise exception 'niet-aanpasbaar veld aangepast';
  exception when insufficient_privilege then null;
  end;
end $$;

select tests.login('e5000000-0000-0000-0000-000000000001');
do $$
declare v_klant uuid; v_kopie uuid;
begin
  assert (select count(*) from public.games) = 2, 'partner ziet Madrid en het basisspel eronder, niet Leeuwarden';
  assert (select count(*) from public.tasks) = 2, 'partner leest de opdrachten van het basisspel';
  assert (select count(*) from public.task_locations) = 1, 'partner ziet de locaties van Madrid';

  -- Niets wijzigen aan het spel zelf
  update public.tasks set points = 9999;
  assert (select sum(points) from public.tasks) = 0, 'partner kan het basisspel niet wijzigen';
  update public.task_locations set radius = 500;
  assert (select radius from public.task_locations) = 25, 'partner kan de locaties niet verplaatsen';
  update public.overrides set value = '{"image":"eigen.png"}';
  assert (select value->>'image' from public.overrides) = 'madrid.png', 'partner kan de overlay niet wijzigen';
  begin
    insert into public.game_shares (game_id, org_id) values ('6a000000-0000-0000-0000-000000000003', '01700000-0000-0000-0000-000000000017');
    raise exception 'partner kon het spel doordelen';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.games (org_id, parent_id, layer, slug)
    values ('0e500000-0000-0000-0000-00000000000e', '6a000000-0000-0000-0000-000000000001', 'city', 'eigen-stad');
    raise exception 'partner maakte een eigen stadsvariant';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.games (org_id, parent_id, layer, slug)
    values ('0e500000-0000-0000-0000-00000000000e', '6a000000-0000-0000-0000-000000000001', 'client', 'klant-op-basis');
    raise exception 'partner bouwde voort op een spel dat niet met hem is gedeeld';
  exception when insufficient_privilege then null;
  end;

  -- Optioneel: een klantvariant met alleen de aanpasbare velden
  v_klant := public.create_client_variant('0e500000-0000-0000-0000-00000000000e', '6a000000-0000-0000-0000-000000000003', 'telefonica');
  insert into public.overrides (game_id, task_id, field, value)
  values (v_klant, '7a500000-0000-0000-0000-000000000002', 'answer', '{"type":"text","accepted":["telefonica"]}');
  insert into public.translations (game_id, entity, entity_id, field, lang, text)
  values (v_klant, 'task', 'puzzel-morse', 'body', 'es', 'Descifra el código');
  begin
    insert into public.overrides (game_id, task_id, field, value)
    values (v_klant, '7a500000-0000-0000-0000-000000000001', 'points', '500');
    raise exception 'klantvariant paste een vast veld aan';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.overrides (game_id, field, value) values (v_klant, 'mapOverlay', '{"image":"eigen.png"}');
    raise exception 'klantvariant paste de overlay aan';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.translations (game_id, entity, entity_id, field, lang, text)
    values (v_klant, 'task', 'puzzel-tangram', 'title', 'es', 'Otro');
    raise exception 'klantvariant paste een vaste tekst aan';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.task_locations (game_id, task_id, lat, lng, radius)
    values (v_klant, '7a500000-0000-0000-0000-000000000001', 40.5, -3.7, 25);
    raise exception 'klantvariant verplaatste een locatie';
  exception when insufficient_privilege then null;
  end;

  -- Kopiëren: neemt alleen de aanpassingen mee
  v_kopie := public.create_client_variant('0e500000-0000-0000-0000-00000000000e', '6a000000-0000-0000-0000-000000000003', 'telefonica-2027', v_klant);
  assert (select count(*) from public.overrides where game_id = v_kopie) = 1, 'aanpassing gekopieerd';
  assert (select count(*) from public.translations where game_id = v_kopie) = 1, 'tekst gekopieerd';
end $$;

select tests.login('17000000-0000-0000-0000-000000000001');
do $$ begin
  assert (select count(*) from public.games) = 0, 'partner zonder deling ziet niets';
  begin
    insert into public.games (org_id, parent_id, layer, slug)
    values ('01700000-0000-0000-0000-000000000017', '6a000000-0000-0000-0000-000000000003', 'client', 'roma-klant');
    raise exception 'partner bouwde voort op een niet-gedeeld spel';
  exception when insufficient_privilege then null;
  end;
end $$;

-- Badass Games ziet de klantvarianten van de partner niet (eigen beheer per partner)
select tests.login('a0000000-0000-0000-0000-000000000001');
do $$ begin
  assert (select count(*) from public.games) = 3, 'eigenaar ziet basisspel, Leeuwarden en Madrid';
end $$;

-- De partner speelt Madrid met eigen spelleiding en ziet de resultaten:
-- live posities, afstand, punten en foto's.
reset role;
insert into public.game_versions (id, game_id, version, package) values
  ('7a000000-0000-0000-0000-000000000003', '6a000000-0000-0000-0000-000000000003', 1, '{"languages":["es"]}');
select tests.login('17000000-0000-0000-0000-000000000001');
do $$ begin
  insert into public.sessions (org_id, game_version_id, name, join_code)
  values ('01700000-0000-0000-0000-000000000017', '7a000000-0000-0000-0000-000000000003', 'Gesnapt', 'ROM001');
  raise exception 'partner startte een sessie op een niet-gedeeld spel';
exception when insufficient_privilege then null;
end $$;
select tests.login('e5000000-0000-0000-0000-000000000001');
insert into public.sessions (id, org_id, game_version_id, name, join_code, timezone) values
  ('5e500000-0000-0000-0000-000000000001', '0e500000-0000-0000-0000-00000000000e', '7a000000-0000-0000-0000-000000000003', 'Madrid vrijdag', 'MAD001', 'Europe/Madrid');
reset role;
insert into public.teams (id, session_id, name, language, login_order, track, team_code, started_at) values
  ('7e500000-0000-0000-0000-000000000001', '5e500000-0000-0000-0000-000000000001', 'Los Tigres', 'es', 1, 1, 'TIGRES', now() - interval '40 minutes');
insert into public.positions (team_id, lat, lng, accuracy, recorded_at) values
  ('7e500000-0000-0000-0000-000000000001', 40.4168, -3.7038, 5, now() - interval '30 minutes'),
  ('7e500000-0000-0000-0000-000000000001', 40.4178, -3.7038, 5, now() - interval '29 minutes');
insert into public.photos (team_id, task_key, path) values
  ('7e500000-0000-0000-0000-000000000001', 'fotomissie', '7e500000-0000-0000-0000-000000000001/fotomissie/1.jpg');
select tests.login('e5000000-0000-0000-0000-000000000001');
do $$
declare r jsonb;
begin
  assert (select count(*) from public.positions) = 2, 'spelleiding van de partner ziet de live posities';
  r := public.session_results('5e500000-0000-0000-0000-000000000001');
  assert (r #>> '{teams,0,distance_m}')::numeric between 100 and 120, 'afstand gelopen';
  assert jsonb_array_length(r #> '{teams,0,photos}') = 1, 'foto in de fotowall';
end $$;
-- Badass Games ziet de sessie van de partner (het is hun spel), voor het
-- fotoboek, maar kan er niets in wijzigen.
select tests.login('a0000000-0000-0000-0000-000000000001');
do $$
declare r jsonb;
begin
  assert (select count(*) from public.sessions where join_code = 'MAD001') = 1, 'Badass Games ziet de sessie van de partner';
  assert (select count(*) from public.positions) = 2, 'Badass Games ziet de live posities';
  assert (select count(*) from public.photos) = 1, 'Badass Games ziet de foto''s';
  r := public.session_results('5e500000-0000-0000-0000-000000000001');
  assert jsonb_array_length(r #> '{teams,0,photos}') = 1, 'resultaten met fotowall';
  update public.teams set score = 9999;
  update public.sessions set name = 'Gekaapt';
  assert (select score from public.teams) = 0, 'Badass Games wijzigt geen teams van de partner';
  assert (select name from public.sessions where join_code = 'MAD001') = 'Madrid vrijdag', 'Badass Games wijzigt de sessie niet';
end $$;

-- Een andere partner ziet de sessie niet.
select tests.login('17000000-0000-0000-0000-000000000001');
do $$ begin
  assert (select count(*) from public.sessions) = 0, 'andere partner ziet de sessie niet';
  assert (select count(*) from public.positions) = 0, 'andere partner ziet geen posities';
  begin
    perform public.session_results('5e500000-0000-0000-0000-000000000001');
    raise exception 'andere partner kreeg resultaten';
  exception when insufficient_privilege then null;
  end;
end $$;

-- Tijdzone per sessie
reset role;
insert into public.game_versions (id, game_id, version, package) values
  ('7a000000-0000-0000-0000-000000000001', '6a000000-0000-0000-0000-000000000002', 1, '{"languages":["nl"]}');
insert into public.sessions (org_id, game_version_id, name, join_code, timezone)
values ('0a000000-0000-0000-0000-00000000000a', '7a000000-0000-0000-0000-000000000001', 'Lissabon', 'LIS001', 'Europe/Lisbon');
do $$ begin
  assert (select timezone from public.sessions where join_code = 'LIS001') = 'Europe/Lisbon', 'tijdzone opgeslagen';
  begin
    insert into public.sessions (org_id, game_version_id, name, join_code, timezone)
    values ('0a000000-0000-0000-0000-00000000000a', '7a000000-0000-0000-0000-000000000001', 'Fout', 'BAD001', 'Europe/Atlantis');
    raise exception 'onbekende tijdzone werd geaccepteerd';
  exception when check_violation then null;
  end;
  assert public.build_session_results((select id from public.sessions where join_code = 'LIS001')) #>> '{session,timezone}' = 'Europe/Lisbon',
    'resultaten vermelden de tijdzone';
end $$;

\echo 'Alle partner-tests geslaagd'
rollback;
