-- Tests voor versies van het basisspel en de koppeling per stad.
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

-- Badass Games (eigenaar), een partner in Madrid en iemand van buiten.
insert into auth.users (id) values
  ('a0000000-0000-0000-0000-000000000001'), ('e5000000-0000-0000-0000-000000000001'), ('c0000000-0000-0000-0000-000000000001');
insert into public.organizations (id, name, is_platform) values
  ('0a000000-0000-0000-0000-00000000000a', 'Badass Games', true),
  ('0e500000-0000-0000-0000-00000000000e', 'Partner Madrid', true),
  ('0c000000-0000-0000-0000-00000000000c', 'Iemand anders', true);
insert into public.memberships values
  ('0a000000-0000-0000-0000-00000000000a', 'a0000000-0000-0000-0000-000000000001', 'owner'),
  ('0e500000-0000-0000-0000-00000000000e', 'e5000000-0000-0000-0000-000000000001', 'admin'),
  ('0c000000-0000-0000-0000-00000000000c', 'c0000000-0000-0000-0000-000000000001', 'owner');

select tests.login('a0000000-0000-0000-0000-000000000001');
insert into public.games (id, org_id, layer, slug, languages) values
  ('6a000000-0000-0000-0000-000000000001', '0a000000-0000-0000-0000-00000000000a', 'base', 'the-hunt', array['nl','en']);
insert into public.tasks (id, game_id, key, position) values
  ('7a000000-0000-0000-0000-000000000001', '6a000000-0000-0000-0000-000000000001', 'puzzel-tangram', 0);
insert into public.translations (game_id, entity, entity_id, field, lang, text) values
  ('6a000000-0000-0000-0000-000000000001', 'task', 'puzzel-tangram', 'title', 'nl', 'Tangram');
insert into public.games (id, org_id, parent_id, layer, slug) values
  ('6a000000-0000-0000-0000-000000000002', '0a000000-0000-0000-0000-00000000000a', '6a000000-0000-0000-0000-000000000001', 'city', 'the-hunt-leeuwarden'),
  ('6a000000-0000-0000-0000-000000000003', '0a000000-0000-0000-0000-00000000000a', '6a000000-0000-0000-0000-000000000001', 'city', 'the-hunt-madrid');
insert into public.games (id, org_id, parent_id, layer, slug) values
  ('6a000000-0000-0000-0000-000000000004', '0a000000-0000-0000-0000-00000000000a', '6a000000-0000-0000-0000-000000000002', 'client', 'the-hunt-leeuwarden-parteon');
insert into public.game_shares (game_id, org_id) values ('6a000000-0000-0000-0000-000000000003', '0e500000-0000-0000-0000-00000000000e');

-- Versie 1 vastzetten: kopie van opdrachten en teksten, met notitie.
select (public.create_base_version('6a000000-0000-0000-0000-000000000001', '  Eerste versie  ')).version as v \gset
\if :{?v}
\else
  select 1/0;
\endif
do $$
declare s jsonb;
begin
  select snapshot into s from public.base_versions where game_id = '6a000000-0000-0000-0000-000000000001' and version = 1;
  if s is null then raise exception 'versie 1 niet gemaakt'; end if;
  if (select note from public.base_versions where version = 1) <> 'Eerste versie' then raise exception 'notitie niet opgeschoond'; end if;
  if s -> 'game' ->> 'slug' <> 'the-hunt' then raise exception 'spel niet in de kopie'; end if;
  if jsonb_array_length(s -> 'tasks') <> 1 or s -> 'tasks' -> 0 ->> 'key' <> 'puzzel-tangram' then raise exception 'opdrachten niet in de kopie'; end if;
  if s -> 'translations' -> 0 ->> 'text' <> 'Tangram' then raise exception 'teksten niet in de kopie'; end if;
  if jsonb_typeof(s -> 'rules') <> 'array' or jsonb_typeof(s -> 'overridable') <> 'array' then raise exception 'lege lijsten ontbreken'; end if;
end $$;

-- Het basisspel verder bewerken verandert versie 1 niet; versie 2 heeft het wel.
update public.translations set text = 'Tangram 2.0' where entity_id = 'puzzel-tangram';
select public.create_base_version('6a000000-0000-0000-0000-000000000001');
do $$ begin
  if (select snapshot -> 'translations' -> 0 ->> 'text' from public.base_versions where version = 1) <> 'Tangram' then
    raise exception 'versie 1 is meeveranderd';
  end if;
  if (select snapshot -> 'translations' -> 0 ->> 'text' from public.base_versions where version = 2) <> 'Tangram 2.0' then
    raise exception 'versie 2 heeft de nieuwe tekst niet';
  end if;
  if (select note from public.base_versions where version = 2) is not null then raise exception 'lege notitie niet leeg'; end if;
end $$;

-- Een stad koppelen aan versie 1 en daarna bewust aan versie 2.
update public.games set base_version = 1 where id = '6a000000-0000-0000-0000-000000000002';
update public.games set base_version = 2 where id = '6a000000-0000-0000-0000-000000000002';
do $$ begin
  -- Een versie die niet bestaat.
  begin
    update public.games set base_version = 3 where id = '6a000000-0000-0000-0000-000000000002';
    raise exception 'onbestaande versie gekoppeld';
  exception when foreign_key_violation then null;
  end;
  -- Een klantvariant volgt zijn stad en heeft zelf geen versie.
  begin
    update public.games set base_version = 1 where id = '6a000000-0000-0000-0000-000000000004';
    raise exception 'klantvariant kreeg een eigen versie';
  exception when check_violation or foreign_key_violation then null;
  end;
  -- Alleen een basisspel heeft versies.
  begin
    perform public.create_base_version('6a000000-0000-0000-0000-000000000002');
    raise exception 'versie van een stad gemaakt';
  exception when invalid_parameter_value then null;
  end;
  -- Een versie waar een stad aan hangt, kan niet weg.
  begin
    reset role;
    delete from public.base_versions where version = 2;
    raise exception 'gebruikte versie verwijderd';
  exception when foreign_key_violation then null;
  end;
end $$;
select tests.login('a0000000-0000-0000-0000-000000000001');

-- De kopie zelf maken mag niemand rechtstreeks.
do $$ begin
  perform public.layer_snapshot('6a000000-0000-0000-0000-000000000001');
  raise exception 'layer_snapshot rechtstreeks aan te roepen';
exception when insufficient_privilege then null;
end $$;

-- De partner van Madrid ziet de versies (nodig om een klantvariant samen te
-- stellen), maar mag er geen maken.
select tests.login('e5000000-0000-0000-0000-000000000001');
do $$ begin
  if (select count(*) from public.base_versions) <> 2 then raise exception 'partner ziet de versies niet'; end if;
  begin
    perform public.create_base_version('6a000000-0000-0000-0000-000000000001');
    raise exception 'partner maakte een versie';
  exception when insufficient_privilege then null;
  end;
end $$;

-- Iemand van buiten ziet niets en mag niets.
select tests.login('c0000000-0000-0000-0000-000000000001');
do $$ begin
  if (select count(*) from public.base_versions) <> 0 then raise exception 'buitenstaander ziet versies'; end if;
  begin
    perform public.create_base_version('6a000000-0000-0000-0000-000000000001');
    raise exception 'buitenstaander maakte een versie';
  exception when insufficient_privilege then null;
  end;
end $$;

-- Een basisspel zonder varianten kan met zijn versies weg.
select tests.login('a0000000-0000-0000-0000-000000000001');
select public.delete_game('6a000000-0000-0000-0000-000000000004');
select public.delete_game('6a000000-0000-0000-0000-000000000003');
select public.delete_game('6a000000-0000-0000-0000-000000000002');
select public.delete_game('6a000000-0000-0000-0000-000000000001');
do $$ begin
  if exists (select 1 from public.base_versions) then raise exception 'versies bleven achter'; end if;
end $$;

\echo Alle tests voor basisversies geslaagd
rollback;
