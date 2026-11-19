-- Tests voor de beheeromgeving op uitnodiging (migratie 20261119920000_uitnodigingen).
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

-- Frans is eigenaar van het platform (bestaande organisatie).
insert into auth.users (id, email, email_confirmed_at) values
  ('f4000000-0000-0000-0000-000000000001', 'frans@example.test', now()),
  ('f4000000-0000-0000-0000-000000000009', 'buiten@example.test', now());
insert into public.organizations (id, name, is_platform) values ('0f400000-0000-0000-0000-000000000001', 'Escape Game The Hunt', true);
insert into public.memberships (org_id, user_id, role) values
  ('0f400000-0000-0000-0000-000000000001', 'f4000000-0000-0000-0000-000000000001', 'owner');

-- Registreren via Supabase Auth zonder uitnodiging: geweigerd. Anonieme spelers wel.
set session authorization supabase_auth_admin;
do $$ begin
  begin
    insert into auth.users (id, email) values ('f4000000-0000-0000-0000-000000000002', 'vreemde@example.test');
    raise exception 'registreren zonder uitnodiging lukte';
  exception when insufficient_privilege then null;
  end;
end $$;
insert into auth.users (id, is_anonymous) values ('f4000000-0000-0000-0000-000000000003', true);
reset session authorization;

-- Zelf een organisatie maken kan niet meer.
select tests.login('f4000000-0000-0000-0000-000000000009');
do $$ begin
  begin
    perform public.create_organization('Eigen BV');
    raise exception 'zelf een organisatie maken lukte';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.create_partner('Nep partner', 'x@example.test');
    raise exception 'buitenstaander kon een partner maken';
  exception when insufficient_privilege then null;
  end;
end $$;

-- Frans nodigt een collega uit en maakt een partner aan.
select tests.login('f4000000-0000-0000-0000-000000000001');
select public.invite_member('0f400000-0000-0000-0000-000000000001', ' Collega@Example.test ', 'admin');
select public.create_partner('Partner Lissabon', 'eigenaar@partner.test') as partner \gset
do $$ begin
  assert (select count(*) from public.invitations) = 2, 'Frans ziet de uitnodigingen van zijn organisatie en van de partner';
  assert (select email from public.invitations where org_id = '0f400000-0000-0000-0000-000000000001') = 'collega@example.test',
    'e-mail in kleine letters';
  assert (select count(*) from public.partner_orgs()) = 1, 'partner in het overzicht';
  assert (select count(*) from public.org_members('0f400000-0000-0000-0000-000000000001')) = 1, 'een lid';
end $$;
reset role;

-- De uitgenodigde collega registreert en bevestigt zijn e-mailadres.
set session authorization supabase_auth_admin;
insert into auth.users (id, email) values ('f4000000-0000-0000-0000-000000000004', 'collega@example.test');
insert into auth.users (id, email) values ('f4000000-0000-0000-0000-000000000005', 'eigenaar@partner.test');
reset session authorization;
do $$ begin
  assert not exists (select 1 from public.memberships where user_id = 'f4000000-0000-0000-0000-000000000004'),
    'nog geen lid voor bevestiging';
end $$;
update auth.users set email_confirmed_at = now() where id in ('f4000000-0000-0000-0000-000000000004', 'f4000000-0000-0000-0000-000000000005');
do $$ begin
  assert (select role from public.memberships where user_id = 'f4000000-0000-0000-0000-000000000004') = 'admin',
    'collega is beheerder geworden';
  assert (select o.is_platform from public.memberships m join public.organizations o on o.id = m.org_id
          where m.user_id = 'f4000000-0000-0000-0000-000000000005' and m.role = 'editor') = false,
    'partner is redacteur van zijn eigen (niet-platform) organisatie';
end $$;

-- De partner kan zelf geen partners maken, wel collega's uitnodigen in de eigen organisatie.
select tests.login('f4000000-0000-0000-0000-000000000005');
do $$ begin
  begin
    perform public.create_partner('Sub partner', 'x@example.test');
    raise exception 'partner kon een partner maken';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.invite_member('0f400000-0000-0000-0000-000000000001', 'x@example.test', 'admin');
    raise exception 'partner kon in het platform uitnodigen';
  exception when insufficient_privilege then null;
  end;
  assert (select count(*) from public.partner_orgs()) = 0, 'partner ziet geen partnerlijst';
end $$;

\echo Alle uitnodigingstests geslaagd
rollback;
