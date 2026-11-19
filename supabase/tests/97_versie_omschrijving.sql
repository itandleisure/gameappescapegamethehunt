-- Tests voor de omschrijving bij een versie van het basisspel.
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
select public.create_base_version('6a000000-0000-0000-0000-000000000001', 'Eerste versie');

-- De eigen organisatie past de omschrijving aan, ook een lange.
update public.base_versions set note = repeat('x', 1500) where game_id = '6a000000-0000-0000-0000-000000000001';
do $$ begin
  if (select length(note) from public.base_versions where version = 1) <> 1500 then raise exception 'omschrijving niet aangepast'; end if;
end $$;

-- De kopie zelf blijft vast.
do $$ begin
  begin
    update public.base_versions set snapshot = '{}'::jsonb;
    raise exception 'kopie aangepast';
  exception when insufficient_privilege then null;
  end;
end $$;

-- Iemand van buiten ziet de versie niet en verandert dus niets.
select tests.login('c0000000-0000-0000-0000-000000000001');
update public.base_versions set note = 'gehackt';
reset role;
do $$ begin
  if (select length(note) from public.base_versions where version = 1) <> 1500 then raise exception 'buitenstaander paste omschrijving aan'; end if;
end $$;

rollback;
