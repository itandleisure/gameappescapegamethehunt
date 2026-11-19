-- Tests voor lopende hunts live bijwerken naar een nieuwe versie van het spel.
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

insert into auth.users (id, is_anonymous) values
  ('f4000000-0000-0000-0000-000000000001', false),
  ('f4000000-0000-0000-0000-000000000002', false);

-- Een buitenstaander met een eigen organisatie.
select tests.login('f4000000-0000-0000-0000-000000000002');
select stub.create_organization('Ander BV') as other \gset

select tests.login('f4000000-0000-0000-0000-000000000001');
select stub.create_organization('Live BV') as org \gset
insert into public.games (id, org_id, layer, slug, languages, default_language, settings) values
  ('6f400000-0000-0000-0000-000000000001', :'org', 'base', 'live-spel', array['nl'], 'nl', '{}'),
  ('6f400000-0000-0000-0000-000000000003', :'org', 'base', 'ander-spel', array['nl'], 'nl', '{}');
insert into public.games (id, org_id, parent_id, layer, slug, languages, default_language, settings) values
  ('6f400000-0000-0000-0000-000000000002', :'org', '6f400000-0000-0000-0000-000000000001', 'city', 'live-stad', array['nl'], 'nl', '{}');

select (public.publish_game_version('6f400000-0000-0000-0000-000000000002', '{"languages":["nl"],"defaultLanguage":"nl","tasks":[]}')).id as v1 \gset
select (public.publish_game_version('6f400000-0000-0000-0000-000000000003', '{"languages":["nl"],"defaultLanguage":"nl","tasks":[]}')).id as vander \gset

insert into public.sessions (id, org_id, game_version_id, name, join_code, status) values
  ('5f400000-0000-0000-0000-000000000001', :'org', :'v1', 'Lopend', 'LIVE1', 'open'),
  ('5f400000-0000-0000-0000-000000000002', :'org', :'v1', 'Gepland', 'LIVE2', 'draft'),
  ('5f400000-0000-0000-0000-000000000003', :'org', :'v1', 'Afgelopen', 'LIVE3', 'closed'),
  ('5f400000-0000-0000-0000-000000000004', :'org', :'vander', 'Ander spel', 'LIVE4', 'open');
reset role;
insert into public.teams (id, session_id, name, language, login_order, track, team_code, started_at) values
  ('7f400000-0000-0000-0000-000000000001', '5f400000-0000-0000-0000-000000000001', 'Speelt', 'nl', 1, 1, 'LIVE-EEN', now()),
  ('7f400000-0000-0000-0000-000000000002', '5f400000-0000-0000-0000-000000000001', 'Nog niet', 'nl', 2, 2, 'LIVE-TWEE', null);
select tests.login('f4000000-0000-0000-0000-000000000001');

-- Nieuwe versie met de fout hersteld.
select (public.publish_game_version('6f400000-0000-0000-0000-000000000002', '{"languages":["nl"],"defaultLanguage":"nl","tasks":[]}')).id as v2 \gset

do $$
declare
  v_summary jsonb;
  v_count integer;
  v_v2 uuid := (select id from public.game_versions where game_id = '6f400000-0000-0000-0000-000000000002' and version = 2);
begin
  -- Publiceren zet het tijdstip in het spelpakket.
  assert (select (package ->> 'publishedAt')::bigint from public.game_versions where id = v_v2)
         between (extract(epoch from now()) * 1000)::bigint - 60000 and (extract(epoch from clock_timestamp()) * 1000)::bigint + 1000,
         'publishedAt gezet';
  assert (select (package ->> 'version')::int from public.game_versions where id = v_v2) = 2, 'versienummer in pakket';

  -- Overzicht (voor de vraag bij publiceren): twee open hunts (lopend en gepland), één team speelt.
  v_summary := public.live_sessions_summary('6f400000-0000-0000-0000-000000000002');
  assert (v_summary ->> 'sessions')::int = 2, format('aantal hunts: %s', v_summary);
  assert (v_summary ->> 'teams')::int = 1, format('aantal teams: %s', v_summary);

  -- Bijwerken: alleen de open hunts van dit spel.
  v_count := public.update_live_sessions(v_v2);
  assert v_count = 2, format('bijgewerkt: %s', v_count);
  assert (select game_version_id from public.sessions where join_code = 'LIVE1') = v_v2, 'lopende hunt bijgewerkt';
  assert (select game_version_id from public.sessions where join_code = 'LIVE2') = v_v2, 'geplande hunt bijgewerkt';
  assert (select game_updated_at from public.sessions where join_code = 'LIVE1') is not null, 'tijdstip bijgewerkt';
  assert (select game_version_id from public.sessions where join_code = 'LIVE3') <> v_v2, 'afgelopen hunt houdt zijn versie';
  assert (select game_version_id from public.sessions where join_code = 'LIVE4') <> v_v2, 'ander spel blijft';

  -- Nog een keer: niets meer te doen, en een oudere versie zet niets terug.
  assert public.update_live_sessions(v_v2) = 0, 'tweede keer niets';
  assert public.update_live_sessions((select id from public.game_versions where game_id = '6f400000-0000-0000-0000-000000000002' and version = 1)) = 0, 'niet terug naar oud';
  -- Het overzicht telt de hunts die een volgende publicatie zou bijwerken: nog steeds deze twee.
  assert (public.live_sessions_summary('6f400000-0000-0000-0000-000000000002') ->> 'sessions')::int = 2, 'overzicht na bijwerken';
end $$;

-- Het team in de hunt ziet de nieuwe versie (en mag het spelpakket lezen).
reset role;
insert into auth.users (id, is_anonymous) values ('f4000000-0000-0000-0000-000000000009', true);
insert into public.team_members (team_id, user_id) values ('7f400000-0000-0000-0000-000000000001', 'f4000000-0000-0000-0000-000000000009');
select tests.login('f4000000-0000-0000-0000-000000000009');
do $$ begin
  assert (select v.version from public.sessions s join public.game_versions v on v.id = s.game_version_id where s.join_code = 'LIVE1') = 2, 'speler ziet versie 2';
end $$;

-- Een buitenstaander kan niets bijwerken of opvragen.
select tests.login('f4000000-0000-0000-0000-000000000002');
do $$ begin
  begin
    perform public.update_live_sessions((select id from public.game_versions where version = 2 limit 1));
    raise exception 'buitenstaander kon bijwerken';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.live_sessions_summary('6f400000-0000-0000-0000-000000000002');
    raise exception 'buitenstaander kon overzicht zien';
  exception when insufficient_privilege then null;
  end;
end $$;

\echo Alle tests voor live bijwerken geslaagd
rollback;
