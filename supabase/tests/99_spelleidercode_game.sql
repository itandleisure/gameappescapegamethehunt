-- Tests voor de spelleider-code GAME + 3 cijfers (migratie 20261120160000).
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
  ('fb100000-0000-0000-0000-000000000001', false),  -- beheerder
  ('fb100000-0000-0000-0000-000000000002', true);   -- spelleider

select tests.login('fb100000-0000-0000-0000-000000000001');
select stub.create_organization('Codes BV') as org \gset
insert into public.games (id, org_id, layer, slug, languages, default_language)
values ('6fb10000-0000-0000-0000-000000000001', :'org', 'base', 'codes-spel', array['nl'], 'nl');
reset role;
insert into public.game_versions (id, game_id, version, package) values
  ('7fb10000-0000-0000-0000-000000000001', '6fb10000-0000-0000-0000-000000000001', 1, '{"languages":["nl"]}');

-- 1000 hunts: 999 lopende met een GAME-code, één gesloten met GAME000, en een
-- hunt met een oude code.
insert into public.sessions (org_id, game_version_id, name, join_code, status, leader_code)
select :'org', '7fb10000-0000-0000-0000-000000000001', 'Hunt ' || n, 'C' || lpad(n::text, 4, '0'),
       case when n = 0 then 'closed' else 'open' end::public.session_status,
       'GAME' || lpad(n::text, 3, '0')
  from generate_series(0, 999) n;
insert into public.sessions (id, org_id, game_version_id, name, join_code, status, leader_code) values
  ('5fb10000-0000-0000-0000-000000000001', :'org', '7fb10000-0000-0000-0000-000000000001', 'Nieuw', 'NIEUW', 'open', null),
  ('5fb10000-0000-0000-0000-000000000002', :'org', '7fb10000-0000-0000-0000-000000000001', 'Oud', 'OUDJE', 'open', 'K7XPQ2');

select tests.login('fb100000-0000-0000-0000-000000000001');
do $$ begin
  -- Alleen GAME000 is vrij: die komt van de gesloten hunt.
  assert public.leader_code('5fb10000-0000-0000-0000-000000000001') = 'GAME000', 'vrije code van gesloten hunt';
  assert (select leader_code from public.sessions where name = 'Hunt 0') is null, 'gesloten hunt gaf code af';
  -- Een oude code blijft staan.
  assert public.leader_code('5fb10000-0000-0000-0000-000000000002') = 'K7XPQ2', 'oude code blijft';
  -- Nu zijn alle 1000 bezet: dan 4 cijfers.
  assert public.leader_code('5fb10000-0000-0000-0000-000000000002', true) ~ '^GAME[0-9]{4}$', 'GAME + 4 cijfers als alles bezet is';
end $$;
reset role;
update public.sessions set status = 'closed' where name = 'Hunt 482';
select tests.login('fb100000-0000-0000-0000-000000000001');
do $$ begin
  assert public.leader_code('5fb10000-0000-0000-0000-000000000002', true) = 'GAME482', 'weer 3 cijfers als er een vrijkomt';
end $$;

-- Oude code en nieuwe code werken hoofdletterongevoelig, ook met O/I voor 0/1.
reset role;
update public.sessions set leader_code = 'K7XPQ2' where name = 'Hunt 7';
select tests.login('fb100000-0000-0000-0000-000000000002');
do $$ begin
  assert public.leader_join('k7xpq2', 'Jan') ->> 'session_name' = 'Hunt 7', 'oude code, kleine letters';
  assert public.leader_join('game 482', 'Jan') ->> 'session_id' = '5fb10000-0000-0000-0000-000000000002', 'nieuwe code met spatie';
  begin
    perform public.leader_join('GAME999X', 'Jan');
    raise exception 'onbekende code werkte';
  exception when no_data_found then null;
  end;
end $$;
do $$ begin
  assert public.leader_join('gameO15', 'Jan') ->> 'session_name' = 'Hunt 15', 'O en I gelezen als 0 en 1';
  assert public.leader_join('gameI00', 'Jan') ->> 'session_name' = 'Hunt 100', 'I als 1';
end $$;

rollback;
\echo Alle tests voor de spelleidercode GAME geslaagd
