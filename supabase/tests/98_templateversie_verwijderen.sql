-- Tests voor het verwijderen van een templateversie.
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

insert into auth.users (id) values
  ('a0000000-0000-0000-0000-000000000001'), ('c0000000-0000-0000-0000-000000000001');
insert into public.organizations (id, name, is_platform) values
  ('0a000000-0000-0000-0000-00000000000a', 'Badass Games', true),
  ('0c000000-0000-0000-0000-00000000000c', 'Iemand anders', true);
insert into public.memberships values
  ('0a000000-0000-0000-0000-00000000000a', 'a0000000-0000-0000-0000-000000000001', 'owner'),
  ('0c000000-0000-0000-0000-00000000000c', 'c0000000-0000-0000-0000-000000000001', 'owner');

select tests.login('a0000000-0000-0000-0000-000000000001');
insert into public.games (id, org_id, layer, slug) values
  ('6a000000-0000-0000-0000-000000000001', '0a000000-0000-0000-0000-00000000000a', 'base', 'the-hunt');
select public.create_base_version('6a000000-0000-0000-0000-000000000001', 'v1');
select public.create_base_version('6a000000-0000-0000-0000-000000000001', 'v2');
insert into public.games (id, org_id, parent_id, layer, slug, base_version) values
  ('6a000000-0000-0000-0000-000000000002', '0a000000-0000-0000-0000-00000000000a', '6a000000-0000-0000-0000-000000000001', 'city', 'the-hunt-hoorn', 2);

-- Iemand van buiten verwijdert niets.
select tests.login('c0000000-0000-0000-0000-000000000001');
delete from public.base_versions;
reset role;
do $$ begin
  if (select count(*) from public.base_versions) <> 2 then raise exception 'buitenstaander verwijderde een versie'; end if;
end $$;

-- Versie 2 heeft een stad en blijft staan.
select tests.login('a0000000-0000-0000-0000-000000000001');
do $$ begin
  begin
    delete from public.base_versions where version = 2;
    raise exception 'versie met stad verwijderd';
  exception when foreign_key_violation then null;
  end;
end $$;

-- Versie 1 zonder steden kan weg; versie 2 blijft werken.
delete from public.base_versions where version = 1;
reset role;
do $$ begin
  if exists (select 1 from public.base_versions where version = 1) then raise exception 'versie 1 niet verwijderd'; end if;
  if not exists (select 1 from public.base_versions where version = 2) then raise exception 'versie 2 weg'; end if;
end $$;

-- Een nieuwe versie telt door: na v2 komt v3.
select tests.login('a0000000-0000-0000-0000-000000000001');
do $$ begin
  if (public.create_base_version('6a000000-0000-0000-0000-000000000001')).version <> 3 then raise exception 'nummering klopt niet'; end if;
end $$;

\echo 'Alle tests voor templateversie verwijderen geslaagd'
rollback;
