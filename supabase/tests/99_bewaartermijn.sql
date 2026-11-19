-- Tests voor de bewaartermijn van 28 dagen (migratie 20261119930000_bewaartermijn).
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
  ('f5000000-0000-0000-0000-000000000001', false),
  ('f5000000-0000-0000-0000-000000000002', true),
  ('f5000000-0000-0000-0000-000000000003', true);

select tests.login('f5000000-0000-0000-0000-000000000001');
select stub.create_organization('Bewaar BV') as org \gset
insert into public.games (id, org_id, layer, slug, languages, default_language)
values ('6f500000-0000-0000-0000-000000000001', :'org', 'base', 'bewaar-spel', array['nl'], 'nl');
reset role;
insert into public.game_versions (id, game_id, version, package) values
  ('7f500000-0000-0000-0000-000000000001', '6f500000-0000-0000-0000-000000000001', 1, '{"languages":["nl"]}');
select tests.login('f5000000-0000-0000-0000-000000000001');
insert into public.sessions (id, org_id, game_version_id, name, join_code, status) values
  ('5f500000-0000-0000-0000-000000000001', :'org', '7f500000-0000-0000-0000-000000000001', 'Oude hunt', 'OUDHT', 'open'),
  ('5f500000-0000-0000-0000-000000000002', :'org', '7f500000-0000-0000-0000-000000000001', 'Nieuwe hunt', 'NIEUW', 'open');

select tests.login('f5000000-0000-0000-0000-000000000002');
select (public.join_session('OUDHT', 'De Winnaars', 'nl', '0612345678')).id as oud \gset
select public.start_team(:'oud');
select public.record_positions(:'oud', jsonb_build_array(
  jsonb_build_object('lat', 53.2000, 'lng', 5.7900, 'accuracy', 5, 'at', extract(epoch from now()) * 1000 + 1000),
  jsonb_build_object('lat', 53.2010, 'lng', 5.7900, 'accuracy', 5, 'at', extract(epoch from now()) * 1000 + 60000)));
insert into public.photos (team_id, task_key, path) values (:'oud', '_team', :'oud' || '/_team/a.jpg');
insert into public.events (id, team_id, type, task_key, client_time) values
  ('e5000000-0000-0000-0000-000000000001', :'oud', 'answered', 'puzzel-1', now());
insert into public.messages (session_id, team_id, sender, sender_user, body)
  values ('5f500000-0000-0000-0000-000000000001', :'oud', 'team', auth.uid(), 'Hallo');
select tests.login('f5000000-0000-0000-0000-000000000003');
select (public.join_session('NIEUW', 'Nog Bezig', 'nl', '0687654321')).id as nieuw \gset

-- De oude hunt was 30 dagen geleden.
reset role;
update public.sessions set created_at = now() - interval '30 days' where id = '5f500000-0000-0000-0000-000000000001';
update public.teams set created_at = now() - interval '30 days', started_at = now() - interval '30 days',
  ended_at = now() - interval '30 days' + interval '2 hours' where id = :'oud';
update public.positions set recorded_at = recorded_at - interval '30 days' where team_id = :'oud';

-- Niet aanroepbaar voor gewone gebruikers.
select tests.login('f5000000-0000-0000-0000-000000000001');
do $$ begin
  begin
    perform public.anonymize_session('5f500000-0000-0000-0000-000000000001');
    raise exception 'spelleiding kon anonymize_session aanroepen';
  exception when insufficient_privilege then null;
  end;
  begin
    perform * from public.expired_sessions();
    raise exception 'spelleiding kon expired_sessions aanroepen';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- Alleen de oude hunt is verlopen, met zijn foto.
do $$ begin
  assert (select count(*) from public.expired_sessions()) = 1, 'een verlopen hunt';
  assert (select session_id from public.expired_sessions()) = '5f500000-0000-0000-0000-000000000001', 'de oude hunt';
  assert (select cardinality(photo_paths) from public.expired_sessions()) = 1, 'met de foto';
end $$;

-- Een fotoboek dat nog gedeeld is, houdt de hunt vast.
insert into public.photobooks (session_id, shared, shared_until) values ('5f500000-0000-0000-0000-000000000001', true, now() + interval '3 days');
do $$ begin
  assert (select count(*) from public.expired_sessions()) = 0, 'gedeeld fotoboek wacht';
end $$;
update public.photobooks set shared_until = now() - interval '1 day';

select public.anonymize_session('5f500000-0000-0000-0000-000000000001');
do $$
declare
  t public.teams;
begin
  select * into t from public.teams where session_id = '5f500000-0000-0000-0000-000000000001';
  assert t.name = 'Team 1', 'teamnaam geanonimiseerd';
  assert t.distance_m > 100, format('afstand bewaard: %s', t.distance_m);
  assert t.started_at is not null and t.ended_at is not null, 'tijden bewaard';
  assert not exists (select 1 from public.team_contacts where team_id = t.id), 'telefoonnummer weg';
  assert not exists (select 1 from public.positions where team_id = t.id), 'route weg';
  assert not exists (select 1 from public.photos where team_id = t.id), 'foto weg';
  assert not exists (select 1 from public.team_members where team_id = t.id), 'koppeling met telefoons weg';
  assert not exists (select 1 from public.messages where session_id = t.session_id), 'chat weg';
  assert not exists (select 1 from public.photobooks where session_id = t.session_id), 'fotoboek weg';
  assert exists (select 1 from public.events where team_id = t.id), 'antwoorden bewaard voor de rapportage';
  assert (select anonymized_at is not null and status = 'closed' from public.sessions where id = t.session_id), 'hunt gemarkeerd';
  assert (public.build_session_results(t.session_id) -> 'teams' -> 0 ->> 'distance_m')::int = t.distance_m, 'afstand in de resultaten';
  assert (select count(*) from public.expired_sessions()) = 0, 'niet nog een keer';
  -- De nieuwe hunt is onaangeroerd.
  assert (select name from public.teams where session_id = '5f500000-0000-0000-0000-000000000002') = 'Nog Bezig', 'nieuwe hunt blijft';
  assert exists (select 1 from public.team_contacts c join public.teams x on x.id = c.team_id
                 where x.session_id = '5f500000-0000-0000-0000-000000000002'), 'nummer nieuwe hunt blijft';
end $$;

-- De spelleiding kan een hunt zelf helemaal verwijderen.
select tests.login('f5000000-0000-0000-0000-000000000001');
delete from public.sessions where id = '5f500000-0000-0000-0000-000000000002';
reset role;
do $$ begin
  assert not exists (select 1 from public.sessions where id = '5f500000-0000-0000-0000-000000000002'), 'hunt verwijderd';
  assert (select count(*) from public.team_contacts) = 0, 'met alles erin';
end $$;

\echo Alle tests voor de bewaartermijn geslaagd
rollback;
