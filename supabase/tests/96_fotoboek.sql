-- Tests voor het fotoboek: alleen de spelleiding maakt het, vaste foto's per
-- organisatie, en de link met wachtwoord geeft alleen foto's van de eigen
-- sessie door, zolang het fotoboek gedeeld en niet verlopen is.
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
  ('a1000000-0000-0000-0000-000000000001'),  -- spelleiding (instructeur)
  ('a1000000-0000-0000-0000-000000000002'),  -- redacteur
  ('b1000000-0000-0000-0000-000000000001'),  -- andere organisatie
  ('c1000000-0000-0000-0000-000000000001'),  -- speler
  ('c1000000-0000-0000-0000-000000000002');  -- speler in andere sessie
insert into public.organizations (id, name) values
  ('0a100000-0000-0000-0000-00000000000a', 'The Hunt'), ('0b100000-0000-0000-0000-00000000000b', 'Ander');
insert into public.memberships values
  ('0a100000-0000-0000-0000-00000000000a', 'a1000000-0000-0000-0000-000000000001', 'instructor'),
  ('0a100000-0000-0000-0000-00000000000a', 'a1000000-0000-0000-0000-000000000002', 'editor'),
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
-- Vaste foto's en links van de organisatie (redacteur of hoger)
-- ---------------------------------------------------------------------------
select tests.login('a1000000-0000-0000-0000-000000000002');
insert into storage.objects (bucket_id, name) values ('photobooks', 'huisstijl/0a100000-0000-0000-0000-00000000000a/omslag.jpg');
insert into public.photobook_settings (org_id, cover_path, stock_paths, links) values (
  '0a100000-0000-0000-0000-00000000000a', 'huisstijl/0a100000-0000-0000-0000-00000000000a/omslag.jpg',
  '["huisstijl/0a100000-0000-0000-0000-00000000000a/a.jpg"]', '{"google_review": "https://example.com/review"}');

-- Een instructeur gebruikt de vaste foto's, maar wijzigt ze niet.
select tests.login('a1000000-0000-0000-0000-000000000001');
do $$ begin
  assert (select count(*) from public.photobook_settings) = 1, 'instructeur ziet de instellingen';
  assert exists (select 1 from storage.objects where name like 'huisstijl/%'), 'instructeur ziet de vaste foto''s';
end $$;
do $$ begin
  insert into storage.objects (bucket_id, name) values ('photobooks', 'huisstijl/0a100000-0000-0000-0000-00000000000a/nep.jpg');
  raise exception 'instructeur kon een vaste foto plaatsen';
exception when insufficient_privilege then null;
end $$;

-- ---------------------------------------------------------------------------
-- Spelleiding maakt het fotoboek en uploadt eigen foto's
-- ---------------------------------------------------------------------------
insert into public.photobooks (session_id, title, city, items) values (
  '5a100000-0000-0000-0000-000000000001', 'Fotoboek Bedrijfsuitje', 'Leeuwarden',
  jsonb_build_array(
    jsonb_build_object('source', 'game', 'path', :'team1' || '/_teamfoto/1.jpg', 'caption', 'Vossen', 'large', true),
    jsonb_build_object('source', 'own', 'path', '5a100000-0000-0000-0000-000000000001/eigen/a.jpg', 'caption', 'Start'),
    jsonb_build_object('source', 'stock', 'path', 'huisstijl/0a100000-0000-0000-0000-00000000000a/a.jpg', 'caption', ''),
    -- foto's van een andere sessie of organisatie horen er niet in en worden nooit gedeeld
    jsonb_build_object('source', 'game', 'path', :'team2' || '/fotomissie/1.jpg', 'caption', 'Elders'),
    jsonb_build_object('source', 'own', 'path', '5a100000-0000-0000-0000-000000000002/eigen/b.jpg', 'caption', 'Elders'),
    jsonb_build_object('source', 'stock', 'path', 'huisstijl/0b100000-0000-0000-0000-00000000000b/x.jpg', 'caption', 'Elders')
  ));
insert into storage.objects (bucket_id, name) values ('photobooks', '5a100000-0000-0000-0000-000000000001/eigen/a.jpg');
update public.photobooks set pdf_path = '5a100000-0000-0000-0000-000000000001/fotoboek.pdf', pdf_made_at = now()
where session_id = '5a100000-0000-0000-0000-000000000001';

do $$ begin
  assert (select share_password from public.photobooks) ~ '^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$',
    'wachtwoord in de vorm XXXX-XXXX-XXXX';
end $$;

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
  assert not exists (select 1 from public.photobook_settings), 'andere organisatie ziet de instellingen niet';
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
do $$ begin
  perform public.share_photobook('5a100000-0000-0000-0000-000000000001', true);
  raise exception 'buitenstaander kon delen';
exception when insufficient_privilege then null;
end $$;

select tests.login('c1000000-0000-0000-0000-000000000001');
do $$ begin
  assert not exists (select 1 from public.photobooks), 'speler ziet het fotoboek in de beheerapp niet';
end $$;
do $$ begin
  perform public.shared_photobook('x', 'y');
  raise exception 'speler kon shared_photobook aanroepen';
exception when insufficient_privilege then null;
end $$;

-- ---------------------------------------------------------------------------
-- Link met wachtwoord (via de serverfunctie, met de service role)
-- ---------------------------------------------------------------------------
select tests.logout();
select share_token as token from public.photobooks where session_id = '5a100000-0000-0000-0000-000000000001' \gset
select set_config('tests.token', :'token', false);

do $$ begin
  perform public.shared_photobook(current_setting('tests.token'), (select share_password from public.photobooks));
  raise exception 'niet gedeeld fotoboek toch zichtbaar';
exception when no_data_found then null;
end $$;

select tests.login('a1000000-0000-0000-0000-000000000001');
do $$ begin
  assert public.share_photobook('5a100000-0000-0000-0000-000000000001', true) between now() + interval '27 days' and now() + interval '29 days',
    '28 dagen beschikbaar';
end $$;
select tests.logout();

do $$ begin
  perform public.shared_photobook(current_setting('tests.token'), 'AAAA-BBBB-CCCC');
  raise exception 'verkeerd wachtwoord geaccepteerd';
exception when sqlstate '28P01' then null;
end $$;

do $$
declare
  b jsonb := public.shared_photobook(current_setting('tests.token'), lower((select share_password from public.photobooks)));
begin
  assert b ->> 'title' = 'Fotoboek Bedrijfsuitje' and b ->> 'city' = 'Leeuwarden', 'titel en stad';
  assert jsonb_array_length(b -> 'items') = 3, 'alleen foto''s van de eigen sessie en organisatie: ' || (b -> 'items')::text;
  assert b #>> '{items,0,source}' = 'game' and (b #>> '{items,0,large}')::boolean, 'volgorde en opmaak blijven';
  assert b #>> '{items,1,caption}' = 'Start', 'eigen foto';
  assert b #>> '{items,2,source}' = 'stock', 'vaste foto';
  assert jsonb_array_length(b -> 'teams') = 1 and b #>> '{teams,0,name}' = 'Vossen', 'cijfers van gestarte teams';
  assert b ->> 'cover_path' like 'huisstijl/%', 'omslagfoto';
  assert b #>> '{links,google_review}' = 'https://example.com/review', 'links';
  assert b ->> 'pdf_path' like '5a100000-0000-0000-0000-000000000001/%', 'pdf';
end $$;

-- Na 28 dagen is het fotoboek verlopen.
update public.photobooks set shared_until = now() - interval '1 minute';
do $$ begin
  perform public.shared_photobook(current_setting('tests.token'), (select share_password from public.photobooks));
  raise exception 'verlopen fotoboek toch zichtbaar';
exception when sqlstate 'HT410' then null;
end $$;

-- Nieuwe link: de oude link werkt niet meer en er is een nieuw wachtwoord.
select share_password as oldpw from public.photobooks \gset
select tests.login('a1000000-0000-0000-0000-000000000001');
select public.share_photobook('5a100000-0000-0000-0000-000000000001', true);
select public.rotate_photobook_token('5a100000-0000-0000-0000-000000000001');
select tests.logout();
select set_config('tests.oldpw', :'oldpw', false);
do $$ begin
  assert (select share_token from public.photobooks) <> current_setting('tests.token'), 'nieuwe link';
  assert (select share_password from public.photobooks) <> current_setting('tests.oldpw'), 'nieuw wachtwoord';
  perform public.shared_photobook(current_setting('tests.token'), (select share_password from public.photobooks));
  raise exception 'oude link werkt nog';
exception when no_data_found then null;
end $$;

\echo Alle fotoboek-tests geslaagd
rollback;
