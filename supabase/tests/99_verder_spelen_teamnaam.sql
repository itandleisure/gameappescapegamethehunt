-- Tests voor verder spelen met hunt-code + teamnaam, en unieke teamnamen per hunt.
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
  ('f2000000-0000-0000-0000-000000000001', false),  -- spelleiding
  ('f2000000-0000-0000-0000-000000000002', true),   -- team De Vossen
  ('f2000000-0000-0000-0000-000000000003', true),   -- tweede telefoon van De Vossen
  ('f2000000-0000-0000-0000-000000000004', true);   -- team in een andere hunt

select tests.login('f2000000-0000-0000-0000-000000000001');
select stub.create_organization('Naam BV') as org \gset
insert into public.games (id, org_id, layer, slug, languages, default_language)
values ('6f200000-0000-0000-0000-000000000001', :'org', 'base', 'naam-spel', array['nl'], 'nl');
reset role;
insert into public.game_versions (id, game_id, version, package) values
  ('7f200000-0000-0000-0000-000000000001', '6f200000-0000-0000-0000-000000000001', 1, '{"languages":["nl"]}');
select tests.login('f2000000-0000-0000-0000-000000000001');
insert into public.sessions (id, org_id, game_version_id, name, join_code, status) values
  ('5f200000-0000-0000-0000-000000000001', :'org', '7f200000-0000-0000-0000-000000000001', 'Hunt A', 'NAAMA', 'open'),
  ('5f200000-0000-0000-0000-000000000002', :'org', '7f200000-0000-0000-0000-000000000001', 'Hunt B', 'NAAMB', 'open');

select tests.login('f2000000-0000-0000-0000-000000000002');
select (public.join_session('NAAMA', 'De Vossen', 'nl')).id as vossen \gset

-- Dezelfde naam (andere hoofdletters, spaties, leestekens) mag niet nog eens in dezelfde hunt.
select tests.login('f2000000-0000-0000-0000-000000000004');
do $$ begin
  begin
    perform public.join_session('NAAMA', ' de vossen! ', 'nl');
    raise exception 'dubbele teamnaam toegestaan';
  exception when unique_violation then null;
  end;
end $$;
-- In een andere hunt mag dezelfde naam wel.
select public.join_session('NAAMB', 'De Vossen', 'nl');

-- Tweede telefoon: hunt-code + teamnaam, hoofdletters en spaties maken niet uit.
select tests.login('f2000000-0000-0000-0000-000000000003');
select (public.rejoin_team_by_name(' naama ', 'de  VOSSEN')).id as rejoined \gset
select :'rejoined' = :'vossen' as same \gset
\if :same
\else
  \echo 'verkeerd team bij verder spelen'
  select 1/0;
\endif
do $$ begin
  assert public.is_team_member((select id from public.teams where session_id = '5f200000-0000-0000-0000-000000000001')), 'lid geworden';
  -- Onbekende naam of verkeerde hunt-code.
  begin
    perform public.rejoin_team_by_name('NAAMA', 'De Wolven');
    raise exception 'onbekend team gevonden';
  exception when sqlstate 'P0002' then null;
  end;
  begin
    perform public.rejoin_team_by_name('XXXXX', 'De Vossen');
    raise exception 'verkeerde hunt-code geaccepteerd';
  exception when sqlstate 'P0002' then null;
  end;
end $$;

-- Alleen de teamnaam: De Vossen bestaat in twee lopende hunts, dus de hunt-code is nodig.
do $$ begin
  begin
    perform public.rejoin_team_by_name('', 'De Vossen');
    raise exception 'dubbele naam zonder hunt-code geaccepteerd';
  exception when sqlstate 'P0005' then null;
  end;
end $$;
-- Een unieke naam vindt het team zonder hunt-code.
select tests.login('f2000000-0000-0000-0000-000000000004');
select (public.join_session('NAAMB', 'Uniek Team', 'nl')).id as uniek \gset
select tests.login('f2000000-0000-0000-0000-000000000003');
select (public.rejoin_team_by_name(null, 'uniek TEAM')).id = :'uniek' as same2 \gset
\if :same2
\else
  \echo 'verkeerd team bij verder spelen met alleen de naam'
  select 1/0;
\endif
-- Een team uit een oude hunt (langer dan 2 dagen geleden) telt niet mee.
reset role;
update public.teams set created_at = now() - interval '3 days' where name = 'Uniek Team';
select tests.login('f2000000-0000-0000-0000-000000000003');
do $$ begin
  begin
    perform public.rejoin_team_by_name('', 'Uniek Team');
    raise exception 'oud team gevonden zonder hunt-code';
  exception when sqlstate 'P0002' then null;
  end;
end $$;

rollback;
\echo 'Alle tests voor verder spelen met teamnaam geslaagd'
