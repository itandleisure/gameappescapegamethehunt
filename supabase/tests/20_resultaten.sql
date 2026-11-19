-- Tests voor resultaten, afstand, foto-opslag en de deelbare link.
\set ON_ERROR_STOP on
begin;

create schema tests;
create function tests.login(p_user uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', p_user::text, true);
  perform set_config('role', 'authenticated', true);
end $$;
create function tests.logout() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('role', 'postgres', true);
end $$;
grant usage on schema tests to authenticated, anon;
grant execute on all functions in schema tests to authenticated, anon;

insert into auth.users (id) values
  ('a0000000-0000-0000-0000-000000000001'), ('b0000000-0000-0000-0000-000000000001'),
  ('c0000000-0000-0000-0000-000000000001'), ('c0000000-0000-0000-0000-000000000002'), ('c0000000-0000-0000-0000-000000000003');
insert into public.organizations (id, name, is_platform) values
  ('0a000000-0000-0000-0000-00000000000a', 'Badass Games', true), ('0b000000-0000-0000-0000-00000000000b', 'Ander', true);
insert into public.memberships values
  ('0a000000-0000-0000-0000-00000000000a', 'a0000000-0000-0000-0000-000000000001', 'instructor'),
  ('0b000000-0000-0000-0000-00000000000b', 'b0000000-0000-0000-0000-000000000001', 'owner');
insert into public.games (id, org_id, layer, slug) values ('6a000000-0000-0000-0000-000000000001', '0a000000-0000-0000-0000-00000000000a', 'base', 'the-hunt');
insert into public.game_versions (id, game_id, version, package) values
  ('7a000000-0000-0000-0000-000000000001', '6a000000-0000-0000-0000-000000000001', 1, '{"languages":["nl"]}');
insert into public.sessions (id, org_id, game_version_id, name, join_code, status) values
  ('5a000000-0000-0000-0000-000000000001', '0a000000-0000-0000-0000-00000000000a', '7a000000-0000-0000-0000-000000000001', 'Leeuwarden', 'HUNT01', 'open'),
  ('5a000000-0000-0000-0000-000000000002', '0a000000-0000-0000-0000-00000000000a', '7a000000-0000-0000-0000-000000000001', 'Andere sessie', 'HUNT02', 'open');

-- Twee teams en een speler in een andere sessie
select tests.login('c0000000-0000-0000-0000-000000000001');
select (public.join_session('HUNT01', 'Vossen', 'nl')).id as team1 \gset
select tests.login('c0000000-0000-0000-0000-000000000002');
select (public.join_session('HUNT01', 'Wolven', 'nl')).id as team2 \gset
select tests.login('c0000000-0000-0000-0000-000000000003');
select public.join_session('HUNT02', 'Elders', 'nl');
select tests.logout();

-- Speltijd, scores (die zet de server na het narekenen) en een gelopen route.
update public.teams set started_at = '2026-11-21 13:00+00', ended_at = '2026-11-21 14:03+00', score = 1900, outcome = 'ontsnapt' where id = :'team1';
update public.teams set started_at = '2026-11-21 13:00+00', ended_at = '2026-11-21 14:15+00', score = 1100, outcome = 'tijd-op' where id = :'team2';
-- Team 1: 0 → 100 m → 200 m noord, met ruis, een sprong en een onnauwkeurige meting
insert into public.positions (team_id, lat, lng, accuracy, recorded_at) values
  (:'team1', 53.2037000, 5.7895, 8,  '2026-11-21 13:01:00+00'),
  (:'team1', 53.2037180, 5.7895, 8,  '2026-11-21 13:01:10+00'),   -- 2 m: stilstaan
  (:'team1', 53.2117000, 5.7895, 8,  '2026-11-21 13:01:15+00'),   -- 890 m in 5 s: sprong
  (:'team1', 53.2047000, 5.7895, 50, '2026-11-21 13:02:00+00'),   -- onnauwkeurig
  (:'team1', 53.2045983, 5.7895, 8,  '2026-11-21 13:03:00+00'),   -- 100 m
  (:'team1', 53.2054966, 5.7895, 8,  '2026-11-21 13:05:00+00'),   -- 200 m
  (:'team1', 53.2154966, 5.7895, 8,  '2026-11-21 15:00:00+00');   -- na het einde: telt niet
insert into public.photos (team_id, task_key, path) values (:'team1', 'fotomissie', :'team1' || '/fotomissie/1.jpg');

do $$ begin
  assert public.team_distance((select id from public.teams where name = 'Vossen'),
    '2026-11-21 13:00+00', '2026-11-21 14:03+00') between 199 and 201, 'afstand volgens dezelfde regels als de engine';
end $$;

-- ---------------------------------------------------------------------------
-- Resultatenpagina
-- ---------------------------------------------------------------------------
select tests.login('a0000000-0000-0000-0000-000000000001');
do $$
declare
  r jsonb := public.session_results('5a000000-0000-0000-0000-000000000001');
begin
  assert jsonb_array_length(r -> 'teams') = 2, 'twee teams in de sessie';
  assert r #>> '{teams,0,name}' = 'Vossen' and (r #>> '{teams,0,rank}')::int = 1, 'hoogste score eerst';
  assert (r #>> '{teams,0,duration_seconds}')::int = 63 * 60, 'speeltijd in seconden';
  assert (r #>> '{teams,0,distance_m}')::int between 199 and 201, 'totaalafstand';
  assert r #>> '{teams,0,photos,0,task}' = 'fotomissie', 'foto van de fotomissie';
  assert r #>> '{session,organization}' = 'Badass Games', 'organisatie voor het logo';
end $$;

-- Spelers zien de ranglijst van hun eigen sessie, niet van een andere.
select tests.login('c0000000-0000-0000-0000-000000000002');
do $$ begin
  assert jsonb_array_length(public.session_results('5a000000-0000-0000-0000-000000000001') -> 'teams') = 2, 'speler ziet de ranglijst';
end $$;
select tests.login('c0000000-0000-0000-0000-000000000003');
do $$ begin
  perform public.session_results('5a000000-0000-0000-0000-000000000001');
  raise exception 'speler zag resultaten van een andere sessie';
exception when insufficient_privilege then null;
end $$;
select tests.login('b0000000-0000-0000-0000-000000000001');
do $$ begin
  perform public.session_results('5a000000-0000-0000-0000-000000000001');
  raise exception 'andere organisatie zag de resultaten';
exception when insufficient_privilege then null;
end $$;

-- ---------------------------------------------------------------------------
-- Foto-opslag
-- ---------------------------------------------------------------------------
select tests.login('c0000000-0000-0000-0000-000000000001');
insert into storage.objects (bucket_id, name) values ('photos', :'team1' || '/fotomissie/1.jpg');
do $$ begin
  begin
    insert into storage.objects (bucket_id, name)
    values ('photos', (select id from public.teams where name = 'Wolven') || '/fotomissie/nep.jpg');
    raise exception 'team kon een foto in de map van een ander team zetten';
  exception when insufficient_privilege then null;
  end;
end $$;
select tests.login('c0000000-0000-0000-0000-000000000003');
do $$ begin
  assert (select count(*) from storage.objects) = 0, 'speler uit andere sessie ziet de foto niet';
end $$;
select tests.login('a0000000-0000-0000-0000-000000000001');
do $$ begin
  assert (select count(*) from storage.objects) = 1, 'spelleiding ziet de foto';
end $$;

-- ---------------------------------------------------------------------------
-- Geheime link voor klant en fotoboek-export
-- ---------------------------------------------------------------------------
select tests.logout();
select results_token as token from public.sessions where join_code = 'HUNT01' \gset
select set_config('tests.token', :'token', true);
set local role anon;
do $$ begin
  perform public.shared_session_results(current_setting('tests.token'));
  raise exception 'resultaten waren zichtbaar zonder dat delen aan stond';
exception when sqlstate 'P0002' then null;
end $$;
reset role;
update public.sessions set results_shared = true where join_code = 'HUNT01';
set local role anon;
do $$ begin
  assert jsonb_array_length(public.shared_session_results(current_setting('tests.token')) -> 'teams') = 2,
    'via de link zijn de resultaten op te halen';
  begin
    perform public.shared_session_results('verkeerd-maar-wel-lang-genoeg-token');
    raise exception 'verkeerde link gaf resultaten';
  exception when sqlstate 'P0002' then null;
  end;
  begin
    perform public.team_distance(gen_random_uuid());
    raise exception 'anon kon interne functies aanroepen';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- Een spelleider maakt geen nieuwe link; een partner/beheerder wel.
select tests.login('a0000000-0000-0000-0000-000000000001');
do $$ begin
  begin
    perform public.rotate_results_token('5a000000-0000-0000-0000-000000000001');
    raise exception 'spelleider maakte een nieuwe link';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
update public.memberships set role = 'admin' where user_id = 'a0000000-0000-0000-0000-000000000001';
select tests.login('a0000000-0000-0000-0000-000000000001');
do $$ begin
  assert public.rotate_results_token('5a000000-0000-0000-0000-000000000001') <> current_setting('tests.token'), 'nieuwe link';
end $$;

-- Spelleider-link: de beheerder maakt een link, een spelleider zonder account opent hem.
select public.leader_link('5a000000-0000-0000-0000-000000000001') as leader \gset
select tests.logout();
set role anon;
select set_config('tests.leader', :'leader', false);
do $$
declare
  d jsonb := public.leader_session(current_setting('tests.leader'));
  team uuid;
begin
  assert d #>> '{session,name}' = 'Leeuwarden', 'sessie via de link';
  assert jsonb_array_length(d -> 'teams') = 2, 'alleen de teams van deze hunt';
  assert d #>> '{teams,0,team_code}' = '', 'geen teamcode via de link';
  assert not (d #> '{teams,0}') ? 'phone', 'geen telefoonnummers via de link';
  assert jsonb_array_length(d -> 'positions') = 7, 'posities';
  assert jsonb_array_length(public.leader_session(current_setting('tests.leader'),
    ((d -> 'positions' -> 4 ->> 'id'))::bigint) -> 'positions') = 2, 'alleen nieuwe posities';
  team := (d #>> '{teams,0,id}')::uuid;
  assert public.leader_bump_caught(current_setting('tests.leader'), team, 1) = 1, 'gepakt tellen via de link';
  begin
    perform public.leader_session('verkeerd-verkeerd-verkeerd-verkeerd');
    raise exception 'verkeerde link werkte';
  exception when no_data_found then null;
  end;
  begin
    perform public.leader_bump_caught('verkeerd-verkeerd-verkeerd-verkeerd', team, 1);
    raise exception 'gepakt met een verkeerde link';
  exception when no_data_found then null;
  end;
  begin
    perform public.leader_link('5a000000-0000-0000-0000-000000000001');
    raise exception 'anon maakte een link';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
-- Een nieuwe link zet de oude uit; opruimen na 28 dagen ook.
select tests.login('a0000000-0000-0000-0000-000000000001');
select public.leader_link('5a000000-0000-0000-0000-000000000001', true) as leader2 \gset
reset role;
select set_config('tests.leader2', :'leader2', false);
do $$ begin
  begin
    perform public.leader_session(current_setting('tests.leader'));
    raise exception 'oude link werkt nog';
  exception when no_data_found then null;
  end;
  update public.sessions set anonymized_at = now() where id = '5a000000-0000-0000-0000-000000000001';
  begin
    perform public.leader_session(current_setting('tests.leader2'));
    raise exception 'link werkt na het opruimen';
  exception when no_data_found then null;
  end;
end $$;

select tests.logout();
\echo 'Alle resultaten-tests geslaagd'
rollback;
