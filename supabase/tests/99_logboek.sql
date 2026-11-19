-- Tests voor het logboek met technische meldingen (migratie 20261120203100).
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
  ('1b000000-0000-0000-0000-000000000001', false),  -- beheerder organisatie A
  ('1b000000-0000-0000-0000-000000000002', true),   -- team Vossen (A)
  ('1b000000-0000-0000-0000-000000000003', false),  -- beheerder organisatie B
  ('1b000000-0000-0000-0000-000000000004', true),   -- speler zonder team
  ('1b000000-0000-0000-0000-000000000005', true);   -- spelleider in de app

select tests.login('1b000000-0000-0000-0000-000000000001');
select stub.create_organization('Logboek A') as org \gset
insert into public.games (id, org_id, layer, slug, languages, default_language)
values ('6b100000-0000-0000-0000-000000000001', :'org', 'base', 'logboek-spel', array['nl'], 'nl');
reset role;
insert into public.game_versions (id, game_id, version, package) values
  ('7b100000-0000-0000-0000-000000000001', '6b100000-0000-0000-0000-000000000001', 1, '{"languages":["nl"]}');
select tests.login('1b000000-0000-0000-0000-000000000001');
insert into public.sessions (id, org_id, game_version_id, name, join_code, status) values
  ('5b100000-0000-0000-0000-000000000001', :'org', '7b100000-0000-0000-0000-000000000001', 'Jacht', 'LOGA', 'open');
select public.leader_code('5b100000-0000-0000-0000-000000000001') as code \gset

select tests.login('1b000000-0000-0000-0000-000000000003');
select stub.create_organization('Logboek B') as org_b \gset
-- Gewone organisaties (de stub maakt platformorganisaties).
reset role;
update public.organizations set is_platform = false where id in (:'org', :'org_b');

select tests.login('1b000000-0000-0000-0000-000000000002');
select (public.join_session('LOGA', 'Vossen', 'nl', '0612345678')).id as team \gset

select tests.login('1b000000-0000-0000-0000-000000000005');
select public.leader_join(:'code', 'Piet');

-- Het team meldt zwak GPS; de hunt komt van het team, niet uit de melding.
select tests.login('1b000000-0000-0000-0000-000000000002');
do $$
declare n integer;
begin
  n := public.log_app_issues(jsonb_build_array(
    jsonb_build_object('source', 'app', 'level', 'warn', 'kind', 'gps_zwak', 'message', 'GPS onnauwkeurig: 85 m',
                       'device', '{"os":"android","osVersion":"14"}',
                       'install_id', 'abc', 'client_time', '2026-11-20T12:00:00Z', 'count', 3),
    'geen object',
    jsonb_build_object('kind', 'Rare Tekens!!', 'level', 'paniek', 'source', 'iets', 'count', 'veel')
  ));
  if n <> 2 then raise exception 'verwacht 2 opgeslagen meldingen, kreeg %', n; end if;
end $$;
select public.log_app_issues(jsonb_build_array(
  jsonb_build_object('source', 'app', 'level', 'warn', 'kind', 'gps_zwak', 'team_id', :'team', 'count', 3)));
-- Een team leest het logboek niet.
do $$ begin
  if (select count(*) from public.app_logs) <> 0 then raise exception 'team ziet het logboek'; end if;
end $$;

-- Een speler zonder team kan geen hunt of team van een ander opgeven.
select tests.login('1b000000-0000-0000-0000-000000000004');
select public.log_app_issues(jsonb_build_array(
  jsonb_build_object('kind', 'aanmelden_mislukt', 'team_id', :'team', 'session_id', '5b100000-0000-0000-0000-000000000001')));

-- De spelleider in de app meldt bij zijn hunt.
select tests.login('1b000000-0000-0000-0000-000000000005');
select public.log_app_issues(jsonb_build_array(
  jsonb_build_object('source', 'spelleider', 'kind', 'locatie_geweigerd', 'level', 'warn', 'session_id', '5b100000-0000-0000-0000-000000000001')));

reset role;
do $$
declare r record;
begin
  -- Vreemde waarden worden netjes gemaakt.
  select * into r from public.app_logs where kind = 'raretekens';
  if r is null or r.level <> 'error' or r.source <> 'app' or r.repeat_count <> 1 or r.session_id is not null then
    raise exception 'onveilige melding niet opgeschoond: %', row_to_json(r);
  end if;
  select * into r from public.app_logs where kind = 'gps_zwak' and team_id is not null limit 1;
  if r is null then raise exception 'team-melding ontbreekt'; end if;
  if r.session_id <> '5b100000-0000-0000-0000-000000000001' or r.org_id is null or r.repeat_count <> 3 then
    raise exception 'team-melding mist hunt of organisatie: %', row_to_json(r);
  end if;
  select * into r from public.app_logs where kind = 'aanmelden_mislukt';
  if r.team_id is not null or r.session_id is not null or r.org_id is not null then
    raise exception 'vreemde hunt of team overgenomen: %', row_to_json(r);
  end if;
  select * into r from public.app_logs where kind = 'locatie_geweigerd';
  if r.session_id is null or r.source <> 'spelleider' then
    raise exception 'spelleider-melding zonder hunt: %', row_to_json(r);
  end if;
end $$;

-- Organisatie A ziet de meldingen van haar hunt, B niets.
select tests.login('1b000000-0000-0000-0000-000000000001');
do $$ begin
  if (select count(*) from public.app_logs where session_id is not null) < 2 then raise exception 'organisatie ziet eigen meldingen niet'; end if;
  if exists (select 1 from public.app_logs where org_id is null) then raise exception 'organisatie ziet meldingen zonder hunt'; end if;
end $$;
select tests.login('1b000000-0000-0000-0000-000000000003');
do $$ begin
  if (select count(*) from public.app_logs) <> 0 then raise exception 'andere organisatie ziet meldingen'; end if;
end $$;

-- Het platform ziet alles, ook meldingen zonder hunt.
reset role;
update public.organizations set is_platform = true where id = :'org_b';
select tests.login('1b000000-0000-0000-0000-000000000003');
do $$ begin
  if not exists (select 1 from public.app_logs where org_id is null) then raise exception 'platform ziet meldingen zonder hunt niet'; end if;
end $$;

-- Rem: hooguit 300 per uur per gebruiker.
select tests.login('1b000000-0000-0000-0000-000000000004');
do $$
declare i integer;
begin
  for i in 1..7 loop
    perform public.log_app_issues((select jsonb_agg(jsonb_build_object('kind', 'storm')) from generate_series(1, 50)));
  end loop;
end $$;
reset role;
do $$ begin
  if (select count(*) from public.app_logs where kind = 'storm') > 300 then raise exception 'rem werkt niet'; end if;
end $$;

-- Rechtstreeks schrijven kan niet.
select tests.login('1b000000-0000-0000-0000-000000000002');
do $$ begin
  begin
    insert into public.app_logs (source, level, kind) values ('app', 'error', 'x');
    raise exception 'rechtstreeks schrijven lukte';
  exception when insufficient_privilege then null;
  end;
end $$;

\echo Alle tests voor het logboek geslaagd
rollback;
