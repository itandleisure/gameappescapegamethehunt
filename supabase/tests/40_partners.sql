-- Tests voor partners in het buitenland en tijdzones.
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

-- Badass Games (eigenaar), partner in Spanje, partner in Italië
insert into auth.users (id) values
  ('a0000000-0000-0000-0000-000000000001'), ('e5000000-0000-0000-0000-000000000001'), ('17000000-0000-0000-0000-000000000001');
insert into public.organizations (id, name) values
  ('0a000000-0000-0000-0000-00000000000a', 'Badass Games'),
  ('0e500000-0000-0000-0000-00000000000e', 'Partner Madrid'),
  ('01700000-0000-0000-0000-000000000017', 'Partner Roma');
insert into public.memberships values
  ('0a000000-0000-0000-0000-00000000000a', 'a0000000-0000-0000-0000-000000000001', 'owner'),
  ('0e500000-0000-0000-0000-00000000000e', 'e5000000-0000-0000-0000-000000000001', 'admin'),
  ('01700000-0000-0000-0000-000000000017', '17000000-0000-0000-0000-000000000001', 'admin');
insert into public.games (id, org_id, layer, slug, languages) values
  ('6a000000-0000-0000-0000-000000000001', '0a000000-0000-0000-0000-00000000000a', 'base', 'the-hunt', array['nl','en','es','it']);
insert into public.games (id, org_id, parent_id, layer, slug) values
  ('6a000000-0000-0000-0000-000000000002', '0a000000-0000-0000-0000-00000000000a', '6a000000-0000-0000-0000-000000000001', 'city', 'the-hunt-leeuwarden');
insert into public.tasks (game_id, key) values ('6a000000-0000-0000-0000-000000000001', 'puzzel-tangram');

-- Badass Games deelt het basisspel met de partner in Madrid.
select tests.login('a0000000-0000-0000-0000-000000000001');
insert into public.game_shares (game_id, org_id) values ('6a000000-0000-0000-0000-000000000001', '0e500000-0000-0000-0000-00000000000e');

select tests.login('e5000000-0000-0000-0000-000000000001');
do $$ begin
  assert (select count(*) from public.games) = 1, 'partner ziet alleen het gedeelde basisspel, niet Leeuwarden';
  assert (select count(*) from public.tasks) = 1, 'partner ziet de opdrachten van het basisspel';
  insert into public.games (org_id, parent_id, layer, slug)
  values ('0e500000-0000-0000-0000-00000000000e', '6a000000-0000-0000-0000-000000000001', 'city', 'the-hunt-madrid');
  assert (select count(*) from public.games) = 2, 'partner maakt een eigen stadsvariant';
  update public.tasks set points = 9999;
  assert (select points from public.tasks) = 0, 'partner kan het basisspel niet wijzigen';
  begin
    insert into public.game_shares (game_id, org_id) values ('6a000000-0000-0000-0000-000000000001', '01700000-0000-0000-0000-000000000017');
    raise exception 'partner kon het basisspel doordelen';
  exception when insufficient_privilege then null;
  end;
end $$;

select tests.login('17000000-0000-0000-0000-000000000001');
do $$ begin
  assert (select count(*) from public.games) = 0, 'partner zonder deling ziet niets';
  begin
    insert into public.games (org_id, parent_id, layer, slug)
    values ('01700000-0000-0000-0000-000000000017', '6a000000-0000-0000-0000-000000000001', 'city', 'the-hunt-roma');
    raise exception 'partner bouwde voort op een niet-gedeeld basisspel';
  exception when insufficient_privilege then null;
  end;
end $$;

-- Badass Games ziet de variant van de partner niet (eigen beheer per partner)
select tests.login('a0000000-0000-0000-0000-000000000001');
do $$ begin
  assert (select count(*) from public.games) = 2, 'eigenaar ziet eigen basisspel en Leeuwarden';
end $$;

-- Tijdzone per sessie
reset role;
insert into public.game_versions (id, game_id, version, package) values
  ('7a000000-0000-0000-0000-000000000001', '6a000000-0000-0000-0000-000000000002', 1, '{"languages":["nl"]}');
insert into public.sessions (org_id, game_version_id, name, join_code, timezone)
values ('0a000000-0000-0000-0000-00000000000a', '7a000000-0000-0000-0000-000000000001', 'Lissabon', 'LIS001', 'Europe/Lisbon');
do $$ begin
  assert (select timezone from public.sessions where join_code = 'LIS001') = 'Europe/Lisbon', 'tijdzone opgeslagen';
  begin
    insert into public.sessions (org_id, game_version_id, name, join_code, timezone)
    values ('0a000000-0000-0000-0000-00000000000a', '7a000000-0000-0000-0000-000000000001', 'Fout', 'BAD001', 'Europe/Atlantis');
    raise exception 'onbekende tijdzone werd geaccepteerd';
  exception when check_violation then null;
  end;
  assert public.build_session_results((select id from public.sessions where join_code = 'LIS001')) #>> '{session,timezone}' = 'Europe/Lisbon',
    'resultaten vermelden de tijdzone';
end $$;

\echo 'Alle partner-tests geslaagd'
rollback;
