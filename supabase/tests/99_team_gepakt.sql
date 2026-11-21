-- Tests voor "Team gepakt" (migratie 20261121400000).
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
  ('fc000000-0000-0000-0000-000000000001', false),  -- beheerder
  ('fc000000-0000-0000-0000-000000000002', true),   -- team Vossen
  ('fc000000-0000-0000-0000-000000000003', true),   -- spelleider Piet
  ('fc000000-0000-0000-0000-000000000004', true);   -- team Dassen

select tests.login('fc000000-0000-0000-0000-000000000001');
select stub.create_organization('Gepakt BV') as org \gset
insert into public.games (id, org_id, layer, slug, languages, default_language)
values ('6fc00000-0000-0000-0000-000000000001', :'org', 'base', 'gepakt', array['nl'], 'nl');
reset role;
insert into public.game_versions (id, game_id, version, package) values
  ('7fc00000-0000-0000-0000-000000000001', '6fc00000-0000-0000-0000-000000000001', 1, '{"languages":["nl"]}');
select tests.login('fc000000-0000-0000-0000-000000000001');
insert into public.sessions (id, org_id, game_version_id, name, join_code, status) values
  ('5fc00000-0000-0000-0000-000000000001', :'org', '7fc00000-0000-0000-0000-000000000001', 'Jacht', 'PAKT1', 'open');
select public.leader_code('5fc00000-0000-0000-0000-000000000001') as code \gset
select set_config('tests.code', :'code', false);

select tests.login('fc000000-0000-0000-0000-000000000002');
select (public.join_session('PAKT1', 'Vossen', 'nl', '0612345678')).id as vossen \gset
select set_config('tests.vossen', :'vossen', false);
select tests.login('fc000000-0000-0000-0000-000000000004');
select (public.join_session('PAKT1', 'Dassen', 'nl', '0612345679')).id as dassen \gset
select set_config('tests.dassen', :'dassen', false);

-- Een team kan zichzelf geen gepakt (of bonus) geven.
select tests.login('fc000000-0000-0000-0000-000000000002');
do $$ begin
  begin
    insert into public.events (id, team_id, type, payload, client_time)
    values (gen_random_uuid(), current_setting('tests.vossen')::uuid, 'caught', '{"points": 1000}', now());
    raise exception 'team stuurde zelf caught';
  exception when insufficient_privilege then null;
  end;
  assert jsonb_array_length(public.team_signals(current_setting('tests.vossen')::uuid, 0) -> 'caught') = 0, 'nog niemand gepakt';
end $$;

-- Piet meldt Vossen gepakt.
select tests.login('fc000000-0000-0000-0000-000000000003');
do $$ begin
  perform public.leader_join(current_setting('tests.code'), 'Piet');
  assert public.leader_bump_caught('5fc00000-0000-0000-0000-000000000001', current_setting('tests.vossen')::uuid, 1) = 1, 'teller';
  assert public.leader_bump_caught('5fc00000-0000-0000-0000-000000000001', current_setting('tests.vossen')::uuid, 1) = 2, 'tweede keer';
  assert public.leader_bump_caught('5fc00000-0000-0000-0000-000000000001', current_setting('tests.vossen')::uuid, -1) = 1, 'vergissing terug';
  -- Min op nul: geen gebeurtenis weghalen die er niet is.
  assert public.leader_bump_caught('5fc00000-0000-0000-0000-000000000001', current_setting('tests.dassen')::uuid, -1) = 0, 'niet onder nul';
end $$;

reset role;
do $$ begin
  assert (select count(*) from public.events where type = 'caught') = 1, 'één gebeurtenis over';
  assert (select payload ->> 'points' from public.events where type = 'caught') = '-100', 'standaard -100';
  assert (select team_id from public.events where type = 'caught') = current_setting('tests.vossen')::uuid, 'bij Vossen';
end $$;

-- Dassen zien dat Vossen gepakt zijn; met een latere p_since niet meer.
select tests.login('fc000000-0000-0000-0000-000000000004');
do $$
declare
  s jsonb := public.team_signals(current_setting('tests.dassen')::uuid, 0);
begin
  assert jsonb_array_length(s -> 'caught') = 1, 'één keer gepakt';
  assert s #>> '{caught,0,team_name}' = 'Vossen', 'naam';
  assert (s #>> '{caught,0,points}')::numeric = -100, 'punten';
  assert not (s ->> 'hunter_near')::boolean, 'geen Hunter in de buurt';
  assert jsonb_array_length(public.team_signals(current_setting('tests.dassen')::uuid,
    (s #>> '{caught,0,at}')::double precision) -> 'caught') = 0, 'al gezien';
  begin
    perform public.team_signals(current_setting('tests.vossen')::uuid, 0);
    raise exception 'ander team gevraagd';
  exception when insufficient_privilege then null;
  end;
end $$;

-- Eigen straf per spel.
reset role;
update public.game_versions set package = '{"languages":["nl"],"caughtPenalty":50}' where id = '7fc00000-0000-0000-0000-000000000001';
select tests.login('fc000000-0000-0000-0000-000000000001');
do $$ begin
  assert public.bump_team_caught(current_setting('tests.dassen')::uuid, 1) = 1, 'beheer telt ook';
end $$;
reset role;
do $$ begin
  assert (select payload ->> 'points' from public.events where type = 'caught' and team_id = current_setting('tests.dassen')::uuid) = '-50', 'straf uit het spel';
end $$;

\echo Alle tests voor Team gepakt geslaagd
rollback;
