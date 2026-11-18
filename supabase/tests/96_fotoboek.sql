-- Tests voor het fotoboek: alleen de spelleiding maakt het, en de geheime
-- link geeft alleen foto's van de eigen sessie door.
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
  ('a1000000-0000-0000-0000-000000000001'),  -- spelleiding
  ('b1000000-0000-0000-0000-000000000001'),  -- andere organisatie
  ('c1000000-0000-0000-0000-000000000001'),  -- speler
  ('c1000000-0000-0000-0000-000000000002');  -- speler in andere sessie
insert into public.organizations (id, name) values
  ('0a100000-0000-0000-0000-00000000000a', 'The Hunt'), ('0b100000-0000-0000-0000-00000000000b', 'Ander');
insert into public.memberships values
  ('0a100000-0000-0000-0000-00000000000a', 'a1000000-0000-0000-0000-000000000001', 'instructor'),
  ('0b100000-0000-0000-0000-00000000000b', 'b1000000-0000-0000-0000-000000000001', 'owner');
insert into public.games (id, org_id, layer, slug) values ('6a100000-0000-0000-0000-000000000001', '0a100000-0000-0000-0000-00000000000a', 'base', 'fotoboek-spel');
insert into public.game_versions (id, game_id, version, package) values
  ('7a100000-0000-0000-0000-000000000001', '6a100000-0000-0000-0000-000000000001', 1, '{"languages":["nl"]}');
insert into public.sessions (id, org_id, game_version_id, name, join_code, status) values
  ('5a100000-0000-0000-0000-000000000001', '0a100000-0000-0000-0000-00000000000a', '7a100000-0000-0000-0000-000000000001', 'Bedrijfsuitje', 'BOEK01', 'open'),
  ('5a100000-0000-0000-0000-000000000002', '0a100000-0000-0000-0000-00000000000a', '7a100000-0000-0000-0000-000000000001', 'Andere hunt', 'BOEK02', 'open');

select tests.login('c1000000-0000-0000-0000-000000000001');
select (public.join_session('BOEK01', 'Vossen', 'nl')).id as team1 \gset
select tests.login('c1000000-0000-0000-0000-000000000002');
select (public.join_session('BOEK02', 'Elders', 'nl')).id as team2 \gset
select tests.logout();
update public.teams set started_at = '2026-11-21 13:00+00', ended_at = '2026-11-21 14:00+00', score = 1500 where id = :'team1';
insert into public.photos (team_id, task_key, path) values
  (:'team1', '_teamfoto', :'team1' || '/_teamfoto/1.jpg'),
  (:'team2', 'fotomissie', :'team2' || '/fotomissie/1.jpg');

-- ---------------------------------------------------------------------------
-- Spelleiding maakt het fotoboek en uploadt eigen foto's
-- ---------------------------------------------------------------------------
select tests.login('a1000000-0000-0000-0000-000000000001');
insert into public.photobooks (session_id, title, items) values (
  '5a100000-0000-0000-0000-000000000001', 'Fotoboek Bedrijfsuitje',
  jsonb_build_array(
    jsonb_build_object('source', 'game', 'path', :'team1' || '/_teamfoto/1.jpg', 'caption', 'Vossen', 'large', true),
    jsonb_build_object('source', 'own', 'path', '5a100000-0000-0000-0000-000000000001/eigen/a.jpg', 'caption', 'Start'),
    -- foto's van een andere sessie horen er niet in en worden nooit gedeeld
    jsonb_build_object('source', 'game', 'path', :'team2' || '/fotomissie/1.jpg', 'caption', 'Elders'),
    jsonb_build_object('source', 'own', 'path', '5a100000-0000-0000-0000-000000000002/eigen/b.jpg', 'caption', 'Elders')
  ));
insert into storage.objects (bucket_id, name) values ('photobooks', '5a100000-0000-0000-0000-000000000001/eigen/a.jpg');
update public.photobooks set pdf_path = '5a100000-0000-0000-0000-000000000001/fotoboek.pdf', pdf_made_at = now()
where session_id = '5a100000-0000-0000-0000-000000000001';

do $$ begin
  insert into storage.objects (bucket_id, name) values ('photobooks', 'los/a.jpg');
  raise exception 'pad zonder sessie geaccepteerd';
exception when insufficient_privilege then null;
end $$;

-- ---------------------------------------------------------------------------
-- Anderen zien en wijzigen niets
-- ---------------------------------------------------------------------------
select tests.login('b1000000-0000-0000-0000-000000000001');
do $$ begin
  assert not exists (select 1 from public.photobooks), 'andere organisatie ziet het fotoboek niet';
  assert not exists (select 1 from storage.objects where bucket_id = 'photobooks'), 'andere organisatie ziet de bestanden niet';
end $$;
do $$ begin
  insert into storage.objects (bucket_id, name) values ('photobooks', '5a100000-0000-0000-0000-000000000001/eigen/nep.jpg');
  raise exception 'buitenstaander kon uploaden';
exception when insufficient_privilege then null;
end $$;
do $$ begin
  perform public.rotate_photobook_token('5a100000-0000-0000-0000-000000000001');
  raise exception 'buitenstaander kon de link vernieuwen';
exception when insufficient_privilege then null;
end $$;

select tests.login('c1000000-0000-0000-0000-000000000001');
do $$ begin
  assert not exists (select 1 from public.photobooks), 'speler ziet het fotoboek in de beheerapp niet';
end $$;
do $$ begin
  perform public.shared_photobook('x');
  raise exception 'speler kon shared_photobook aanroepen';
exception when insufficient_privilege then null;
end $$;

-- ---------------------------------------------------------------------------
-- Geheime link (via de serverfunctie, met de service role)
-- ---------------------------------------------------------------------------
select tests.logout();
select share_token as token from public.photobooks where session_id = '5a100000-0000-0000-0000-000000000001' \gset

do $$ begin
  perform public.shared_photobook((select share_token from public.photobooks limit 1));
  raise exception 'niet gedeeld fotoboek toch zichtbaar';
exception when no_data_found then null;
end $$;

update public.photobooks set shared = true;
do $$
declare
  b jsonb := public.shared_photobook((select share_token from public.photobooks limit 1));
begin
  assert b ->> 'title' = 'Fotoboek Bedrijfsuitje', 'titel';
  assert jsonb_array_length(b -> 'items') = 2, 'alleen foto''s van de eigen sessie: ' || (b -> 'items')::text;
  assert b #>> '{items,0,source}' = 'game' and (b #>> '{items,0,large}')::boolean, 'volgorde en opmaak blijven';
  assert b #>> '{items,1,caption}' = 'Start', 'eigen foto';
  assert jsonb_array_length(b -> 'ranking') = 1 and b #>> '{ranking,0,name}' = 'Vossen', 'ranglijst met gestarte teams';
  assert b ->> 'pdf_path' like '5a100000-0000-0000-0000-000000000001/%', 'pdf';
end $$;

select tests.login('a1000000-0000-0000-0000-000000000001');
select public.rotate_photobook_token('5a100000-0000-0000-0000-000000000001') as newtoken \gset
select tests.logout();
select set_config('tests.token', :'token', true);
do $$ begin
  assert (select share_token from public.photobooks) <> current_setting('tests.token'), 'nieuwe link';
  perform public.shared_photobook(current_setting('tests.token'));
  raise exception 'oude link werkt nog';
exception when no_data_found then null;
end $$;

\echo Alle fotoboek-tests geslaagd
rollback;
