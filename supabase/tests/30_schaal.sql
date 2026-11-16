-- Tests voor GPS-bundels en opslag per aanbieder.
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

insert into auth.users (id) values ('c0000000-0000-0000-0000-000000000001'), ('c0000000-0000-0000-0000-000000000002');
insert into public.organizations (id, name) values ('0a000000-0000-0000-0000-00000000000a', 'Badass Games');
insert into public.games (id, org_id, layer, slug) values ('6a000000-0000-0000-0000-000000000001', '0a000000-0000-0000-0000-00000000000a', 'base', 'the-hunt');
insert into public.game_versions (id, game_id, version, package) values
  ('7a000000-0000-0000-0000-000000000001', '6a000000-0000-0000-0000-000000000001', 1, '{"languages":["nl"]}');
insert into public.sessions (id, org_id, game_version_id, name, join_code, status) values
  ('5a000000-0000-0000-0000-000000000001', '0a000000-0000-0000-0000-00000000000a', '7a000000-0000-0000-0000-000000000001', 'Leeuwarden', 'HUNT01', 'open');

select tests.login('c0000000-0000-0000-0000-000000000002');
select (public.join_session('HUNT01', 'Wolven', 'nl')).id as team2 \gset
select tests.login('c0000000-0000-0000-0000-000000000001');
select (public.join_session('HUNT01', 'Vossen', 'nl')).id as team1 \gset
select set_config('tests.team1', :'team1', true), set_config('tests.team2', :'team2', true);

do $$
declare
  t1 uuid := current_setting('tests.team1')::uuid;
  t2 uuid := current_setting('tests.team2')::uuid;
begin
  assert public.record_positions(t1, '[
    {"lat": 53.2037, "lng": 5.7895, "accuracy": 8, "at": 1795784400000},
    {"lat": 53.2038, "lng": 5.7895, "accuracy": 9, "at": 1795784420000},
    {"lat": 53.2039, "lng": 5.7895, "accuracy": 7, "at": 1795784440000}
  ]') = 3, 'bundel van drie posities';
  assert (select count(*) from public.positions where team_id = t1) = 3, 'posities opgeslagen';
  assert (select min(recorded_at) from public.positions) = to_timestamp(1795784400), 'tijd uit de app';
  begin
    perform public.record_positions(t2, '[{"lat": 1, "lng": 1, "accuracy": 5, "at": 1}]');
    raise exception 'team kon posities van een ander team opslaan';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.record_positions(t1, (select jsonb_agg(jsonb_build_object('lat', 1, 'lng', 1, 'accuracy', 5, 'at', n)) from generate_series(1, 201) n));
    raise exception 'te grote bundel werd geaccepteerd';
  exception when sqlstate '22023' then null;
  end;

  insert into public.photos (team_id, task_key, path) values (t1, 'fotomissie', t1 || '/fotomissie/1.jpg');
  assert public.session_results('5a000000-0000-0000-0000-000000000001') #>> '{teams,0,photos,0,provider}' = 'supabase'
      or public.session_results('5a000000-0000-0000-0000-000000000001') #>> '{teams,1,photos,0,provider}' = 'supabase',
    'resultaten vermelden de opslag van elke foto';
end $$;

\echo 'Alle schaal-tests geslaagd'
rollback;
