-- Tests voor telefoonnummer bij aanmelden en de kortere sessiecode.
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

insert into auth.users (id, is_anonymous) values
  ('e0000000-0000-0000-0000-000000000001', false),  -- spelleiding
  ('e0000000-0000-0000-0000-000000000002', true),   -- team 1
  ('e0000000-0000-0000-0000-000000000003', true);   -- team 2

select tests.login('e0000000-0000-0000-0000-000000000001');
select public.create_organization('Tel BV') as org \gset
insert into public.games (id, org_id, layer, slug, languages, default_language)
values ('6e000000-0000-0000-0000-000000000001', :'org', 'base', 'tel-spel', array['nl'], 'nl');
reset role;
insert into public.game_versions (id, game_id, version, package) values
  ('7e000000-0000-0000-0000-000000000001', '6e000000-0000-0000-0000-000000000001', 1, '{"languages":["nl"]}');
select tests.login('e0000000-0000-0000-0000-000000000001');
insert into public.sessions (id, org_id, game_version_id, name, status) values
  ('5e000000-0000-0000-0000-000000000001', :'org', '7e000000-0000-0000-0000-000000000001', 'Zonder code', 'open');
insert into public.sessions (org_id, game_version_id, name, join_code, status) values
  (:'org', '7e000000-0000-0000-0000-000000000001', 'Eigen code', 'hunt1', 'open');

do $$ begin
  assert (select join_code from public.sessions where id = '5e000000-0000-0000-0000-000000000001') ~ '^[A-Z2-9]{5}$', 'code van 5 tekens';
  assert exists (select 1 from public.sessions where join_code = 'HUNT1'), 'eigen code in hoofdletters';
end $$;

select tests.login('e0000000-0000-0000-0000-000000000002');
select (public.join_session('HUNT1', 'Vossen', 'nl', ' +31 6 1234 5678 ')).id as team1 \gset
do $$ begin
  begin
    perform public.join_session('HUNT1', 'Nep', 'nl', 'bel me');
    raise exception 'ongeldig nummer geaccepteerd';
  exception when sqlstate '22023' then null;
  end;
end $$;
do $$ begin
  assert (select phone from public.team_contacts) = '+31 6 1234 5678', 'eigen team ziet zijn nummer';
end $$;

-- Een ander team ziet alleen zijn eigen team en nooit elkaars telefoonnummer.
select tests.login('e0000000-0000-0000-0000-000000000003');
select public.join_session('HUNT1', 'Wolven', 'nl', '0612345678');
do $$ begin
  assert (select count(*) from public.teams) = 1, 'ziet alleen het eigen team';
  assert (select count(*) from public.team_contacts) = 1, 'ziet alleen het eigen nummer';
end $$;

-- De spelleiding ziet alle nummers. Aanmelden zonder nummer (oude app) kan nog.
select tests.login('e0000000-0000-0000-0000-000000000001');
do $$ begin
  assert (select count(*) from public.team_contacts) = 2, 'spelleiding ziet alle nummers';
end $$;

\echo Alle telefoon- en code-tests geslaagd
rollback;
