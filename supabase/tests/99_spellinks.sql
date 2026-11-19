-- Tests voor vaste links per spel en event: game-ID en /<game-ID>:<spelcode>.
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

insert into auth.users (id, is_anonymous) values ('f3000000-0000-0000-0000-000000000001', false);

select tests.login('f3000000-0000-0000-0000-000000000001');
select stub.create_organization('Link BV') as org \gset
insert into public.games (id, org_id, layer, slug, languages, default_language, settings)
values ('6f300000-0000-0000-0000-000000000001', :'org', 'base', 'link-spel', array['nl'], 'nl', '{}');
insert into public.games (id, org_id, parent_id, layer, slug, languages, default_language, settings)
values ('6f300000-0000-0000-0000-000000000002', :'org', '6f300000-0000-0000-0000-000000000001', 'city', 'The Hunt Léeuwarden', array['nl'], 'nl', '{"name":{"nl":"The Hunt Leeuwarden"}}');
reset role;
insert into public.game_versions (id, game_id, version, package) values
  ('7f300000-0000-0000-0000-000000000001', '6f300000-0000-0000-0000-000000000002', 1, '{"languages":["nl"]}');
select tests.login('f3000000-0000-0000-0000-000000000001');
insert into public.sessions (id, org_id, game_version_id, name, join_code, status) values
  ('5f300000-0000-0000-0000-000000000001', :'org', '7f300000-0000-0000-0000-000000000001', 'Teamuitje Klant X', 'LINK1', 'open');

do $$
declare
  v jsonb;
begin
  -- Game-ID gemaakt uit de sleutel: kleine letters, zonder accenten of spaties.
  assert (select public_id from public.games where id = '6f300000-0000-0000-0000-000000000002') = 'the-hunt-leeuwarden', 'game-ID uit sleutel';
  assert (select public_id from public.games where id = '6f300000-0000-0000-0000-000000000001') = 'link-spel', 'game-ID basisspel';

  -- Aanpassen: wordt netjes gemaakt.
  update public.games set public_id = 'Leeuwarden ' where id = '6f300000-0000-0000-0000-000000000002';
  assert (select public_id from public.games where id = '6f300000-0000-0000-0000-000000000002') = 'leeuwarden', 'game-ID aangepast';

  -- Hetzelfde game-ID als een ander spel mag niet.
  begin
    update public.games set public_id = 'leeuwarden' where id = '6f300000-0000-0000-0000-000000000001';
    raise exception 'dubbel game-ID toegestaan';
  exception when unique_violation then null;
  end;

  -- Nieuw spel met dezelfde sleutel-basis krijgt -2.
  insert into public.games (org_id, parent_id, layer, slug, languages, default_language)
  select org_id, id, 'city', 'leeuwarden', array['nl'], 'nl' from public.games where id = '6f300000-0000-0000-0000-000000000001';
  assert (select public_id from public.games where slug = 'leeuwarden') = 'leeuwarden-2', 'vrij game-ID';
end $$;

-- Openbare link: werkt zonder inloggen, en geeft de naam van het event niet prijs.
reset role;
set local role anon;
do $$
declare
  v jsonb;
begin
  v := public.event_link('leeuwarden', 'link1');
  assert v ->> 'game_id' = 'leeuwarden', 'game-ID';
  assert v ->> 'code' = 'LINK1', 'spelcode';
  assert (v ->> 'game_matches')::boolean, 'game-ID klopt';
  assert v -> 'name' ->> 'nl' = 'The Hunt Leeuwarden', 'spelnaam';
  assert v ->> 'status' = 'open', 'status';
  assert not v::text like '%Klant X%', 'eventnaam niet zichtbaar';

  -- Oud of verkeerd game-ID: de spelcode vindt het event toch.
  v := public.event_link('the-hunt-leeuwarden', 'LINK-1');
  assert v ->> 'code' = 'LINK1' and not (v ->> 'game_matches')::boolean, 'oud game-ID';

  assert public.event_link('leeuwarden', 'NIETS') is null, 'onbekende code';
end $$;

\echo 'Alle tests voor spellinks geslaagd'
rollback;
