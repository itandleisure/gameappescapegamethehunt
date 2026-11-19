-- Tests voor de lijst met fysieke puzzels: alleen leden van de organisatie.
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
  ('d0000000-0000-0000-0000-000000000001', false),  -- eigenaar
  ('d0000000-0000-0000-0000-000000000002', false);  -- buitenstaander

select tests.login('d0000000-0000-0000-0000-000000000001');
select stub.create_organization('Puzzel BV') as org \gset
select set_config('tests.org', :'org', false);
insert into public.puzzles (org_id, name, answer, hints)
values (:'org', 'Tangram', '{"type":"text","accepted":["hunting"]}', '[{"cost":25,"text":{"nl":"Rood rechtsboven"}}]');
do $$ begin
  if (select count(*) from public.puzzles) <> 1 then raise exception 'eigenaar ziet zijn puzzel niet'; end if;
end $$;

-- Een buitenstaander ziet de puzzel niet en kan er geen toevoegen.
select tests.login('d0000000-0000-0000-0000-000000000002');
do $$ begin
  if exists (select 1 from public.puzzles) then raise exception 'buitenstaander ziet puzzels'; end if;
end $$;
do $$ begin
  insert into public.puzzles (org_id, name, answer) values (current_setting('tests.org')::uuid, 'Nep', '{"type":"number","value":1}');
  raise exception 'buitenstaander kon een puzzel toevoegen';
exception when insufficient_privilege then null;
end $$;

-- Puzzelfoto's: alleen redacteuren van de organisatie mogen uploaden onder puzzels/<org>/.
do $$ begin
  insert into storage.objects (bucket_id, name) values ('media', 'puzzels/' || current_setting('tests.org') || '/nep.jpg');
  raise exception 'buitenstaander kon een puzzelfoto uploaden';
exception when insufficient_privilege then null;
end $$;
select tests.login('d0000000-0000-0000-0000-000000000001');
insert into storage.objects (bucket_id, name) values ('media', 'puzzels/' || current_setting('tests.org') || '/tangram.jpg');
do $$ begin
  if (select count(*) from storage.objects where name like 'puzzels/%') <> 1 then raise exception 'eigenaar kon geen puzzelfoto uploaden'; end if;
end $$;

\echo Alle tests voor fysieke puzzels geslaagd
rollback;
