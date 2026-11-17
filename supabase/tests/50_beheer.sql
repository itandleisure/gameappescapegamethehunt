-- Tests voor de beheeromgeving: organisatie aanmaken, publiceren, sessiecode.
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
  ('b0000000-0000-0000-0000-000000000001', false),  -- Frans
  ('b0000000-0000-0000-0000-000000000002', true),   -- anonieme speler
  ('b0000000-0000-0000-0000-000000000003', false);  -- iemand anders

-- Een anonieme speler mag geen organisatie maken.
select tests.login('b0000000-0000-0000-0000-000000000002');
do $$ begin
  perform public.create_organization('Spelers BV');
  raise exception 'anonieme speler kon een organisatie maken';
exception when insufficient_privilege then null;
end $$;

-- Frans maakt Badass Games en is eigenaar.
select tests.login('b0000000-0000-0000-0000-000000000001');
select public.create_organization('  Badass Games  ') as org \gset
do $$ begin
  if (select name from public.organizations) <> 'Badass Games' then raise exception 'naam niet opgeschoond'; end if;
  if (select role from public.memberships where user_id = auth.uid()) <> 'owner' then raise exception 'geen eigenaar'; end if;
end $$;
-- Een tweede organisatie mag niet.
do $$ begin
  perform public.create_organization('Nog een');
  raise exception 'tweede organisatie toegestaan';
exception when insufficient_privilege then null;
end $$;

-- Spel aanmaken en publiceren: versie 1, dan versie 2.
insert into public.games (id, org_id, layer, slug, languages, default_language)
values ('6b000000-0000-0000-0000-000000000001', :'org', 'base', 'the-hunt', array['nl','en'], 'nl');
select (public.publish_game_version('6b000000-0000-0000-0000-000000000001',
  '{"id":"the-hunt","languages":["nl","en"],"defaultLanguage":"nl","tasks":[]}')).id as v1 \gset
select public.publish_game_version('6b000000-0000-0000-0000-000000000001',
  '{"id":"the-hunt","languages":["nl","en"],"defaultLanguage":"nl","tasks":[]}');
do $$ begin
  if (select array_agg(version order by version) from public.game_versions) <> array[1, 2] then
    raise exception 'versienummers kloppen niet';
  end if;
end $$;
-- Ongeldig pakket wordt geweigerd.
do $$ begin
  perform public.publish_game_version('6b000000-0000-0000-0000-000000000001', '{"languages":["nl"],"defaultLanguage":"de","tasks":[]}');
  raise exception 'ongeldig pakket geaccepteerd';
exception when invalid_parameter_value then null;
end $$;

-- Sessie zonder code krijgt er automatisch een; een opgegeven code wordt hoofdletters.
insert into public.sessions (org_id, game_version_id, name, test_mode, status)
values (:'org', :'v1', 'Test', true, 'open');
insert into public.sessions (org_id, game_version_id, name, join_code)
values (:'org', :'v1', 'Eigen code', ' lwd001 ');
do $$ begin
  if (select join_code from public.sessions where name = 'Test') !~ '^[A-Z2-9]{6}$' then raise exception 'geen automatische code'; end if;
  if (select join_code from public.sessions where name = 'Eigen code') <> 'LWD001' then raise exception 'code niet genormaliseerd'; end if;
end $$;

-- Iemand van buiten mag niet publiceren en ziet niets.
select tests.login('b0000000-0000-0000-0000-000000000003');
do $$ begin
  perform public.publish_game_version('6b000000-0000-0000-0000-000000000001', '{"languages":["nl"],"defaultLanguage":"nl","tasks":[]}');
  raise exception 'buitenstaander kon publiceren';
exception when insufficient_privilege then null;
end $$;
do $$ begin
  if exists (select 1 from public.sessions) or exists (select 1 from public.game_versions) then
    raise exception 'buitenstaander ziet sessies of versies';
  end if;
end $$;

\echo Alle beheer-tests geslaagd
rollback;
