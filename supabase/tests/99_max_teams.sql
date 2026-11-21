-- Tests voor het maximum aantal teams per ticket.
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
  ('f3000000-0000-0000-0000-000000000002', true),   -- team 1
  ('f3000000-0000-0000-0000-000000000003', true),   -- team 2
  ('f3000000-0000-0000-0000-000000000004', true),   -- team 3 (te veel)
  ('f3000000-0000-0000-0000-000000000005', true);   -- tweede telefoon van team 1

select tests.login('f3000000-0000-0000-0000-000000000001');
select stub.create_organization('Webshop BV') as org \gset
insert into public.games (id, org_id, layer, slug, languages, default_language)
values ('6f300000-0000-0000-0000-000000000001', :'org', 'base', 'max-spel', array['nl'], 'nl');
reset role;
insert into public.game_versions (id, game_id, version, package) values
  ('7f300000-0000-0000-0000-000000000001', '6f300000-0000-0000-0000-000000000001', 1, '{"languages":["nl"]}');
select tests.login('f3000000-0000-0000-0000-000000000001');
insert into public.sessions (id, org_id, game_version_id, name, join_code, status, max_teams) values
  ('5f300000-0000-0000-0000-000000000001', :'org', '7f300000-0000-0000-0000-000000000001', 'Webshop 2 teams', 'MAXTWEE', 'open', 2),
  ('5f300000-0000-0000-0000-000000000002', :'org', '7f300000-0000-0000-0000-000000000001', 'Onbeperkt', 'ONBEPERKT', 'open', null);

-- Een maximum van 0 of meer dan 500 kan niet.
do $$ begin
  begin
    update public.sessions set max_teams = 0 where id = '5f300000-0000-0000-0000-000000000001';
    raise exception 'max_teams 0 toegestaan';
  exception when check_violation then null;
  end;
end $$;

select tests.login('f3000000-0000-0000-0000-000000000002');
select (public.join_session('MAXTWEE', 'Team Een', 'nl')).id as een \gset
select tests.login('f3000000-0000-0000-0000-000000000003');
select public.join_session('MAXTWEE', 'Team Twee', 'nl');

-- Het derde team wordt geweigerd met P0007.
select tests.login('f3000000-0000-0000-0000-000000000004');
do $$ begin
  begin
    perform public.join_session('MAXTWEE', 'Team Drie', 'nl');
    raise exception 'derde team toegestaan';
  exception when sqlstate 'P0007' then null;
  end;
end $$;
-- In een onbeperkt ticket kan hetzelfde team gewoon meedoen.
select public.join_session('ONBEPERKT', 'Team Drie', 'nl');

-- Een team dat al meedoet komt op een tweede telefoon gewoon weer binnen.
select tests.login('f3000000-0000-0000-0000-000000000005');
select (public.rejoin_team_by_name('MAXTWEE', 'Team Een')).id as weer \gset
select :'weer' = :'een' as same \gset
\if :same
\else
  \echo 'verder spelen werkt niet meer in een vol ticket'
  select 1/0;
\endif

-- De spelleiding zet het maximum hoger: nu mag het derde team wel.
select tests.login('f3000000-0000-0000-0000-000000000001');
update public.sessions set max_teams = 3 where id = '5f300000-0000-0000-0000-000000000001';
select tests.login('f3000000-0000-0000-0000-000000000004');
select public.join_session('MAXTWEE', 'Team Drie', 'nl');

reset role;
do $$ begin
  assert (select count(*) from public.teams where session_id = '5f300000-0000-0000-0000-000000000001') = 3, 'drie teams';
end $$;

rollback;
\echo 'Alle tests voor het maximum aantal teams per ticket geslaagd'
