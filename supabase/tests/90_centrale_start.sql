-- Tests voor de centrale start: vergrendelen, klaarmelden en samen starten.
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
  ('f0000000-0000-0000-0000-000000000001', false),  -- spelleiding
  ('f0000000-0000-0000-0000-000000000002', true),   -- team 1
  ('f0000000-0000-0000-0000-000000000003', true);   -- team 2

select tests.login('f0000000-0000-0000-0000-000000000001');
select stub.create_organization('Start BV') as org \gset
insert into public.games (id, org_id, layer, slug, languages, default_language)
values ('6f000000-0000-0000-0000-000000000001', :'org', 'base', 'start-spel', array['nl'], 'nl');
reset role;
insert into public.game_versions (id, game_id, version, package) values
  ('7f000000-0000-0000-0000-000000000001', '6f000000-0000-0000-0000-000000000001', 1, '{"languages":["nl"]}');
select tests.login('f0000000-0000-0000-0000-000000000001');
insert into public.sessions (id, org_id, game_version_id, name, join_code, status, central_start) values
  ('5f000000-0000-0000-0000-000000000001', :'org', '7f000000-0000-0000-0000-000000000001', 'Centraal', 'SAMEN', 'open', true);

-- Team 1 meldt zich aan en kan nog niet zelf starten.
select tests.login('f0000000-0000-0000-0000-000000000002');
select (public.join_session('SAMEN', 'Vossen', 'nl', '0612345678')).id as team1 \gset
select team_code as code1 from public.teams where id = :'team1' \gset
do $$ begin
  begin
    perform public.start_team((select id from public.teams where name = 'Vossen'));
    raise exception 'zelf gestart voor de centrale start';
  exception when sqlstate 'P0004' then null;
  end;
end $$;
select public.team_ready(:'team1');

-- Een team kan zich niet namens een ander klaarmelden; de spelleider vergrendelt.
select tests.login('f0000000-0000-0000-0000-000000000001');
do $$ begin
  assert (select count(*) from public.teams where ready_at is not null) = 1, 'een team klaar';
end $$;
update public.sessions set locked = true where id = '5f000000-0000-0000-0000-000000000001';

-- Vergrendeld: geen nieuwe teams, wel opnieuw inloggen met de teamcode.
select tests.login('f0000000-0000-0000-0000-000000000003');
do $$ begin
  begin
    perform public.join_session('SAMEN', 'Wolven', 'nl', '0612345678');
    raise exception 'nieuw team in vergrendelde hunt';
  exception when sqlstate 'P0003' then null;
  end;
  begin
    perform public.start_session('5f000000-0000-0000-0000-000000000001');
    raise exception 'speler startte de hunt';
  exception when sqlstate '42501' then null;
  end;
end $$;
select public.rejoin_team(:'code1');

-- De spelleider start: alle teams krijgen dezelfde starttijd.
select tests.login('f0000000-0000-0000-0000-000000000001');
select public.start_session('5f000000-0000-0000-0000-000000000001');
do $$ begin
  assert (select count(*) from public.teams t join public.sessions s on s.id = t.session_id
          where s.id = '5f000000-0000-0000-0000-000000000001' and t.started_at = s.started_at) = 1, 'team gestart op het moment van de spelleider';
end $$;
select tests.login('f0000000-0000-0000-0000-000000000003');
select (public.start_team(:'team1')).started_at = (select started_at from public.sessions where id = '5f000000-0000-0000-0000-000000000001') as same \gset
\if :same
\else
  \echo 'start_team geeft niet de centrale tijd'
  select 1/0;
\endif

\echo Alle tests voor de centrale start geslaagd
rollback;
