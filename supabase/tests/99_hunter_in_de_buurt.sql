-- Tests voor de waarschuwing "Hunter in de buurt" (migratie 20261121300000).
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
  ('fb000000-0000-0000-0000-000000000001', false),  -- beheerder
  ('fb000000-0000-0000-0000-000000000002', true),   -- team Vossen
  ('fb000000-0000-0000-0000-000000000003', true),   -- spelleider Piet
  ('fb000000-0000-0000-0000-000000000004', true),   -- team Dassen
  ('fb000000-0000-0000-0000-000000000005', true);   -- team in een spel zonder waarschuwing

select tests.login('fb000000-0000-0000-0000-000000000001');
select stub.create_organization('Hunters in de buurt BV') as org \gset
insert into public.games (id, org_id, layer, slug, languages, default_language)
values ('6fb00000-0000-0000-0000-000000000001', :'org', 'base', 'hunter-buurt', array['nl'], 'nl');
reset role;
-- Versie 1 zonder instelling (standaard 100 m), versie 2 met de waarschuwing uit.
insert into public.game_versions (id, game_id, version, package) values
  ('7fb00000-0000-0000-0000-000000000001', '6fb00000-0000-0000-0000-000000000001', 1, '{"languages":["nl"]}'),
  ('7fb00000-0000-0000-0000-000000000002', '6fb00000-0000-0000-0000-000000000001', 2, '{"languages":["nl"],"hunterAlert":{"radius":0}}');
select tests.login('fb000000-0000-0000-0000-000000000001');
insert into public.sessions (id, org_id, game_version_id, name, join_code, status) values
  ('5fb00000-0000-0000-0000-000000000001', :'org', '7fb00000-0000-0000-0000-000000000001', 'Jacht', 'BUURT', 'open'),
  ('5fb00000-0000-0000-0000-000000000002', :'org', '7fb00000-0000-0000-0000-000000000002', 'Zonder', 'ZONDR', 'open');
select public.leader_code('5fb00000-0000-0000-0000-000000000001') as code \gset
select set_config('tests.code', :'code', false);

-- Twee teams in de hunt en een in de hunt zonder waarschuwing.
select tests.login('fb000000-0000-0000-0000-000000000002');
select (public.join_session('BUURT', 'Vossen', 'nl', '0612345678')).id as vossen \gset
select set_config('tests.vossen', :'vossen', false);
select tests.login('fb000000-0000-0000-0000-000000000004');
select (public.join_session('BUURT', 'Dassen', 'nl', '0612345679')).id as dassen \gset
select set_config('tests.dassen', :'dassen', false);
select tests.login('fb000000-0000-0000-0000-000000000005');
select (public.join_session('ZONDR', 'Uilen', 'nl', '0612345670')).id as uilen \gset
select set_config('tests.uilen', :'uilen', false);

-- Piet logt in als spelleider en staat op de Nieuwestad in Leeuwarden.
select tests.login('fb000000-0000-0000-0000-000000000003');
do $$ begin
  perform public.leader_join(current_setting('tests.code'), 'Piet');
  perform public.leader_position('5fb00000-0000-0000-0000-000000000001', 53.2010, 5.7960, 8);
end $$;

-- Vossen: nog niet gestart, daarna ~60 m van Piet.
select tests.login('fb000000-0000-0000-0000-000000000002');
do $$
declare
  v_team uuid := current_setting('tests.vossen')::uuid;
begin
  perform public.record_positions(v_team, jsonb_build_array(jsonb_build_object(
    'lat', 53.2015, 'lng', 5.7965, 'accuracy', 5, 'at', extract(epoch from now()) * 1000)));
  assert not public.hunter_nearby(v_team), 'niet gestart: geen waarschuwing';
  perform public.start_team(v_team);
  assert public.hunter_nearby(v_team), 'Hunter op ~65 m: waarschuwing';

  -- Een team van een ander mag niet vragen.
  begin
    perform public.hunter_nearby(current_setting('tests.dassen')::uuid);
    raise exception 'ander team gevraagd';
  exception when insufficient_privilege then null;
  end;

  -- Verder weg (~250 m): geen waarschuwing.
  perform public.record_positions(v_team, jsonb_build_array(jsonb_build_object(
    'lat', 53.2030, 'lng', 5.7990, 'accuracy', 5, 'at', extract(epoch from now()) * 1000 + 1000)));
  assert not public.hunter_nearby(v_team), 'Hunter op ~300 m: geen waarschuwing';
end $$;

-- Dassen: gestart, maar hun laatste positie is oud.
select tests.login('fb000000-0000-0000-0000-000000000004');
do $$
declare
  v_team uuid := current_setting('tests.dassen')::uuid;
begin
  perform public.start_team(v_team);
  assert not public.hunter_nearby(v_team), 'zonder positie geen waarschuwing';
  perform public.record_positions(v_team, jsonb_build_array(jsonb_build_object(
    'lat', 53.2011, 'lng', 5.7961, 'accuracy', 5, 'at', extract(epoch from now() - interval '5 minutes') * 1000)));
  assert not public.hunter_nearby(v_team), 'oude positie van het team telt niet';
  perform public.record_positions(v_team, jsonb_build_array(jsonb_build_object(
    'lat', 53.2011, 'lng', 5.7961, 'accuracy', 5, 'at', extract(epoch from now()) * 1000)));
  assert public.hunter_nearby(v_team), 'verse positie naast Piet';
end $$;

-- Oude positie van de Hunter telt niet; onnauwkeurige ook niet.
reset role;
update public.session_leaders set located_at = now() - interval '5 minutes';
select tests.login('fb000000-0000-0000-0000-000000000004');
do $$ begin
  assert not public.hunter_nearby(current_setting('tests.dassen')::uuid), 'Hunter al minuten niet gezien';
end $$;
reset role;
update public.session_leaders set located_at = now(), accuracy = 200;
select tests.login('fb000000-0000-0000-0000-000000000004');
do $$ begin
  assert not public.hunter_nearby(current_setting('tests.dassen')::uuid), 'Hunter met slechte GPS';
end $$;
reset role;
update public.session_leaders set accuracy = 10;

-- Afgelopen team: geen waarschuwing meer.
update public.teams set ended_at = now() where id = current_setting('tests.dassen')::uuid;
select tests.login('fb000000-0000-0000-0000-000000000004');
do $$ begin
  assert not public.hunter_nearby(current_setting('tests.dassen')::uuid), 'team is klaar';
end $$;

-- Spel met de waarschuwing uit (radius 0), ook al staat er een Hunter naast.
reset role;
insert into public.session_leaders (session_id, user_id, name, lat, lng, accuracy, located_at)
values ('5fb00000-0000-0000-0000-000000000002', 'fb000000-0000-0000-0000-000000000003', 'Piet', 53.2010, 5.7960, 5, now());
select tests.login('fb000000-0000-0000-0000-000000000005');
do $$
declare
  v_team uuid := current_setting('tests.uilen')::uuid;
begin
  perform public.start_team(v_team);
  perform public.record_positions(v_team, jsonb_build_array(jsonb_build_object(
    'lat', 53.2010, 'lng', 5.7960, 'accuracy', 5, 'at', extract(epoch from now()) * 1000)));
  assert not public.hunter_nearby(v_team), 'waarschuwing uit in dit spel';
end $$;

\echo Alle tests voor Hunter in de buurt geslaagd
rollback;
