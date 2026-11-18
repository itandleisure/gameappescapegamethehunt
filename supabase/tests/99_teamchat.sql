-- Tests voor de teamchat: teams van één hunt praten met elkaar.
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
  ('f1000000-0000-0000-0000-000000000001', false),  -- spelleiding
  ('f1000000-0000-0000-0000-000000000002', true),   -- team Vossen
  ('f1000000-0000-0000-0000-000000000003', true),   -- team Wolven
  ('f1000000-0000-0000-0000-000000000004', true);   -- team in een andere hunt

select tests.login('f1000000-0000-0000-0000-000000000001');
select public.create_organization('Chat BV') as org \gset
insert into public.games (id, org_id, layer, slug, languages, default_language)
values ('6f100000-0000-0000-0000-000000000001', :'org', 'base', 'chat-spel', array['nl'], 'nl');
reset role;
insert into public.game_versions (id, game_id, version, package) values
  ('7f100000-0000-0000-0000-000000000001', '6f100000-0000-0000-0000-000000000001', 1, '{"languages":["nl"]}');
select tests.login('f1000000-0000-0000-0000-000000000001');
insert into public.sessions (id, org_id, game_version_id, name, join_code, status, team_chat) values
  ('5f100000-0000-0000-0000-000000000001', :'org', '7f100000-0000-0000-0000-000000000001', 'Met chat', 'PRAAT', 'open', true),
  ('5f100000-0000-0000-0000-000000000002', :'org', '7f100000-0000-0000-0000-000000000001', 'Zonder chat', 'STIL', 'open', false);

select tests.login('f1000000-0000-0000-0000-000000000002');
select (public.join_session('PRAAT', 'Vossen', 'nl')).id as vossen \gset
select tests.login('f1000000-0000-0000-0000-000000000003');
select (public.join_session('PRAAT', 'Wolven', 'nl')).id as wolven \gset
select tests.login('f1000000-0000-0000-0000-000000000004');
select (public.join_session('STIL', 'Elders', 'nl')).id as elders \gset

-- Vossen sturen een bericht; naam, afzender en tijd vult de database in.
select tests.login('f1000000-0000-0000-0000-000000000002');
insert into public.messages (id, session_id, team_id, sender, channel, body, sender_name, created_at)
values ('a1000000-0000-0000-0000-000000000001', '5f100000-0000-0000-0000-000000000001', :'vossen', 'team', 'teams',
        'Wie heeft de sleutel gevonden?', 'Spelleiding', '2000-01-01');
-- Nog een keer hetzelfde bericht (opnieuw versturen na slecht bereik) doet niets.
insert into public.messages (id, session_id, team_id, sender, channel, body)
values ('a1000000-0000-0000-0000-000000000001', '5f100000-0000-0000-0000-000000000001', :'vossen', 'team', 'teams', 'Wie heeft de sleutel gevonden?')
on conflict (id) do nothing;
-- Een vraag aan de spelleiding blijft privé.
insert into public.messages (session_id, team_id, sender, body)
values ('5f100000-0000-0000-0000-000000000001', :'vossen', 'team', 'Alleen voor de spelleiding');
do $$ begin
  assert (select sender_name from public.messages where id = 'a1000000-0000-0000-0000-000000000001') = 'Vossen', 'naam van het team ingevuld';
  assert (select sender_user from public.messages where id = 'a1000000-0000-0000-0000-000000000001') = auth.uid(), 'afzender ingevuld';
  assert (select created_at from public.messages where id = 'a1000000-0000-0000-0000-000000000001') > now() - interval '1 minute', 'servertijd';
  assert (select count(*) from public.messages where channel = 'teams') = 1, 'dubbel versturen geeft één bericht';
  -- Niet namens een ander team.
  begin
    insert into public.messages (session_id, team_id, sender, channel, body)
    values ('5f100000-0000-0000-0000-000000000001', (select id from public.teams where name = 'Vossen') , 'staff', 'teams', 'Ik ben de spelleiding');
    raise exception 'team schreef namens de spelleiding';
  exception when insufficient_privilege then null;
  end;
  delete from public.messages;
  assert (select count(*) from public.messages) = 2, 'team kan geen berichten wissen';
end $$;

-- Wolven zien de teamchat, niet de privévraag van de Vossen, en kunnen terugschrijven.
select tests.login('f1000000-0000-0000-0000-000000000003');
do $$ begin
  assert (select count(*) from public.messages) = 1, 'ander team ziet alleen de teamchat';
  assert (select body from public.messages) = 'Wie heeft de sleutel gevonden?', 'bericht van de Vossen';
  begin
    insert into public.messages (session_id, team_id, sender, channel, body)
    values ('5f100000-0000-0000-0000-000000000001', (select id from public.teams where name = 'Vossen'), 'team', 'teams', 'Ik ben de Vossen');
    raise exception 'team schreef als een ander team';
  exception when insufficient_privilege then null;
  end;
end $$;
insert into public.messages (session_id, team_id, sender, channel, body)
values ('5f100000-0000-0000-0000-000000000001', :'wolven', 'team', 'teams', 'Wij!');

-- Een team uit een andere hunt ziet niets en kan zonder teamchat niets sturen.
select tests.login('f1000000-0000-0000-0000-000000000004');
do $$ begin
  assert (select count(*) from public.messages) = 0, 'andere hunt ziet de teamchat niet';
  begin
    insert into public.messages (session_id, team_id, sender, channel, body)
    values ('5f100000-0000-0000-0000-000000000001', (select id from public.teams where name = 'Elders'), 'team', 'teams', 'Hallo daar');
    raise exception 'team schreef in de chat van een andere hunt';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.messages (session_id, team_id, sender, channel, body)
    values ('5f100000-0000-0000-0000-000000000002', (select id from public.teams where name = 'Elders'), 'team', 'teams', 'Is hier iemand?');
    raise exception 'teamchat werkte terwijl die uit staat';
  exception when insufficient_privilege then null;
  end;
end $$;

-- De spelleiding leest alles, praat mee, haalt een bericht weg en zet de chat uit.
select tests.login('f1000000-0000-0000-0000-000000000001');
insert into public.messages (session_id, sender, channel, body)
values ('5f100000-0000-0000-0000-000000000001', 'staff', 'teams', 'Nog 10 minuten, zet hem op!');
delete from public.messages where body = 'Wij!';
update public.sessions set team_chat = false where id = '5f100000-0000-0000-0000-000000000001';
do $$ begin
  assert (select count(*) from public.messages) = 3, 'spelleiding ziet teamchat en privévraag';
  assert (select sender_name from public.messages where sender = 'staff') is null, 'spelleiding zonder teamnaam';
end $$;

-- Chat uit: teams lezen terug maar sturen niets meer.
select tests.login('f1000000-0000-0000-0000-000000000003');
do $$ begin
  assert (select count(*) from public.messages) = 2, 'Wolven zien de chat nog, zonder het verwijderde bericht';
  begin
    insert into public.messages (session_id, team_id, sender, channel, body)
    values ('5f100000-0000-0000-0000-000000000001', (select id from public.teams where name = 'Wolven'), 'team', 'teams', 'Hallo?');
    raise exception 'teamchat werkte nadat de spelleider hem uitzette';
  exception when insufficient_privilege then null;
  end;
end $$;

\echo Alle tests voor de teamchat geslaagd
rollback;
