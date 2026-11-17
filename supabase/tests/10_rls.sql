-- Tests voor de toegangsregels (row level security) en de inlogfuncties.
-- Draait in één transactie die aan het eind wordt teruggedraaid.
\set ON_ERROR_STOP on
begin;

-- Hulpfuncties om als een bepaalde gebruiker te handelen.
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

-- Vaste ids
\set frans      '''a0000000-0000-0000-0000-000000000001'''
\set editor     '''a0000000-0000-0000-0000-000000000002'''
\set instructor '''a0000000-0000-0000-0000-000000000003'''
\set other      '''b0000000-0000-0000-0000-000000000001'''
\set orgA       '''0a000000-0000-0000-0000-00000000000a'''
\set orgB       '''0b000000-0000-0000-0000-00000000000b'''

insert into auth.users (id, email) values
  (:frans, 'frans@example.test'), (:editor, 'editor@example.test'),
  (:instructor, 'instructeur@example.test'), (:other, 'ander@example.test');
insert into auth.users (id, is_anonymous)
  select ('c0000000-0000-0000-0000-00000000000' || n)::uuid, true from generate_series(1, 9) n;

insert into public.organizations (id, name) values (:orgA, 'Badass Games'), (:orgB, 'World of City Escapes');
insert into public.memberships (org_id, user_id, role) values
  (:orgA, :frans, 'owner'), (:orgA, :editor, 'editor'), (:orgA, :instructor, 'instructor'), (:orgB, :other, 'admin');

insert into public.games (id, org_id, layer, slug) values
  ('6a000000-0000-0000-0000-000000000001', :orgA, 'base', 'the-hunt'),
  ('6b000000-0000-0000-0000-000000000001', :orgB, 'base', 'varna');
insert into public.games (id, org_id, parent_id, layer, slug) values
  ('6a000000-0000-0000-0000-000000000002', :orgA, '6a000000-0000-0000-0000-000000000001', 'city', 'the-hunt-leeuwarden');
insert into public.game_versions (id, game_id, version, package) values
  ('7a000000-0000-0000-0000-000000000001', '6a000000-0000-0000-0000-000000000002', 1, '{"languages":["nl","en"]}'),
  ('7b000000-0000-0000-0000-000000000001', '6b000000-0000-0000-0000-000000000001', 1, '{"languages":["nl"]}');
insert into public.sessions (id, org_id, game_version_id, name, join_code, status) values
  ('5a000000-0000-0000-0000-000000000001', :orgA, '7a000000-0000-0000-0000-000000000001', 'Leeuwarden za 14:00', 'HUNT01', 'open'),
  ('5a000000-0000-0000-0000-000000000002', :orgA, '7a000000-0000-0000-0000-000000000001', 'Leeuwarden za 16:00', 'HUNT02', 'open'),
  ('5a000000-0000-0000-0000-000000000003', :orgA, '7a000000-0000-0000-0000-000000000001', 'Oud', 'OLD001', 'closed');

-- ---------------------------------------------------------------------------
-- Beheerders zien alleen hun eigen organisatie
-- ---------------------------------------------------------------------------
select tests.login(:other);
do $$ begin
  assert (select count(*) from public.games) = 1, 'andere organisatie ziet alleen eigen game';
  assert (select count(*) from public.game_versions) = 1, 'andere organisatie ziet alleen eigen versie';
  assert (select count(*) from public.sessions) = 0, 'andere organisatie ziet geen sessies van Badass Games';
end $$;

select tests.login(:editor);
do $$ begin
  assert (select count(*) from public.games) = 2, 'editor ziet beide lagen van Escape Game The Hunt';
  insert into public.games (org_id, layer, slug, parent_id)
    values ('0a000000-0000-0000-0000-00000000000a', 'city', 'the-hunt-amsterdam', '6a000000-0000-0000-0000-000000000001');
  assert (select count(*) from public.games) = 3, 'editor kan een stadsvariant aanmaken';
  begin
    insert into public.games (org_id, layer, slug) values ('0b000000-0000-0000-0000-00000000000b', 'base', 'kaping');
    raise exception 'editor mocht in een andere organisatie schrijven';
  exception when insufficient_privilege then null;
  end;
end $$;

select tests.login(:instructor);
do $$ begin
  assert (select count(*) from public.games) = 3, 'instructeur leest games';
  begin
    insert into public.games (org_id, layer, slug) values ('0a000000-0000-0000-0000-00000000000a', 'base', 'nieuw');
    raise exception 'instructeur mocht een game aanmaken';
  exception when insufficient_privilege then null;
  end;
  assert (select count(*) from public.sessions) = 3, 'instructeur ziet de sessies';
end $$;

-- ---------------------------------------------------------------------------
-- Teams inloggen met code, tracks op volgorde van inloggen
-- ---------------------------------------------------------------------------
do $$
declare
  t public.teams;
begin
  for n in 1..6 loop
    perform tests.login(('c0000000-0000-0000-0000-00000000000' || n)::uuid);
    t := public.join_session(' hunt01 ', 'Team ' || n, 'nl');
    assert t.login_order = n, 'inlogvolgorde klopt';
    assert t.track = ((n - 1) % 5) + 1, format('team %s zit op track %s', n, t.track);
    assert t.team_code ~ '^[A-Z2-9]{6}$', 'teamcode heeft 6 tekens';
  end loop;
  assert t.track = 1, 'team 6 zit weer op track 1';

  perform tests.login('c0000000-0000-0000-0000-000000000009');
  perform public.join_session('HUNT02', 'Ander team', 'en');

  perform tests.login('c0000000-0000-0000-0000-000000000008');
  begin
    perform public.join_session('OLD001', 'Te laat', 'nl');
    raise exception 'gesloten sessie liet een team toe';
  exception when sqlstate 'P0002' then null;
  end;
  begin
    perform public.join_session('HUNT01', 'Duits', 'de');
    raise exception 'onbekende taal werd geaccepteerd';
  exception when sqlstate '22023' then null;
  end;
end $$;

-- Anonieme bezoekers zonder inlog krijgen niets.
select tests.logout();
set local role anon;
do $$ begin
  begin
    perform count(*) from public.games;
    raise exception 'anon kon games lezen';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.join_session('HUNT01', 'Zonder inlog', 'nl');
    raise exception 'anon kon join_session aanroepen';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- Spelers zien alleen hun eigen sessie en team
-- ---------------------------------------------------------------------------
select tests.login('c0000000-0000-0000-0000-000000000001');
do $$
declare
  own uuid;
  other uuid;
begin
  assert (select count(*) from public.sessions) = 1, 'speler ziet alleen de eigen sessie';
  assert (select count(*) from public.game_versions) = 1, 'speler ziet de gespeelde versie';
  assert (select count(*) from public.teams) = 6, 'speler ziet de teams in de eigen sessie (scores)';
  assert (select count(*) from public.games) = 0, 'speler ziet geen beheerdata';
  assert (select count(*) from public.team_members) = 1, 'speler ziet alleen het eigen lidmaatschap';

  select id into own from public.teams where login_order = 1;
  select id into other from public.teams where login_order = 2;

  -- Servertijd wordt altijd door de database gezet.
  insert into public.events (id, team_id, type, task_key, client_time, server_time)
  values ('e0000000-0000-0000-0000-000000000001', own, 'answered', 'puzzel-tangram', now(), '2000-01-01');
  assert (select server_time from public.events where id = 'e0000000-0000-0000-0000-000000000001') = now(),
    'servertijd is niet te vervalsen';

  insert into public.positions (team_id, lat, lng, accuracy, recorded_at) values (own, 53.2, 5.79, 8, now());

  begin
    insert into public.events (id, team_id, type, client_time)
    values ('e0000000-0000-0000-0000-000000000002', other, 'answered', now());
    raise exception 'speler kon voor een ander team schrijven';
  exception when insufficient_privilege then null;
  end;

  update public.events set type = 'gewijzigd';
  delete from public.events;
  assert (select type from public.events where id = 'e0000000-0000-0000-0000-000000000001') = 'answered',
    'gebeurtenissen zijn niet te wijzigen of te wissen';
  update public.teams set score = 99999;
  assert (select max(score) from public.teams) = 0, 'speler kan de score niet aanpassen';

  insert into public.messages (session_id, team_id, sender, sender_user, body)
  values ('5a000000-0000-0000-0000-000000000001', own, 'team', auth.uid(), 'Wij zijn de weg kwijt');
  begin
    insert into public.messages (session_id, team_id, sender, sender_user, body)
    values ('5a000000-0000-0000-0000-000000000001', own, 'staff', auth.uid(), 'Ik doe alsof ik de spelleiding ben');
    raise exception 'speler kon namens de spelleiding schrijven';
  exception when insufficient_privilege then null;
  end;
end $$;

-- Een ander team ziet die gebeurtenissen en chat niet.
select tests.login('c0000000-0000-0000-0000-000000000002');
do $$ begin
  assert (select count(*) from public.events) = 0, 'ander team ziet geen gebeurtenissen van team 1';
  assert (select count(*) from public.positions) = 0, 'ander team ziet geen posities van team 1';
  assert (select count(*) from public.messages) = 0, 'ander team ziet de chat van team 1 niet';
end $$;

-- Een speler uit een andere sessie ziet niets van deze sessie.
select tests.login('c0000000-0000-0000-0000-000000000009');
do $$ begin
  assert (select count(*) from public.teams) = 1, 'speler in andere sessie ziet alleen eigen sessie';
  assert (select count(*) from public.sessions where join_code = 'HUNT01') = 0, 'andere sessie onzichtbaar';
end $$;

-- ---------------------------------------------------------------------------
-- Spelleiding: live monitor, handmatig openen, berichten aan iedereen
-- ---------------------------------------------------------------------------
select tests.login(:instructor);
do $$
declare
  own uuid;
begin
  select id into own from public.teams where session_id = '5a000000-0000-0000-0000-000000000001' and login_order = 1;
  assert (select count(*) from public.events) = 1, 'spelleiding ziet de gebeurtenissen';
  assert (select count(*) from public.positions) = 1, 'spelleiding ziet de posities';
  insert into public.events (id, team_id, type, task_key, client_time)
  values ('e0000000-0000-0000-0000-000000000003', own, 'manualOpen', 'lokaal-1', now());
  insert into public.messages (session_id, sender, sender_user, body)
  values ('5a000000-0000-0000-0000-000000000001', 'staff', auth.uid(), 'Nog 15 minuten!');
end $$;

select tests.login(:other);
do $$ begin
  assert (select count(*) from public.events) = 0, 'andere organisatie ziet geen gebeurtenissen';
  assert (select count(*) from public.teams) = 0, 'andere organisatie ziet geen teams';
end $$;

select tests.login('c0000000-0000-0000-0000-000000000002');
do $$ begin
  assert (select count(*) from public.messages) = 1, 'bericht aan iedereen komt bij elk team aan';
end $$;

-- ---------------------------------------------------------------------------
-- Verder spelen op een tweede telefoon en de klok starten
-- ---------------------------------------------------------------------------
select tests.logout();
select team_code as code1 from public.teams where session_id = '5a000000-0000-0000-0000-000000000001' and login_order = 1 \gset
select tests.login('c0000000-0000-0000-0000-000000000007');
select public.rejoin_team(lower(:'code1'));
do $$
declare
  t public.teams;
begin
  assert (select count(*) from public.events) = 2, 'tweede telefoon ziet de gebeurtenissen van het team';
  select * into t from public.teams where login_order = 1;
  t := public.start_team(t.id);
  assert t.started_at = now(), 'speeltijd start op servertijd';
  begin
    perform public.start_team((select id from public.teams where login_order = 2));
    raise exception 'speler kon de klok van een ander team starten';
  exception when insufficient_privilege then null;
  end;
end $$;

select tests.logout();
\echo 'Alle RLS-tests geslaagd'
rollback;
