-- Tests voor het verwijderen van een spel.
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
  ('d0000000-0000-0000-0000-000000000001', false),  -- redacteur
  ('d0000000-0000-0000-0000-000000000002', false);  -- buitenstaander

select tests.login('d0000000-0000-0000-0000-000000000001');
select stub.create_organization('Wis BV') as org \gset
insert into public.games (id, org_id, layer, slug, languages, default_language) values
  ('6d000000-0000-0000-0000-000000000001', :'org', 'base', 'test-spel', array['nl'], 'nl'),
  ('6d000000-0000-0000-0000-000000000002', :'org', 'base', 'echt-spel', array['nl'], 'nl');
insert into public.games (id, org_id, layer, parent_id, slug, languages, default_language) values
  ('6d000000-0000-0000-0000-000000000003', :'org', 'city', '6d000000-0000-0000-0000-000000000001', 'test-stad', array['nl'], 'nl');
insert into public.tasks (game_id, key, position, answer) values ('6d000000-0000-0000-0000-000000000001', 'start', 0, '{"type":"info"}');
reset role;
insert into public.game_versions (id, game_id, version, package) values
  ('7d000000-0000-0000-0000-000000000001', '6d000000-0000-0000-0000-000000000001', 1, '{"languages":["nl"]}'),
  ('7d000000-0000-0000-0000-000000000002', '6d000000-0000-0000-0000-000000000002', 1, '{"languages":["nl"]}');
insert into public.sessions (id, org_id, game_version_id, name, join_code, test_mode) values
  ('5d000000-0000-0000-0000-000000000001', :'org', '7d000000-0000-0000-0000-000000000001', 'Proef', 'WIS001', true),
  ('5d000000-0000-0000-0000-000000000002', :'org', '7d000000-0000-0000-0000-000000000002', 'Klant', 'WIS002', false);
insert into public.teams (session_id, name, language, login_order, track, team_code) values
  ('5d000000-0000-0000-0000-000000000001', 'Testers', 'nl', 1, 1, 'TESTER');

-- Een buitenstaander mag niets verwijderen.
select tests.login('d0000000-0000-0000-0000-000000000002');
do $$ begin
  perform public.delete_game('6d000000-0000-0000-0000-000000000001');
  raise exception 'buitenstaander kon verwijderen';
exception when insufficient_privilege then null;
end $$;

select tests.login('d0000000-0000-0000-0000-000000000001');
-- Eerst de stadsvariant, dan pas het basisspel.
do $$ begin
  perform public.delete_game('6d000000-0000-0000-0000-000000000001');
  raise exception 'basisspel met variant verwijderd';
exception when foreign_key_violation then null;
end $$;
select public.delete_game('6d000000-0000-0000-0000-000000000003');
select public.delete_game('6d000000-0000-0000-0000-000000000001');
-- Een spel met een echte sessie blijft staan.
do $$ begin
  perform public.delete_game('6d000000-0000-0000-0000-000000000002');
  raise exception 'spel met echte sessie verwijderd';
exception when foreign_key_violation then null;
end $$;

reset role;
do $$ begin
  assert not exists (select 1 from public.games where id = '6d000000-0000-0000-0000-000000000001'), 'spel is weg';
  assert not exists (select 1 from public.tasks where game_id = '6d000000-0000-0000-0000-000000000001'), 'opdrachten zijn weg';
  assert not exists (select 1 from public.sessions where id = '5d000000-0000-0000-0000-000000000001'), 'testsessie is weg';
  assert not exists (select 1 from public.teams where name = 'Testers'), 'testteam is weg';
  assert exists (select 1 from public.sessions where id = '5d000000-0000-0000-0000-000000000002'), 'echte sessie blijft';
end $$;

\echo Alle verwijder-tests geslaagd
rollback;
