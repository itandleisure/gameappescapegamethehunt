-- Tests voor media van spellen: alleen redacteuren van het spel mogen uploaden.
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
  ('c0000000-0000-0000-0000-000000000001', false),  -- redacteur
  ('c0000000-0000-0000-0000-000000000002', false);  -- buitenstaander

select tests.login('c0000000-0000-0000-0000-000000000001');
select stub.create_organization('Media BV') as org \gset
insert into public.games (id, org_id, layer, slug, languages, default_language)
values ('6c000000-0000-0000-0000-000000000001', :'org', 'base', 'media-spel', array['nl'], 'nl');

-- Redacteur plaatst een overlay in de map van het spel.
insert into storage.objects (bucket_id, name) values ('media', '6c000000-0000-0000-0000-000000000001/overlay.png');
-- Een pad zonder spel-map wordt geweigerd (geen fout bij het omzetten naar uuid).
do $$ begin
  insert into storage.objects (bucket_id, name) values ('media', 'los/overlay.png');
  raise exception 'pad zonder spel geaccepteerd';
exception when insufficient_privilege then null;
end $$;

-- Een buitenstaander mag niet uploaden en ziet het bestand niet in de lijst.
select tests.login('c0000000-0000-0000-0000-000000000002');
do $$ begin
  insert into storage.objects (bucket_id, name) values ('media', '6c000000-0000-0000-0000-000000000001/nep.png');
  raise exception 'buitenstaander kon uploaden';
exception when insufficient_privilege then null;
end $$;
do $$ begin
  if exists (select 1 from storage.objects where bucket_id = 'media') then raise exception 'buitenstaander ziet media'; end if;
end $$;

\echo Alle media-tests geslaagd
rollback;
