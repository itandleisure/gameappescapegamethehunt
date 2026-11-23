-- Tests voor nieuwsflitsen en het eindscherm (migratie 20261123100000).
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
  ('fd000000-0000-0000-0000-000000000001', false),  -- beheerder
  ('fd000000-0000-0000-0000-000000000002', true),   -- team Vossen
  ('fd000000-0000-0000-0000-000000000003', true),   -- spelleider Piet
  ('fd000000-0000-0000-0000-000000000004', true),   -- team Dassen
  ('fd000000-0000-0000-0000-000000000005', true);   -- buitenstaander

select tests.login('fd000000-0000-0000-0000-000000000001');
select stub.create_organization('Flits BV') as org \gset
select set_config('tests.org', :'org', false);
insert into public.games (id, org_id, layer, slug, languages, default_language)
values ('6fd00000-0000-0000-0000-000000000001', :'org', 'base', 'flits', array['nl'], 'nl');
reset role;
insert into public.game_versions (id, game_id, version, package) values
  ('7fd00000-0000-0000-0000-000000000001', '6fd00000-0000-0000-0000-000000000001', 1, '{"languages":["nl"]}');
select tests.login('fd000000-0000-0000-0000-000000000001');
insert into public.sessions (id, org_id, game_version_id, name, join_code, status) values
  ('5fd00000-0000-0000-0000-000000000001', :'org', '7fd00000-0000-0000-0000-000000000001', 'Jacht', 'FLITS1', 'open');
select public.leader_code('5fd00000-0000-0000-0000-000000000001') as code \gset
select set_config('tests.code', :'code', false);

select tests.login('fd000000-0000-0000-0000-000000000002');
select (public.join_session('FLITS1', 'Vossen', 'nl', '0612345678')).id as vossen \gset
select set_config('tests.vossen', :'vossen', false);
select public.start_team(:'vossen');
select tests.login('fd000000-0000-0000-0000-000000000004');
select (public.join_session('FLITS1', 'Dassen', 'nl', '0612345679')).id as dassen \gset
select set_config('tests.dassen', :'dassen', false);
select public.start_team(:'dassen');

-- Vossen lossen een puzzel op (twee keer gemeld: telt één keer) en ontsnappen.
select tests.login('fd000000-0000-0000-0000-000000000002');
do $$ begin
  perform public.team_report_news(current_setting('tests.vossen')::uuid, 'puzzle', 'puzzel-morse');
  perform public.team_report_news(current_setting('tests.vossen')::uuid, 'puzzle', 'puzzel-morse');
  perform public.team_report_news(current_setting('tests.vossen')::uuid, 'escaped');
  begin
    perform public.team_report_news(current_setting('tests.vossen')::uuid, 'leader');
    raise exception 'team stuurde een flits van de spelleider';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.team_report_news(current_setting('tests.dassen')::uuid, 'escaped');
    raise exception 'meldde nieuws voor een ander team';
  exception when insufficient_privilege then null;
  end;
  -- Eigen nieuws krijgt het team zelf niet.
  assert jsonb_array_length(public.team_signals(current_setting('tests.vossen')::uuid, 0, 0) -> 'news') = 0, 'geen eigen nieuws';
end $$;

-- Dassen zien het nieuws van Vossen; een oude app (zonder p_news_since) niet.
select tests.login('fd000000-0000-0000-0000-000000000004');
do $$
declare
  s jsonb := public.team_signals(current_setting('tests.dassen')::uuid, 0, 0);
begin
  assert jsonb_array_length(s -> 'news') = 2, 'twee nieuwtjes: ' || (s -> 'news')::text;
  assert s #>> '{news,0,kind}' = 'puzzle' and s #>> '{news,0,task}' = 'puzzel-morse', 'puzzel';
  assert s #>> '{news,0,team_name}' = 'Vossen', 'teamnaam';
  assert (s #>> '{news,0,n}')::int = 1, 'als eerste';
  assert s #>> '{news,1,kind}' = 'escaped', 'ontsnapt';
  assert (s #>> '{news_auto,puzzle}')::boolean, 'standaard aan';
  assert jsonb_array_length(public.team_signals(current_setting('tests.dassen')::uuid, 0) -> 'news') = 0, 'oude app';
  assert jsonb_array_length(public.team_signals(current_setting('tests.dassen')::uuid, 0, (s #>> '{news,1,at}')::double precision) -> 'news') = 0, 'al gezien';
  perform public.team_report_news(current_setting('tests.dassen')::uuid, 'puzzle', 'puzzel-morse');
end $$;

-- Het tweede team met dezelfde puzzel krijgt n = 2.
select tests.login('fd000000-0000-0000-0000-000000000002');
do $$
declare
  s jsonb := public.team_signals(current_setting('tests.vossen')::uuid, 0, 0);
begin
  assert jsonb_array_length(s -> 'news') = 1, 'puzzel van Dassen';
  assert (s #>> '{news,0,n}')::int = 2, 'tweede team';
end $$;

-- Puzzelflitsen uit in de instellingen: niet meer meegestuurd.
reset role;
insert into public.org_settings (org_id, settings) values (current_setting('tests.org')::uuid, '{"news":{"auto":{"puzzle":false},"presets":[{"id":"x","icon":"⏳","title":{"nl":"Nog even"}}]}}');
select tests.login('fd000000-0000-0000-0000-000000000004');
do $$
declare
  s jsonb := public.team_signals(current_setting('tests.dassen')::uuid, 0, 0);
begin
  assert jsonb_array_length(s -> 'news') = 1 and s #>> '{news,0,kind}' = 'escaped', 'alleen ontsnapt';
  assert not (s #>> '{news_auto,puzzle}')::boolean, 'puzzel uit';
  assert (s #>> '{news_auto,timeLeft}')::boolean, 'tijd aan';
end $$;

-- Spelleider Piet stuurt een flits; teams kunnen dat niet.
select tests.login('fd000000-0000-0000-0000-000000000003');
do $$
declare
  n jsonb;
begin
  perform public.leader_join(current_setting('tests.code'), 'Piet');
  n := public.leader_news('5fd00000-0000-0000-0000-000000000001');
  assert n #>> '{presets,0,title,nl}' = 'Nog even', 'snelknoppen uit de instellingen';
  assert jsonb_array_length(n -> 'sent') = 0, 'nog niets verstuurd';
  n := public.leader_send_news('5fd00000-0000-0000-0000-000000000001', '⏳', '{"nl":"Nog 10 minuten!","en":"10 minutes left!"}', '{"nl":"Op naar het extractiepunt."}');
  assert n ->> 'kind' = 'leader' and n ->> 'sender_name' = 'Piet', 'verstuurd door Piet';
  assert jsonb_array_length(public.leader_news('5fd00000-0000-0000-0000-000000000001') -> 'sent') = 1, 'in de lijst';
  assert public.leader_can_translate('5fd00000-0000-0000-0000-000000000001'), 'mag vertalen';
  begin
    perform public.leader_send_news('5fd00000-0000-0000-0000-000000000001', '⏳', '{"nl":"  "}', '{}');
    raise exception 'lege flits';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.leader_send_news('5fd00000-0000-0000-0000-000000000001', '⏳', jsonb_build_object('nl', repeat('x', 121)), '{}');
    raise exception 'te lange flits';
  exception when invalid_parameter_value then null;
  end;
end $$;

select tests.login('fd000000-0000-0000-0000-000000000002');
do $$
declare
  s jsonb := public.team_signals(current_setting('tests.vossen')::uuid, 0, 0);
begin
  assert s #>> '{news,0,kind}' = 'leader', 'flits van de spelleider';
  assert s #>> '{news,0,title,en}' = '10 minutes left!', 'in elke taal';
  begin
    perform public.leader_send_news('5fd00000-0000-0000-0000-000000000001', '⏳', '{"nl":"Hack"}', '{}');
    raise exception 'team stuurde een flits';
  exception when no_data_found then null;
  end;
  assert not public.leader_can_translate('5fd00000-0000-0000-0000-000000000001'), 'team mag niet vertalen';
end $$;

-- Eindscherm: Vossen klaar met 900 punten; Dassen nog bezig.
do $$
declare
  s jsonb;
begin
  perform public.team_finish(current_setting('tests.vossen')::uuid, 900, 'ontsnapt', extract(epoch from now()) * 1000);
  s := public.team_summary(current_setting('tests.vossen')::uuid);
  assert (s ->> 'teams')::int = 2, 'twee teams gestart';
  assert jsonb_array_length(s -> 'finished') = 1 and (s #>> '{finished,0,score}')::int = 900, 'stand van wie klaar is';
  assert s ->> 'first_escape_team' = current_setting('tests.vossen'), 'eerste eruit';
  assert s ->> 'first_puzzle_team' = current_setting('tests.vossen'), 'eerste puzzel';
  assert (s ->> 'distance_m')::int = 0, 'geen posities';
  begin
    perform public.team_summary(current_setting('tests.dassen')::uuid);
    raise exception 'ander team';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
do $$ begin
  assert (select outcome from public.teams where id = current_setting('tests.vossen')::uuid) = 'ontsnapt', 'einde opgeslagen';
  assert (select ended_at from public.teams where id = current_setting('tests.vossen')::uuid) is not null, 'eindtijd';
  assert (select ended_at from public.teams where id = current_setting('tests.dassen')::uuid) is null, 'Dassen spelen nog';
end $$;

-- Een buitenstaander leest niets.
select tests.login('fd000000-0000-0000-0000-000000000005');
do $$ begin
  assert (select count(*) from public.news_flashes) = 0, 'geen toegang tot de tabel';
end $$;

-- Opruimen: getypte flitsen weg, automatisch nieuws blijft.
reset role;
select public.anonymize_session('5fd00000-0000-0000-0000-000000000001');
do $$ begin
  assert (select count(*) from public.news_flashes where kind = 'leader') = 0, 'flits spelleider weg';
  assert (select count(*) from public.news_flashes where kind <> 'leader') = 3, 'automatisch nieuws blijft';
end $$;

\echo Alle tests voor nieuwsflitsen geslaagd
rollback;
