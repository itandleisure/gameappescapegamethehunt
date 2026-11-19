-- Tests voor leden verwijderen en rollen wijzigen (migratie 20261119830000_toegang_beheren).
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

insert into auth.users (id, email, email_confirmed_at) values
  ('f6000000-0000-0000-0000-000000000001', 'eigenaar@example.test', now()),
  ('f6000000-0000-0000-0000-000000000002', 'beheerder@example.test', now()),
  ('f6000000-0000-0000-0000-000000000003', 'spelleider@example.test', now());
insert into public.organizations (id, name, is_platform) values ('0f600000-0000-0000-0000-000000000001', 'Org', true);
insert into public.memberships (org_id, user_id, role) values
  ('0f600000-0000-0000-0000-000000000001', 'f6000000-0000-0000-0000-000000000001', 'owner'),
  ('0f600000-0000-0000-0000-000000000001', 'f6000000-0000-0000-0000-000000000002', 'admin'),
  ('0f600000-0000-0000-0000-000000000001', 'f6000000-0000-0000-0000-000000000003', 'instructor');

-- Beheerder: rol van een spelleider wijzigen mag, eigenaar aanpassen niet.
select tests.login('f6000000-0000-0000-0000-000000000002');
select public.set_member_role('0f600000-0000-0000-0000-000000000001', 'f6000000-0000-0000-0000-000000000003', 'editor');
do $$ begin
  assert (select role from public.memberships where user_id = 'f6000000-0000-0000-0000-000000000003') = 'editor', 'rol gewijzigd';
  begin
    perform public.set_member_role('0f600000-0000-0000-0000-000000000001', 'f6000000-0000-0000-0000-000000000003', 'owner');
    raise exception 'beheerder maakte een eigenaar';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.remove_member('0f600000-0000-0000-0000-000000000001', 'f6000000-0000-0000-0000-000000000001');
    raise exception 'beheerder verwijderde de eigenaar';
  exception when insufficient_privilege then null;
  end;
  -- Rechtstreeks in memberships schrijven kan niet meer.
  update public.memberships set role = 'owner' where user_id = auth.uid();
  assert (select role from public.memberships where user_id = auth.uid()) = 'admin', 'zichzelf eigenaar maken lukt niet';
end $$;

-- Spelleider (nu redacteur) mag niets beheren.
select tests.login('f6000000-0000-0000-0000-000000000003');
do $$ begin
  begin
    perform public.remove_member('0f600000-0000-0000-0000-000000000001', 'f6000000-0000-0000-0000-000000000002');
    raise exception 'redacteur verwijderde een lid';
  exception when insufficient_privilege then null;
  end;
end $$;

-- Eigenaar: de laatste eigenaar blijft; een lid verwijderen haalt ook zijn account weg.
select tests.login('f6000000-0000-0000-0000-000000000001');
do $$ begin
  begin
    perform public.set_member_role('0f600000-0000-0000-0000-000000000001', 'f6000000-0000-0000-0000-000000000001', 'admin');
    raise exception 'laatste eigenaar gedegradeerd';
  exception when check_violation then null;
  end;
  perform public.remove_member('0f600000-0000-0000-0000-000000000001', 'f6000000-0000-0000-0000-000000000003');
end $$;
reset role;
do $$ begin
  assert not exists (select 1 from public.memberships where user_id = 'f6000000-0000-0000-0000-000000000003'), 'lid weg';
  assert not exists (select 1 from auth.users where id = 'f6000000-0000-0000-0000-000000000003'), 'account weg';
end $$;

\echo Alle tests voor toegang beheren geslaagd
rollback;
