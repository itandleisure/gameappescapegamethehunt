-- Tests voor de foto van een gepakt team (migratie 20261120070000).
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
  ('fb000000-0000-0000-0000-000000000001', false),  -- beheerder
  ('fb000000-0000-0000-0000-000000000002', true),   -- team Vossen
  ('fb000000-0000-0000-0000-000000000003', true),   -- team Dassen
  ('fb000000-0000-0000-0000-000000000004', true),   -- spelleider Piet
  ('fb000000-0000-0000-0000-000000000005', true);   -- spelleider van een andere hunt

select tests.login('fb000000-0000-0000-0000-000000000001');
select stub.create_organization('Gepakt BV') as org \gset
insert into public.games (id, org_id, layer, slug, languages, default_language)
values ('6fb00000-0000-0000-0000-000000000001', :'org', 'base', 'gepakt-spel', array['nl'], 'nl');
reset role;
insert into public.game_versions (id, game_id, version, package) values
  ('7fb00000-0000-0000-0000-000000000001', '6fb00000-0000-0000-0000-000000000001', 1, '{"languages":["nl"]}');
select tests.login('fb000000-0000-0000-0000-000000000001');
insert into public.sessions (id, org_id, game_version_id, name, join_code, status, team_chat) values
  ('5fb00000-0000-0000-0000-000000000001', :'org', '7fb00000-0000-0000-0000-000000000001', 'Jacht', 'GEPAK', 'open', true),
  ('5fb00000-0000-0000-0000-000000000002', :'org', '7fb00000-0000-0000-0000-000000000001', 'Andere', 'ANDER', 'open', true);
select public.leader_code('5fb00000-0000-0000-0000-000000000001') as code \gset
select public.leader_code('5fb00000-0000-0000-0000-000000000002') as code2 \gset

select tests.login('fb000000-0000-0000-0000-000000000002');
select (public.join_session('GEPAK', 'Vossen', 'nl', '0612345678')).id as vossen \gset
select set_config('tests.vossen', :'vossen', false);
select tests.login('fb000000-0000-0000-0000-000000000003');
select (public.join_session('GEPAK', 'Dassen', 'nl', '0687654321')).id as dassen \gset

select tests.login('fb000000-0000-0000-0000-000000000004');
select public.leader_join(:'code', 'Piet');
select tests.login('fb000000-0000-0000-0000-000000000005');
select public.leader_join(:'code2', 'Klaas');

-- Een spelleider van een andere hunt uploadt niets bij de Vossen.
do $$ begin
  begin
    insert into storage.objects (bucket_id, name)
    values ('photos', current_setting('tests.vossen') || '/_gepakt/9fb00000-0000-0000-0000-000000000009.jpg');
    raise exception 'spelleider van een andere hunt uploadde een foto';
  exception when insufficient_privilege then null;
  end;
end $$;

-- Piet pakt de Vossen en maakt een foto.
select tests.login('fb000000-0000-0000-0000-000000000004');
do $$
declare
  v_photo uuid := '9fb00000-0000-0000-0000-000000000001';
  v_path text := current_setting('tests.vossen') || '/_gepakt/' || v_photo || '.jpg';
  j jsonb;
begin
  -- Alleen in de map _gepakt.
  begin
    insert into storage.objects (bucket_id, name) values ('photos', current_setting('tests.vossen') || '/opdracht/x.jpg');
    raise exception 'spelleider uploadde buiten _gepakt';
  exception when insufficient_privilege then null;
  end;
  -- Zonder geüploade foto geen bericht.
  begin
    perform public.leader_caught_photo('5fb00000-0000-0000-0000-000000000001', current_setting('tests.vossen')::uuid, v_photo);
    raise exception 'bericht zonder foto';
  exception when invalid_parameter_value then null;
  end;

  insert into storage.objects (bucket_id, name) values ('photos', v_path);
  j := public.leader_caught_photo('5fb00000-0000-0000-0000-000000000001', current_setting('tests.vossen')::uuid, v_photo);
  assert j ->> 'sender_name' = 'The Hunters', 'als The Hunters';
  assert j ->> 'caught_team' = 'Vossen', 'gepakt team';
  assert j ->> 'photo_path' = v_path, 'pad van de foto';
  assert j ->> 'body' = 'Vossen is gepakt door The Hunters!', 'tekst voor oudere apps';
  -- Nog een keer (antwoord kwijt): niets dubbel.
  perform public.leader_caught_photo('5fb00000-0000-0000-0000-000000000001', current_setting('tests.vossen')::uuid, v_photo);
  j := public.leader_messages('5fb00000-0000-0000-0000-000000000001');
  assert jsonb_array_length(j) = 1, 'één bericht';
  assert j #>> '{0,photo_path}' = v_path, 'foto in de teamchat van de app';
  assert exists (select 1 from storage.objects where name = v_path), 'spelleider leest de foto';
end $$;
reset role;
do $$ begin
  assert (select count(*) from public.photos where task_key = '_gepakt') = 1, 'één foto bij het team, voor fotowall en fotoboek';
end $$;

-- Het andere team ziet het bericht en de foto.
select tests.login('fb000000-0000-0000-0000-000000000003');
do $$ begin
  assert (select caught_team from public.messages where channel = 'teams') = 'Vossen', 'ander team ziet wie er gepakt is';
  assert exists (select 1 from storage.objects where name like current_setting('tests.vossen') || '/_gepakt/%'), 'ander team ziet de foto';
  -- Een team zet zelf geen foto of "gepakt" in een bericht.
  insert into public.messages (id, session_id, team_id, sender, sender_user, channel, body, photo_path, caught_team)
  values ('9fb00000-0000-0000-0000-000000000002', '5fb00000-0000-0000-0000-000000000001',
          (select id from public.teams where name = 'Dassen'), 'team', auth.uid(), 'teams', 'Haha',
          current_setting('tests.vossen') || '/_gepakt/9fb00000-0000-0000-0000-000000000001.jpg', 'Vossen');
  assert (select photo_path is null and caught_team is null from public.messages
           where id = '9fb00000-0000-0000-0000-000000000002'), 'team kan geen gepakt-bericht maken';
  begin
    perform public.leader_caught_photo('5fb00000-0000-0000-0000-000000000001', current_setting('tests.vossen')::uuid,
      '9fb00000-0000-0000-0000-000000000003');
    raise exception 'team deelde een gepakt-foto';
  exception when no_data_found then null;
  end;
end $$;

-- Een spelleider van een andere hunt deelt geen foto van de Vossen.
select tests.login('fb000000-0000-0000-0000-000000000005');
do $$ begin
  begin
    perform public.leader_caught_photo('5fb00000-0000-0000-0000-000000000002', current_setting('tests.vossen')::uuid,
      '9fb00000-0000-0000-0000-000000000001');
    raise exception 'team uit een andere hunt';
  exception when no_data_found then null;
  end;
  assert not exists (select 1 from storage.objects where name like current_setting('tests.vossen') || '/%'), 'leest geen foto''s van een andere hunt';
end $$;

\echo Alle tests voor de foto van een gepakt team geslaagd
rollback;
