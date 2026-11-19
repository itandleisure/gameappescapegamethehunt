-- Tests voor een foto in de teamchat (migratie 20261120070000).
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
  ('fb000000-0000-0000-0000-000000000003', true),   -- spelleider Piet
  ('fb000000-0000-0000-0000-000000000004', true),   -- spelleider van een andere hunt
  ('fb000000-0000-0000-0000-000000000005', true);   -- team in een andere hunt

select tests.login('fb000000-0000-0000-0000-000000000001');
select stub.create_organization('Chatfoto BV') as org \gset
insert into public.games (id, org_id, layer, slug, languages, default_language)
values ('6fb00000-0000-0000-0000-000000000001', :'org', 'base', 'chatfoto-spel', array['nl'], 'nl');
reset role;
insert into public.game_versions (id, game_id, version, package) values
  ('7fb00000-0000-0000-0000-000000000001', '6fb00000-0000-0000-0000-000000000001', 1, '{"languages":["nl"]}');
select tests.login('fb000000-0000-0000-0000-000000000001');
insert into public.sessions (id, org_id, game_version_id, name, join_code, status, team_chat) values
  ('5fb00000-0000-0000-0000-000000000001', :'org', '7fb00000-0000-0000-0000-000000000001', 'Jacht', 'FOTOA', 'open', true),
  ('5fb00000-0000-0000-0000-000000000002', :'org', '7fb00000-0000-0000-0000-000000000001', 'Andere', 'FOTOB', 'open', true);
select public.leader_code('5fb00000-0000-0000-0000-000000000001') as code \gset
select public.leader_code('5fb00000-0000-0000-0000-000000000002') as code2 \gset
-- Een eigen foto van het beheer (geen chatfoto).
insert into storage.objects (bucket_id, name) values ('photobooks', '5fb00000-0000-0000-0000-000000000001/eigen/beheer.jpg');

select tests.login('fb000000-0000-0000-0000-000000000002');
select public.join_session('FOTOA', 'Vossen', 'nl', '0612345678');
select tests.login('fb000000-0000-0000-0000-000000000005');
select public.join_session('FOTOB', 'Dassen', 'nl', '0687654321');
select tests.login('fb000000-0000-0000-0000-000000000003');
select public.leader_join(:'code', 'Piet');
select tests.login('fb000000-0000-0000-0000-000000000004');
select public.leader_join(:'code2', 'Klaas');

-- Een spelleider van een andere hunt uploadt niets in deze hunt.
do $$ begin
  begin
    insert into storage.objects (bucket_id, name)
    values ('photobooks', '5fb00000-0000-0000-0000-000000000001/eigen/chat-9fb00000-0000-0000-0000-000000000009.jpg');
    raise exception 'spelleider van een andere hunt uploadde een foto';
  exception when insufficient_privilege then null;
  end;
end $$;

-- Piet zet een foto in de teamchat.
select tests.login('fb000000-0000-0000-0000-000000000003');
do $$
declare
  v_photo uuid := '9fb00000-0000-0000-0000-000000000001';
  v_path text := '5fb00000-0000-0000-0000-000000000001/eigen/chat-' || v_photo || '.jpg';
  j jsonb;
begin
  -- Alleen chatfoto's, niet zomaar iets in het fotoboek.
  begin
    insert into storage.objects (bucket_id, name) values ('photobooks', '5fb00000-0000-0000-0000-000000000001/eigen/x.jpg');
    raise exception 'spelleider uploadde een andere foto';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into storage.objects (bucket_id, name) values ('photobooks', '5fb00000-0000-0000-0000-000000000001/fotoboek.pdf');
    raise exception 'spelleider overschreef het fotoboek';
  exception when insufficient_privilege then null;
  end;
  -- Zonder geüploade foto geen bericht.
  begin
    perform public.leader_send_photo('5fb00000-0000-0000-0000-000000000001', v_photo);
    raise exception 'bericht zonder foto';
  exception when invalid_parameter_value then null;
  end;

  insert into storage.objects (bucket_id, name) values ('photobooks', v_path);
  j := public.leader_send_photo('5fb00000-0000-0000-0000-000000000001', v_photo, ' Vossen gepakt! ');
  assert j ->> 'sender_name' = 'The Hunters', 'als The Hunters';
  assert j ->> 'body' = 'Vossen gepakt!', 'tekst bij de foto';
  assert j ->> 'photo_path' = v_path, 'pad van de foto';
  -- Nog een keer (antwoord kwijt): niets dubbel.
  perform public.leader_send_photo('5fb00000-0000-0000-0000-000000000001', v_photo);
  j := public.leader_messages('5fb00000-0000-0000-0000-000000000001');
  assert jsonb_array_length(j) = 1, 'één bericht';
  assert j #>> '{0,photo_path}' = v_path, 'foto in de teamchat van de app';
  assert (select count(*) from storage.objects) = 1, 'spelleider leest alleen de chatfoto';

  -- Zonder tekst een fototje als tekst.
  insert into storage.objects (bucket_id, name)
  values ('photobooks', '5fb00000-0000-0000-0000-000000000001/eigen/chat-9fb00000-0000-0000-0000-000000000002.jpg');
  assert public.leader_send_photo('5fb00000-0000-0000-0000-000000000001', '9fb00000-0000-0000-0000-000000000002', '  ') ->> 'body' = '📷',
    'lege tekst';
end $$;

-- Het team ziet het bericht en de chatfoto's, maar niet de andere eigen foto's.
select tests.login('fb000000-0000-0000-0000-000000000002');
do $$ begin
  assert (select count(*) from public.messages where photo_path is not null) = 2, 'team ziet de foto-berichten';
  assert (select count(*) from storage.objects) = 2, 'team leest alleen de chatfoto''s';
  -- Een team zet zelf geen foto in een bericht.
  insert into public.messages (id, session_id, team_id, sender, sender_user, channel, body, photo_path)
  values ('9fb00000-0000-0000-0000-000000000003', '5fb00000-0000-0000-0000-000000000001',
          (select id from public.teams where name = 'Vossen'), 'team', auth.uid(), 'teams', 'Haha',
          '5fb00000-0000-0000-0000-000000000001/eigen/beheer.jpg');
  assert (select photo_path is null from public.messages where id = '9fb00000-0000-0000-0000-000000000003'), 'team zet geen foto';
  begin
    insert into storage.objects (bucket_id, name)
    values ('photobooks', '5fb00000-0000-0000-0000-000000000001/eigen/chat-9fb00000-0000-0000-0000-000000000004.jpg');
    raise exception 'team uploadde een chatfoto';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.leader_send_photo('5fb00000-0000-0000-0000-000000000001', '9fb00000-0000-0000-0000-000000000001');
    raise exception 'team stuurde een foto als spelleider';
  exception when no_data_found then null;
  end;
end $$;

-- Een team en een spelleider van een andere hunt zien de foto's niet.
select tests.login('fb000000-0000-0000-0000-000000000005');
do $$ begin
  assert (select count(*) from storage.objects) = 0, 'team van een andere hunt';
end $$;
select tests.login('fb000000-0000-0000-0000-000000000004');
do $$ begin
  assert (select count(*) from storage.objects) = 0, 'spelleider van een andere hunt';
  begin
    perform public.leader_send_photo('5fb00000-0000-0000-0000-000000000001', '9fb00000-0000-0000-0000-000000000001');
    raise exception 'spelleider van een andere hunt';
  exception when no_data_found then null;
  end;
end $$;

-- Het beheer ziet de chatfoto bij de eigen foto's van het fotoboek.
select tests.login('fb000000-0000-0000-0000-000000000001');
do $$ begin
  assert (select count(*) from storage.objects where name like '5fb00000-0000-0000-0000-000000000001/eigen/%') = 3, 'beheer ziet alle eigen foto''s';
end $$;

\echo Alle tests voor een foto in de teamchat geslaagd
rollback;
