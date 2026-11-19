-- Tests voor de aangescherpte beveiliging (migratie 20261119900000_beveiliging).
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
  ('f3000000-0000-0000-0000-000000000001', false),  -- spelleiding
  ('f3000000-0000-0000-0000-000000000002', true),   -- team De Vossen
  ('f3000000-0000-0000-0000-000000000003', true);   -- team De Wolven

select tests.login('f3000000-0000-0000-0000-000000000001');
select stub.create_organization('Veilig BV') as org \gset
insert into public.games (id, org_id, layer, slug, languages, default_language)
values ('6f300000-0000-0000-0000-000000000001', :'org', 'base', 'veilig-spel', array['nl'], 'nl');
reset role;
insert into public.game_versions (id, game_id, version, package) values
  ('7f300000-0000-0000-0000-000000000001', '6f300000-0000-0000-0000-000000000001', 1, '{"languages":["nl"]}');
select tests.login('f3000000-0000-0000-0000-000000000001');
insert into public.sessions (id, org_id, game_version_id, name, join_code, status) values
  ('5f300000-0000-0000-0000-000000000001', :'org', '7f300000-0000-0000-0000-000000000001', 'Hunt V', 'VEILIG', 'open');

select tests.login('f3000000-0000-0000-0000-000000000002');
select (public.join_session('VEILIG', 'De Vossen', 'nl', '0612345678')).id as vossen \gset
select tests.login('f3000000-0000-0000-0000-000000000003');
select (public.join_session('VEILIG', 'De Wolven', 'nl', '0687654321')).id as wolven \gset

-- 1. Een team ziet de teamcode van een ander team niet meer.
do $$ begin
  assert (select count(*) from public.teams) = 1, 'speler ziet alleen het eigen team';
  assert (select name from public.teams) = 'De Wolven', 'en dat is het eigen team';
  assert (select count(*) from public.team_contacts) = 1, 'alleen het eigen telefoonnummer';
end $$;

-- 2. build_session_results en team_distance zijn niet van buitenaf aan te roepen.
do $$ begin
  begin
    perform public.build_session_results('5f300000-0000-0000-0000-000000000001');
    raise exception 'build_session_results was aanroepbaar';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.team_distance((select id from public.teams));
    raise exception 'team_distance was aanroepbaar';
  exception when insufficient_privilege then null;
  end;
  -- De ranglijst via session_results werkt gewoon voor spelers in de hunt.
  assert jsonb_array_length(public.session_results('5f300000-0000-0000-0000-000000000001') -> 'teams') = 2,
    'session_results geeft de ranglijst';
end $$;
reset role;
do $$ begin
  assert not has_function_privilege('anon', 'public.build_session_results(uuid)', 'execute'), 'anon: build_session_results dicht';
  assert not has_function_privilege('authenticated', 'public.build_session_results(uuid)', 'execute'), 'authenticated: build_session_results dicht';
  assert has_function_privilege('anon', 'public.shared_session_results(text)', 'execute'), 'gedeelde resultaten blijven werken';
end $$;

-- 3. Een team kan zelf geen manualOpen insturen; gewone gebeurtenissen wel.
select tests.login('f3000000-0000-0000-0000-000000000003');
do $$
declare
  own uuid := (select id from public.teams);
begin
  insert into public.events (id, team_id, type, task_key, client_time)
  values ('e3000000-0000-0000-0000-000000000001', own, 'answered', 'puzzel-1', now());
  begin
    insert into public.events (id, team_id, type, task_key, client_time)
    values ('e3000000-0000-0000-0000-000000000002', own, 'manualOpen', 'puzzel-1', now());
    raise exception 'team kon manualOpen insturen';
  exception when insufficient_privilege then null;
  end;
end $$;
-- De spelleiding mag een opdracht wel handmatig openen.
select tests.login('f3000000-0000-0000-0000-000000000001');
insert into public.events (id, team_id, type, task_key, client_time)
values ('e3000000-0000-0000-0000-000000000003', :'wolven', 'manualOpen', 'puzzel-1', now());

-- 4. Een team registreert alleen foto's in de eigen map.
select tests.login('f3000000-0000-0000-0000-000000000003');
insert into public.photos (team_id, task_key, path) values (:'wolven', 'fotomissie', :'wolven' || '/fotomissie/a.jpg');
do $$ begin
  begin
    insert into public.photos (team_id, task_key, path)
    values ((select id from public.teams), 'fotomissie', 'aaaaaaaa-0000-0000-0000-000000000000/fotomissie/van-een-ander.jpg');
    raise exception 'team kon een vreemd fotopad opnemen';
  exception when insufficient_privilege then null;
  end;
end $$;

\echo Alle beveiligingstests geslaagd
rollback;
