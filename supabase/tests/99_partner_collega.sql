-- Tests voor partners die collega's uitnodigen (migratie 20261119950000) en het
-- accountoverzicht (migratie 20261119960000).
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
  ('f7000000-0000-0000-0000-000000000001', 'frans@example.test', now()),
  ('f7000000-0000-0000-0000-000000000002', 'partner@example.test', now()),
  ('f7000000-0000-0000-0000-000000000003', 'spelleider@partner.test', now()),
  ('f7000000-0000-0000-0000-000000000004', 'collega@partner.test', now());
insert into public.organizations (id, name, is_platform) values
  ('0f700000-0000-0000-0000-000000000001', 'Platform', true),
  ('0f700000-0000-0000-0000-000000000002', 'Partner', false);
insert into public.memberships (org_id, user_id, role) values
  ('0f700000-0000-0000-0000-000000000001', 'f7000000-0000-0000-0000-000000000001', 'owner'),
  ('0f700000-0000-0000-0000-000000000002', 'f7000000-0000-0000-0000-000000000002', 'editor'),
  ('0f700000-0000-0000-0000-000000000002', 'f7000000-0000-0000-0000-000000000003', 'instructor');

-- Een partner heeft nooit een eigenaar of beheerder, ook niet rechtstreeks.
do $$ begin
  begin
    insert into public.memberships (org_id, user_id, role)
    values ('0f700000-0000-0000-0000-000000000002', 'f7000000-0000-0000-0000-000000000004', 'admin');
    raise exception 'beheerder in een partner';
  exception when insufficient_privilege then null;
  end;
end $$;

-- Partner (redacteur) nodigt een collega uit als redacteur; hoger of lager niet.
select tests.login('f7000000-0000-0000-0000-000000000002');
do $$ begin
  begin
    perform public.invite_member('0f700000-0000-0000-0000-000000000002', 'x@partner.test', 'admin');
    raise exception 'partner nodigde een beheerder uit';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.invite_member('0f700000-0000-0000-0000-000000000002', 'x@partner.test', 'owner');
    raise exception 'partner nodigde een eigenaar uit';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.invite_member('0f700000-0000-0000-0000-000000000002', 'x@partner.test', 'instructor');
    raise exception 'partner nodigde met andere rechten uit';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.invite_member('0f700000-0000-0000-0000-000000000001', 'x@partner.test', 'editor');
    raise exception 'partner nodigde uit in het platform';
  exception when insufficient_privilege then null;
  end;
  perform public.invite_member('0f700000-0000-0000-0000-000000000002', 'collega@partner.test', 'editor');
  assert (select role from public.memberships where user_id = 'f7000000-0000-0000-0000-000000000004') = 'editor',
    'collega met bestaand account is meteen redacteur';
  perform public.invite_member('0f700000-0000-0000-0000-000000000002', 'nieuw@partner.test', 'editor');
  assert (select count(*) from public.invitations where email = 'nieuw@partner.test') = 1, 'partner ziet zijn uitnodiging';
  -- Leden verwijderen of rollen wijzigen doet het platform.
  begin
    perform public.remove_member('0f700000-0000-0000-0000-000000000002', 'f7000000-0000-0000-0000-000000000003');
    raise exception 'partner verwijderde een collega';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.set_member_role('0f700000-0000-0000-0000-000000000002', 'f7000000-0000-0000-0000-000000000003', 'editor');
    raise exception 'partner wijzigde een rol';
  exception when insufficient_privilege then null;
  end;
  -- Zijn organisatie tot platform maken lukt niet.
  begin
    update public.organizations set is_platform = true where id = '0f700000-0000-0000-0000-000000000002';
    raise exception 'partner maakte zich platform';
  exception when insufficient_privilege then null;
  end;
  assert (select count(*) from public.platform_accounts()) = 0, 'partner ziet het accountoverzicht niet';
end $$;

-- Spelleider bij de partner nodigt alleen een spelleider uit.
select tests.login('f7000000-0000-0000-0000-000000000003');
do $$ begin
  begin
    perform public.invite_member('0f700000-0000-0000-0000-000000000002', 'y@partner.test', 'editor');
    raise exception 'spelleider nodigde een redacteur uit';
  exception when insufficient_privilege then null;
  end;
  perform public.invite_member('0f700000-0000-0000-0000-000000000002', 'y@partner.test', 'instructor');
  -- Uitnodiging van een ander intrekken kan niet, die van jezelf wel.
  delete from public.invitations where email = 'nieuw@partner.test';
  assert (select count(*) from public.invitations where email = 'nieuw@partner.test') = 1, 'andermans uitnodiging blijft';
  delete from public.invitations where email = 'y@partner.test';
  assert (select count(*) from public.invitations where email = 'y@partner.test') = 0, 'eigen uitnodiging ingetrokken';
end $$;

-- Het platform beheert de leden van de partner.
select tests.login('f7000000-0000-0000-0000-000000000001');
do $$ begin
  assert (select count(*) from public.org_members('0f700000-0000-0000-0000-000000000002')) = 3, 'platform ziet de partnerleden';
  perform public.set_member_role('0f700000-0000-0000-0000-000000000002', 'f7000000-0000-0000-0000-000000000003', 'editor');
  begin
    perform public.set_member_role('0f700000-0000-0000-0000-000000000002', 'f7000000-0000-0000-0000-000000000003', 'admin');
    raise exception 'platform maakte een partnerbeheerder';
  exception when insufficient_privilege then null;
  end;
  perform public.invite_member('0f700000-0000-0000-0000-000000000002', 'z@partner.test', 'instructor');
  perform public.remove_member('0f700000-0000-0000-0000-000000000002', 'f7000000-0000-0000-0000-000000000003');
end $$;
reset role;
do $$ begin
  assert not exists (select 1 from auth.users where id = 'f7000000-0000-0000-0000-000000000003'), 'partneraccount weg';
end $$;

-- Accountoverzicht: inlogs tellen, rechten zien, account verwijderen.
update auth.users set last_sign_in_at = now() - interval '1 day' where id = 'f7000000-0000-0000-0000-000000000004';
update auth.users set last_sign_in_at = now() where id = 'f7000000-0000-0000-0000-000000000004';
insert into auth.users (id, is_anonymous) values ('f7000000-0000-0000-0000-000000000009', true);
select tests.login('f7000000-0000-0000-0000-000000000001');
do $$
declare r record;
begin
  assert (select count(*) from public.platform_accounts()) = 3, 'drie beheeraccounts, geen spelers';
  select * into r from public.platform_accounts() where email = 'collega@partner.test';
  assert r.login_count = 2, 'twee keer ingelogd';
  assert r.last_sign_in_at is not null, 'laatste inlog bekend';
  assert r.rights -> 0 ->> 'role' = 'editor' and r.rights -> 0 ->> 'org' = 'Partner', 'rechten zichtbaar';
  begin
    perform public.delete_account('f7000000-0000-0000-0000-000000000001');
    raise exception 'eigen account verwijderd';
  exception when insufficient_privilege then null;
  end;
  perform public.set_account_note(' Collega@Partner.test ', '  Partner Lissabon, tot juni  ');
  assert (select note from public.platform_accounts() where email = 'collega@partner.test') = 'Partner Lissabon, tot juni',
    'omschrijving zichtbaar';
  perform public.set_account_note('nog-geen-account@partner.test', 'Komt in januari');
  perform public.delete_account('f7000000-0000-0000-0000-000000000004');
  assert (select count(*) from public.platform_accounts()) = 2, 'account verwijderd';
end $$;

-- Een partner kan geen accounts verwijderen.
select tests.login('f7000000-0000-0000-0000-000000000002');
do $$ begin
  begin
    perform public.delete_account('f7000000-0000-0000-0000-000000000001');
    raise exception 'partner verwijderde een account';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.set_account_note('frans@example.test', 'x');
    raise exception 'partner zette een omschrijving';
  exception when insufficient_privilege then null;
  end;
  begin
    perform count(*) from public.account_notes;
    raise exception 'partner las omschrijvingen';
  exception when insufficient_privilege then null;
  end;
end $$;

reset role;
do $$ begin
  assert (select count(*) from public.account_notes) = 1, 'omschrijving van het verwijderde account weg, die voor de uitnodiging blijft';
  assert (select email from public.account_notes) = 'nog-geen-account@partner.test', 'omschrijving al bij het uitnodigen';
end $$;

\echo Alle tests voor partnercollegas en het accountoverzicht geslaagd
rollback;
