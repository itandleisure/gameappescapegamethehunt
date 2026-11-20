-- Tests voor de algemene instellingen (menu Instellingen): alleen leden lezen
-- ze, redacteur of hoger wijzigt ze, en het fotoboek gebruikt de ingestelde
-- termijn, de bedrijfsnaam, het logo, de contactgegevens en eigen teksten.
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
  ('a2000000-0000-0000-0000-000000000001'),  -- spelleider
  ('a2000000-0000-0000-0000-000000000002'),  -- redacteur
  ('b2000000-0000-0000-0000-000000000001');  -- andere organisatie
insert into public.organizations (id, name, is_platform) values
  ('0a200000-0000-0000-0000-00000000000a', 'The Hunt', true), ('0b200000-0000-0000-0000-00000000000b', 'Ander', true);
insert into public.memberships values
  ('0a200000-0000-0000-0000-00000000000a', 'a2000000-0000-0000-0000-000000000001', 'instructor'),
  ('0a200000-0000-0000-0000-00000000000a', 'a2000000-0000-0000-0000-000000000002', 'editor'),
  ('0b200000-0000-0000-0000-00000000000b', 'b2000000-0000-0000-0000-000000000001', 'owner');
insert into public.games (id, org_id, layer, slug) values ('6a200000-0000-0000-0000-000000000001', '0a200000-0000-0000-0000-00000000000a', 'base', 'instellingen-spel');
insert into public.game_versions (id, game_id, version, package) values
  ('7a200000-0000-0000-0000-000000000001', '6a200000-0000-0000-0000-000000000001', 1, '{"languages":["nl"]}');
insert into public.sessions (id, org_id, game_version_id, name, join_code, status) values
  ('5a200000-0000-0000-0000-000000000001', '0a200000-0000-0000-0000-00000000000a', '7a200000-0000-0000-0000-000000000001', 'Uitje', 'INST01', 'open');
-- Oude situatie: contactgegevens bij de links van het fotoboek.
insert into public.photobook_settings (org_id, links) values
  ('0a200000-0000-0000-0000-00000000000a', '{"google_review": "https://example.com/review", "email": "oud@example.com"}');

-- Zonder instellingen: 28 dagen.
do $$ begin
  assert public.photobook_share_days('0a200000-0000-0000-0000-00000000000a') = 28, 'standaard 28 dagen';
end $$;

-- Een spelleider leest, maar wijzigt niet.
select tests.login('a2000000-0000-0000-0000-000000000001');
do $$ begin
  insert into public.org_settings (org_id, settings) values ('0a200000-0000-0000-0000-00000000000a', '{}');
  raise exception 'spelleider wijzigde de instellingen';
exception when insufficient_privilege then null;
end $$;

-- Een redacteur stelt in.
select tests.login('a2000000-0000-0000-0000-000000000002');
insert into public.org_settings (org_id, settings) values ('0a200000-0000-0000-0000-00000000000a', jsonb_build_object(
  'company', jsonb_build_object('name', 'Stadsjacht', 'group', 'Spelgroep', 'email', 'info@stadsjacht.nl',
                                'logo_path', 'huisstijl/0a200000-0000-0000-0000-00000000000a/logo.png'),
  'photobook', jsonb_build_object('share_days', 10, 'texts', jsonb_build_object('nl', jsonb_build_object('thanks', 'Tot ziens!')))));
insert into public.photobooks (session_id, title) values ('5a200000-0000-0000-0000-000000000001', 'Fotoboek');
do $$ begin
  assert public.share_photobook('5a200000-0000-0000-0000-000000000001', true) between now() + interval '9 days' and now() + interval '11 days',
    'ingestelde termijn van 10 dagen';
end $$;

select tests.login('a2000000-0000-0000-0000-000000000001');
do $$ begin
  assert (select settings #>> '{company,name}' from public.org_settings) = 'Stadsjacht', 'spelleider ziet de instellingen';
end $$;

-- Een andere organisatie ziet niets en kan niets wijzigen.
select tests.login('b2000000-0000-0000-0000-000000000001');
do $$ begin
  assert not exists (select 1 from public.org_settings), 'andere organisatie ziet de instellingen niet';
  update public.org_settings set settings = '{}';
  assert (select count(*) from public.org_settings where settings = '{}') = 0, 'andere organisatie wijzigt niets';
end $$;
select tests.logout();
do $$ begin
  assert (select settings #>> '{company,name}' from public.org_settings where org_id = '0a200000-0000-0000-0000-00000000000a') = 'Stadsjacht',
    'instellingen ongewijzigd';
end $$;

-- De klant krijgt naam, logo, eigen teksten en de contactgegevens van het bedrijf.
do $$
declare
  b jsonb := public.shared_photobook((select share_token from public.photobooks), (select share_password from public.photobooks));
begin
  assert b #>> '{company,name}' = 'Stadsjacht' and b #>> '{company,group}' = 'Spelgroep', 'bedrijfsnaam: ' || (b -> 'company')::text;
  assert b #>> '{company,logo_path}' = 'huisstijl/0a200000-0000-0000-0000-00000000000a/logo.png', 'eigen logo';
  assert b #>> '{texts,nl,thanks}' = 'Tot ziens!', 'eigen teksten';
  assert b #>> '{links,email}' = 'info@stadsjacht.nl', 'e-mail van het bedrijf gaat voor';
  assert b #>> '{links,google_review}' = 'https://example.com/review', 'andere links blijven';
end $$;

-- Een logo van een andere organisatie gaat nooit mee.
update public.org_settings set settings = jsonb_set(settings, '{company,logo_path}', '"huisstijl/0b200000-0000-0000-0000-00000000000b/logo.png"')
where org_id = '0a200000-0000-0000-0000-00000000000a';
do $$ begin
  assert public.shared_photobook((select share_token from public.photobooks), (select share_password from public.photobooks))
    #>> '{company,logo_path}' is null, 'logo van een andere organisatie';
end $$;

\echo Alle instellingen-tests geslaagd
rollback;
