-- Tests voor spelleiders in de game-app (migratie 20261120000000).
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
  ('fa000000-0000-0000-0000-000000000001', false),  -- beheerder
  ('fa000000-0000-0000-0000-000000000002', true),   -- team Vossen
  ('fa000000-0000-0000-0000-000000000003', true),   -- spelleider Piet
  ('fa000000-0000-0000-0000-000000000004', true),   -- spelleider Anna
  ('fa000000-0000-0000-0000-000000000005', true),   -- Piet op een andere telefoon
  ('fa000000-0000-0000-0000-000000000006', true);   -- een derde spelleider

select tests.login('fa000000-0000-0000-0000-000000000001');
select stub.create_organization('Hunters BV') as org \gset
insert into public.games (id, org_id, layer, slug, languages, default_language)
values ('6fa00000-0000-0000-0000-000000000001', :'org', 'base', 'hunters-spel', array['nl'], 'nl');
reset role;
insert into public.game_versions (id, game_id, version, package) values
  ('7fa00000-0000-0000-0000-000000000001', '6fa00000-0000-0000-0000-000000000001', 1, '{"languages":["nl"]}');
select tests.login('fa000000-0000-0000-0000-000000000001');
insert into public.sessions (id, org_id, game_version_id, name, join_code, status, team_chat, max_leaders) values
  ('5fa00000-0000-0000-0000-000000000001', :'org', '7fa00000-0000-0000-0000-000000000001', 'Jacht', 'JACHT', 'open', true, 2);
insert into public.sessions (id, org_id, game_version_id, name, join_code, status)
values ('5fa00000-0000-0000-0000-000000000002', :'org', '7fa00000-0000-0000-0000-000000000001', 'Standaard', 'STAND', 'open');
do $$ begin
  assert (select max_leaders from public.sessions where id = '5fa00000-0000-0000-0000-000000000002') = 20, 'standaard 20 spelleiders';
end $$;
select public.leader_code('5fa00000-0000-0000-0000-000000000001') as code \gset
select set_config('tests.code', :'code', false);
do $$ begin
  assert length(current_setting('tests.code')) = 6, 'code van zes tekens';
  assert public.leader_code('5fa00000-0000-0000-0000-000000000001') = current_setting('tests.code'), 'zelfde code opnieuw';
end $$;

-- Een team doet mee.
select tests.login('fa000000-0000-0000-0000-000000000002');
select (public.join_session('JACHT', 'Vossen', 'nl', '0612345678')).id as vossen \gset
select set_config('tests.vossen', :'vossen', false);
insert into public.positions (team_id, lat, lng, accuracy, recorded_at)
values (:'vossen', 53.2, 5.8, 5, now());
do $$ begin
  -- Een team maakt geen code en is geen spelleider.
  begin
    perform public.leader_code('5fa00000-0000-0000-0000-000000000001');
    raise exception 'team maakte een spelleider-code';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.leader_session('5fa00000-0000-0000-0000-000000000001');
    raise exception 'team zag het spelleider-overzicht';
  exception when no_data_found then null;
  end;
end $$;

-- Piet logt in als spelleider.
select tests.login('fa000000-0000-0000-0000-000000000003');
do $$
declare
  j jsonb := public.leader_join(lower(current_setting('tests.code')), ' Piet ');
  d jsonb;
begin
  assert j ->> 'name' = 'Piet', 'naam zonder spaties';
  assert j ->> 'session_name' = 'Jacht', 'naam van de hunt';
  begin
    perform public.leader_join('XXXXXX', 'Piet');
    raise exception 'verkeerde code werkte';
  exception when no_data_found then null;
  end;
  begin
    perform public.leader_join(current_setting('tests.code'), '  ');
    raise exception 'lege naam';
  exception when invalid_parameter_value then null;
  end;
  perform public.leader_position('5fa00000-0000-0000-0000-000000000001', 53.21, 5.81, 8);
  d := public.leader_session('5fa00000-0000-0000-0000-000000000001');
  assert d #>> '{session,name}' = 'Jacht', 'hunt';
  assert d #>> '{teams,0,phone}' = '0612345678', 'telefoonnummer';
  assert not (d #> '{teams,0}') ? 'team_code', 'geen teamcode';
  assert jsonb_array_length(d -> 'positions') = 1, 'positie van het team';
  assert d #>> '{leaders,0,name}' = 'Piet', 'zichzelf';
  assert (d #>> '{leaders,0,me}')::boolean, 'eigen positie herkend';
  assert (d #>> '{leaders,0,lat}')::float = 53.21, 'eigen positie';
  assert public.leader_bump_caught('5fa00000-0000-0000-0000-000000000001', current_setting('tests.vossen')::uuid, 1) = 1, 'gepakt';
  assert public.leader_send_message('5fa00000-0000-0000-0000-000000000001', ' Wij komen eraan ') ->> 'sender_name' = 'The Hunters',
    'bericht als The Hunters';
  assert public.leader_messages('5fa00000-0000-0000-0000-000000000001') #>> '{0,body}' = 'Wij komen eraan', 'chat lezen';
  begin
    perform public.leader_send_message('5fa00000-0000-0000-0000-000000000001', '');
    raise exception 'leeg bericht';
  exception when invalid_parameter_value then null;
  end;
end $$;

-- Anna logt in en ziet Piet; een derde past niet meer (maximaal 2).
select tests.login('fa000000-0000-0000-0000-000000000004');
do $$ begin
  perform public.leader_join(current_setting('tests.code'), 'Anna');
  begin
    perform public.leader_join(current_setting('tests.code'), 'piet');
    raise exception 'naam van een ander overgenomen terwijl al ingelogd';
  exception when unique_violation then null;
  end;
  assert jsonb_array_length(public.leader_session('5fa00000-0000-0000-0000-000000000001') -> 'leaders') = 2, 'ziet elkaar';
end $$;
select tests.login('fa000000-0000-0000-0000-000000000006');
do $$ begin
  begin
    perform public.leader_join(current_setting('tests.code'), 'Klaas');
    raise exception 'meer spelleiders dan het maximum';
  exception when others then
    assert sqlstate = 'P0006', 'maximum bereikt: ' || sqlerrm;
  end;
end $$;

-- Piet gaat verder op een andere telefoon: telt niet als extra spelleider.
select tests.login('fa000000-0000-0000-0000-000000000005');
do $$ begin
  perform public.leader_join(current_setting('tests.code'), 'PIET');
  assert jsonb_array_length(public.leader_session('5fa00000-0000-0000-0000-000000000001') -> 'leaders') = 2, 'nog steeds twee';
end $$;
select tests.login('fa000000-0000-0000-0000-000000000003');
do $$ begin
  begin
    perform public.leader_session('5fa00000-0000-0000-0000-000000000001');
    raise exception 'oude telefoon van Piet is nog spelleider';
  exception when no_data_found then null;
  end;
end $$;

-- Teams zien de spelleiders niet.
select tests.login('fa000000-0000-0000-0000-000000000002');
do $$ begin
  assert (select count(*) from public.session_leaders) = 0, 'team ziet geen spelleiders';
  begin
    perform public.leader_position('5fa00000-0000-0000-0000-000000000001', 1, 1, 1);
    raise exception 'team stuurde een spelleiderpositie';
  exception when no_data_found then null;
  end;
end $$;

-- De beheerder ziet de spelleiders; een nieuwe code meldt iedereen af.
select tests.login('fa000000-0000-0000-0000-000000000001');
do $$ begin
  assert (select count(*) from public.session_leaders) = 2, 'beheer ziet spelleiders';
  assert public.leader_code('5fa00000-0000-0000-0000-000000000001', true) <> current_setting('tests.code'), 'nieuwe code';
  assert (select count(*) from public.session_leaders) = 0, 'iedereen afgemeld';
end $$;
select tests.login('fa000000-0000-0000-0000-000000000004');
do $$ begin
  begin
    perform public.leader_join(current_setting('tests.code'), 'Anna');
    raise exception 'oude code werkt nog';
  exception when no_data_found then null;
  end;
end $$;

-- Afmelden, en opruimen na 28 dagen.
select tests.login('fa000000-0000-0000-0000-000000000001');
select public.leader_code('5fa00000-0000-0000-0000-000000000001') as code2 \gset
select tests.login('fa000000-0000-0000-0000-000000000004');
select public.leader_join(:'code2', 'Anna') is not null;
select public.leader_leave('5fa00000-0000-0000-0000-000000000001');
select public.leader_join(:'code2', 'Anna') is not null;
reset role;
update public.sessions set anonymized_at = now() where id = '5fa00000-0000-0000-0000-000000000001';
do $$ begin
  assert (select leader_code from public.sessions where id = '5fa00000-0000-0000-0000-000000000001') is null, 'code weg';
  assert (select count(*) from public.session_leaders) = 0, 'spelleiders weg';
end $$;

\echo Alle tests voor spelleiders in de app geslaagd
rollback;
