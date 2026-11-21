-- Tests voor tickets uit de webshop.
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
  ('f4000000-0000-0000-0000-000000000001', false),  -- eigenaar Badass
  ('f4000000-0000-0000-0000-000000000002', false),  -- eigenaar andere organisatie
  ('f4000000-0000-0000-0000-000000000003', true);   -- speler

select tests.login('f4000000-0000-0000-0000-000000000002');
select stub.create_organization('Ander BV') as other \gset
reset role;
insert into public.games (id, org_id, layer, parent_id, slug, public_id, languages, default_language) values
  ('6f400000-0000-0000-0000-000000000008', :'other', 'base', null, 'ander-basis', 'ander-basis', array['nl'], 'nl'),
  ('6f400000-0000-0000-0000-000000000009', :'other', 'city', '6f400000-0000-0000-0000-000000000008', 'ander-spel', 'ander-spel', array['nl'], 'nl');

select tests.login('f4000000-0000-0000-0000-000000000001');
select stub.create_organization('Badass') as org \gset
reset role;
insert into public.games (id, org_id, layer, parent_id, slug, public_id, languages, default_language) values
  ('6f400000-0000-0000-0000-000000000001', :'org', 'base', null, 'the-hunt', 'the-hunt', array['nl'], 'nl'),
  ('6f400000-0000-0000-0000-000000000002', :'org', 'city', '6f400000-0000-0000-0000-000000000001', 'leeuwarden', 'the-hunt-leeuwarden', array['nl'], 'nl'),
  ('6f400000-0000-0000-0000-000000000003', :'org', 'city', '6f400000-0000-0000-0000-000000000001', 'sneek', 'the-hunt-sneek', array['nl'], 'nl');
insert into public.org_settings (org_id, settings) values (:'org', '{"tickets":{"track_count":3,"timezone":"Europe/Brussels","team_chat":true}}');
reset role;
insert into public.game_versions (id, game_id, version, package) values
  ('7f400000-0000-0000-0000-000000000001', '6f400000-0000-0000-0000-000000000002', 1, '{"languages":["nl"]}'),
  ('7f400000-0000-0000-0000-000000000002', '6f400000-0000-0000-0000-000000000002', 2, '{"languages":["nl"]}'),
  ('7f400000-0000-0000-0000-000000000009', '6f400000-0000-0000-0000-000000000009', 1, '{"languages":["nl"]}');

-- Alleen een eigenaar of beheerder maakt een sleutel; anderen niet voor deze organisatie.
select tests.login('f4000000-0000-0000-0000-000000000002');
do $$ begin
  begin
    perform public.new_webshop_key((select id from public.organizations where name = 'Badass'));
    raise exception 'sleutel voor andere organisatie gemaakt';
  exception when insufficient_privilege then null;
  end;
end $$;
select public.new_webshop_key(:'other') as otherkey \gset

select tests.login('f4000000-0000-0000-0000-000000000001');
select public.new_webshop_key(:'org') as oldkey \gset
select public.new_webshop_key(:'org') as key \gset
-- De sleutel zelf is niet te lezen.
do $$ begin
  begin
    perform key_hash from public.webshop_keys;
    raise exception 'key_hash leesbaar';
  exception when insufficient_privilege then null;
  end;
end $$;
-- Gewone gebruikers kunnen geen ticket via de webshopfunctie maken.
do $$ begin
  begin
    perform public.webshop_create_ticket('x', 'the-hunt-leeuwarden', 4, '1');
    raise exception 'webshopfunctie open voor gebruikers';
  exception when insufficient_privilege then null;
  end;
end $$;

reset role;
set role service_role;
-- Bestelling: The Hunt Leeuwarden, 4 teams.
select public.webshop_create_ticket(:'key', 'The Hunt Leeuwarden', 4, 'WS-1001', 'Jansen, 20 personen') as t1 \gset
select :'t1'::jsonb ->> 'code' as code \gset
reset role;
do $$
declare
  s public.sessions;
begin
  select * into s from public.sessions where webshop_order = 'WS-1001';
  assert s.max_teams = 4, 'max 4 teams';
  assert s.status = 'open', 'open';
  assert s.game_version_id = '7f400000-0000-0000-0000-000000000002', 'nieuwste versie';
  assert s.track_count = 3 and s.timezone = 'Europe/Brussels' and s.team_chat, 'standaard uit instellingen';
  assert s.name = 'Jansen, 20 personen', 'naam';
end $$;
set role service_role;
-- Nog eens dezelfde bestelling: hetzelfde ticket.
select public.webshop_create_ticket(:'key', 'the-hunt-leeuwarden', 4, 'WS-1001') ->> 'code' = :'code' as same \gset
\if :same
\else
  \echo 'dubbele bestelling gaf een ander ticket'
  select 1/0;
\endif
reset role;
do $$ begin
  assert (select count(*) from public.sessions where webshop_order = 'WS-1001') = 1, 'één ticket';
end $$;
set role service_role;

-- Fouten: oude sleutel, spel van een ander, template, niet gepubliceerd, aantal teams.
select set_config('tests.key', :'key', false);
do $$ begin
  begin perform public.webshop_create_ticket(current_setting('tests.key'), 'ander-spel', 4, 'WS-3');
    raise exception 'spel van ander'; exception when sqlstate 'P0002' then null; end;
  begin perform public.webshop_create_ticket(current_setting('tests.key'), 'the-hunt', 4, 'WS-4');
    raise exception 'template'; exception when sqlstate 'P0002' then null; end;
  begin perform public.webshop_create_ticket(current_setting('tests.key'), 'the-hunt-sneek', 4, 'WS-5');
    raise exception 'niet gepubliceerd'; exception when sqlstate 'P0002' then null; end;
  begin perform public.webshop_create_ticket(current_setting('tests.key'), 'the-hunt-leeuwarden', 0, 'WS-6');
    raise exception '0 teams'; exception when sqlstate '22023' then null; end;
  begin perform public.webshop_create_ticket(current_setting('tests.key'), 'the-hunt-leeuwarden', 4, ' ');
    raise exception 'geen bestelnummer'; exception when sqlstate '22023' then null; end;
end $$;
select set_config('tests.oldkey', :'oldkey', false);
do $$ begin
  begin perform public.webshop_create_ticket(current_setting('tests.oldkey'), 'the-hunt-leeuwarden', 4, 'WS-2');
    raise exception 'oude sleutel werkt nog'; exception when invalid_authorization_specification then null; end;
end $$;
-- Het bestelnummer is per organisatie: de andere organisatie mag WS-1001 ook gebruiken.
select public.webshop_create_ticket(:'otherkey', 'ander-spel', 2, 'WS-1001');

-- Het ticket werkt in de app, met het maximum.
reset role;
select tests.login('f4000000-0000-0000-0000-000000000003');
select public.join_session(:'code', 'De Vossen', 'nl');

reset role;
do $$ begin
  assert (select last_used_at from public.webshop_keys w join public.organizations o on o.id = w.org_id where o.name = 'Badass') is not null, 'laatst gebruikt';
end $$;

rollback;
\echo 'Alle tests voor tickets uit de webshop geslaagd'
