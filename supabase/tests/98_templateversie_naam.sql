-- Tests voor de naam van een templateversie.
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
select public.create_base_version('6a000000-0000-0000-0000-000000000001', 'eerste');

-- Het eigen team geeft de versie achteraf een naam.
update public.base_versions set name = 'Internationaal – Spanje/Frankrijk' where version = 1;
reset role;
do $$ begin
  if (select name from public.base_versions where version = 1) <> 'Internationaal – Spanje/Frankrijk' then
    raise exception 'naam niet opgeslagen';
  end if;
end $$;

-- Iemand van buiten past de naam niet aan.
select tests.login('c0000000-0000-0000-0000-000000000001');
update public.base_versions set name = 'Gekaapt';
reset role;
do $$ begin
  if (select name from public.base_versions where version = 1) = 'Gekaapt' then raise exception 'buitenstaander hernoemde een versie'; end if;
end $$;

-- Een lege of te lange naam mag niet.
select tests.login('a0000000-0000-0000-0000-000000000001');
do $$ begin
  begin
    update public.base_versions set name = '   ' where version = 1;
    raise exception 'lege naam toegestaan';
  exception when check_violation then null;
  end;
  begin
    update public.base_versions set name = repeat('x', 81) where version = 1;
    raise exception 'te lange naam toegestaan';
  exception when check_violation then null;
  end;
end $$;

-- De kopie zelf blijft vast.
do $$ begin
  begin
    update public.base_versions set snapshot = '{}'::jsonb where version = 1;
    raise exception 'snapshot aangepast';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

\echo 'Alle tests voor de naam van een templateversie geslaagd'
rollback;
