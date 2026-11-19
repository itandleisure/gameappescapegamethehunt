-- De migratie voor het verzamelpunt (20 m) nog een keer draaien op
-- testgegevens met een vaste 10 m, en controleren wat er verandert.
\set ON_ERROR_STOP on
begin;

insert into auth.users (id, is_anonymous) values ('f0000000-0000-0000-0000-000000000001', false);
select set_config('request.jwt.claim.sub', 'f0000000-0000-0000-0000-000000000001', true);
select stub.create_organization('Verzamel BV') as org \gset

insert into public.games (id, org_id, layer, slug, settings) values
  ('f1000000-0000-0000-0000-000000000001', :'org', 'base', 'vp-tien', '{"meetingPoint":{"lat":53.2,"lng":5.8,"radius":10}}'),
  ('f1000000-0000-0000-0000-000000000002', :'org', 'base', 'vp-dertig', '{"meetingPoint":{"lat":53.2,"lng":5.8,"radius":30}}');
insert into public.games (id, org_id, layer, slug, parent_id) values
  ('f1000000-0000-0000-0000-000000000003', :'org', 'city', 'vp-stad', 'f1000000-0000-0000-0000-000000000001');
insert into public.overrides (game_id, task_id, field, value) values
  ('f1000000-0000-0000-0000-000000000003', null, 'meetingPoint', '{"lat":53.21,"lng":5.81,"radius":10,"text":{}}');
insert into public.base_versions (game_id, version, snapshot)
values ('f1000000-0000-0000-0000-000000000001', 7, public.layer_snapshot('f1000000-0000-0000-0000-000000000001'));

\i supabase/migrations/20261120123500_verzamelpunt_20m.sql

do $$ begin
  if (select settings -> 'meetingPoint' ->> 'radius' from public.games where slug = 'vp-tien') <> '20' then raise exception 'template niet bijgewerkt'; end if;
  if (select settings -> 'meetingPoint' ->> 'radius' from public.games where slug = 'vp-dertig') <> '30' then raise exception 'eigen straal veranderd'; end if;
  if (select value ->> 'radius' from public.overrides where game_id = 'f1000000-0000-0000-0000-000000000003') <> '20' then raise exception 'stad niet bijgewerkt'; end if;
  if (select snapshot -> 'game' -> 'settings' -> 'meetingPoint' ->> 'radius' from public.base_versions where game_id = 'f1000000-0000-0000-0000-000000000001') <> '20' then
    raise exception 'templateversie niet bijgewerkt';
  end if;
end $$;

\echo Alle tests voor het verzamelpunt geslaagd
rollback;
