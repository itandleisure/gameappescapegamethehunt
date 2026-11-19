-- Tests voor partners beheren (migratie 20261120020000): naam en omschrijving
-- wijzigen, accounts onder een bestaande partner uitnodigen.
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
  ('f8000000-0000-0000-0000-000000000001', 'frans@example.test', now()),
  ('f8000000-0000-0000-0000-000000000002', 'partner@example.test', now()),
  ('f8000000-0000-0000-0000-000000000003', 'nieuw@partner.test', now());
insert into public.organizations (id, name, is_platform) values
  ('0f800000-0000-0000-0000-000000000001', 'Platform', true),
  ('0f800000-0000-0000-0000-000000000002', 'Partner Frans', false);
insert into public.memberships (org_id, user_id, role) values
  ('0f800000-0000-0000-0000-000000000001', 'f8000000-0000-0000-0000-000000000001', 'owner'),
  ('0f800000-0000-0000-0000-000000000002', 'f8000000-0000-0000-0000-000000000002', 'editor');

-- Het platform wijzigt naam en omschrijving van een bestaande partner.
select tests.login('f8000000-0000-0000-0000-000000000001');
select public.update_partner('0f800000-0000-0000-0000-000000000002', '  Escape Lissabon ', 'Partner in Lissabon, contract tot 2027');
do $$ begin
  assert (select name from public.partner_orgs() where id = '0f800000-0000-0000-0000-000000000002') = 'Escape Lissabon', 'naam gewijzigd';
  assert (select description from public.partner_orgs() where id = '0f800000-0000-0000-0000-000000000002') = 'Partner in Lissabon, contract tot 2027', 'omschrijving opgeslagen';
end $$;

-- Een platformorganisatie of te korte naam gaat niet.
do $$ begin
  begin
    perform public.update_partner('0f800000-0000-0000-0000-000000000001', 'Platform', null);
    raise exception 'platform als partner gewijzigd';
  exception when no_data_found then null;
  end;
  begin
    perform public.update_partner('0f800000-0000-0000-0000-000000000002', 'x', null);
    raise exception 'te korte naam';
  exception when invalid_parameter_value then null;
  end;
end $$;

-- Het platform nodigt een account uit onder de bestaande partner, met omschrijving.
select public.invite_member('0f800000-0000-0000-0000-000000000002', 'nieuw@partner.test', 'editor');
select public.set_account_note('nieuw@partner.test', 'Collega van de partner');
select public.invite_member('0f800000-0000-0000-0000-000000000002', 'later@partner.test', 'editor');
select public.set_account_note('later@partner.test', 'Begint in januari');
select public.set_account_note('frans@example.test', 'Eigenaar platform');
do $$ begin
  assert exists (select 1 from public.org_members('0f800000-0000-0000-0000-000000000002') where user_id = 'f8000000-0000-0000-0000-000000000003' and role = 'editor'), 'account onder de partner met de rechten van de partner';
  assert (select count(*) from public.org_account_notes('0f800000-0000-0000-0000-000000000002')) = 2, 'omschrijvingen van lid en uitnodiging, niet van anderen';
end $$;

-- Een lege omschrijving wist hem.
select public.update_partner('0f800000-0000-0000-0000-000000000002', 'Escape Lissabon', '  ');
do $$ begin
  assert (select description from public.partner_orgs() where id = '0f800000-0000-0000-0000-000000000002') is null, 'omschrijving gewist';
end $$;

-- De partner zelf wijzigt niets en ziet geen omschrijvingen.
select public.update_partner('0f800000-0000-0000-0000-000000000002', 'Escape Lissabon', 'Geheim');
select tests.login('f8000000-0000-0000-0000-000000000002');
do $$ begin
  begin
    perform public.update_partner('0f800000-0000-0000-0000-000000000002', 'Eigen naam', null);
    raise exception 'partner wijzigde zichzelf';
  exception when insufficient_privilege then null;
  end;
  begin
    perform 1 from public.partner_notes;
    raise exception 'partner las de omschrijving';
  exception when insufficient_privilege then null;
  end;
  assert (select count(*) from public.org_account_notes('0f800000-0000-0000-0000-000000000002')) = 0, 'geen accountomschrijvingen voor de partner';
  assert (select count(*) from public.partner_orgs()) = 0, 'geen partneroverzicht voor de partner';
end $$;

\echo Alle tests voor partners beheren geslaagd
rollback;
