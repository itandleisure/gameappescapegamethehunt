-- De migratie voor het kaartje van het speelveld (uitleg-02) nog een keer
-- draaien op testgegevens, en controleren wat er verandert.
\set ON_ERROR_STOP on
begin;

insert into auth.users (id, is_anonymous) values ('f0000000-0000-0000-0000-000000000012', false);
select set_config('request.jwt.claim.sub', 'f0000000-0000-0000-0000-000000000012', true);
select stub.create_organization('Speelveld BV') as org \gset

insert into public.games (id, org_id, layer, slug) values
  ('f3000000-0000-0000-0000-000000000001', :'org', 'base', 'speelveld-template'),
  ('f3000000-0000-0000-0000-000000000002', :'org', 'base', 'ander-spel');
insert into public.tasks (game_id, key, position, answer, settings) values
  ('f3000000-0000-0000-0000-000000000001', 'uitleg-02', 2, '{"type":"info"}', '{"image":"https://voorbeeld.nl/foto.jpg"}'),
  ('f3000000-0000-0000-0000-000000000001', 'uitleg-03', 3, '{"type":"info"}', '{}'),
  ('f3000000-0000-0000-0000-000000000002', 'uitleg-02', 2, '{"type":"info"}', '{}');
insert into public.translations (game_id, entity, entity_id, field, lang, text) values
  ('f3000000-0000-0000-0000-000000000001', 'task', 'uitleg-02', 'title', 'nl', 'Speelveld'),
  ('f3000000-0000-0000-0000-000000000002', 'task', 'uitleg-02', 'title', 'nl', 'Iets anders');
insert into public.base_versions (game_id, version, snapshot)
values ('f3000000-0000-0000-0000-000000000001', 7, public.layer_snapshot('f3000000-0000-0000-0000-000000000001'));

\i supabase/migrations/20261120150000_speelveld_kaartje.sql
-- Nog een keer: verandert niets meer.
\i supabase/migrations/20261120150000_speelveld_kaartje.sql

do $$
declare
  v_g uuid := 'f3000000-0000-0000-0000-000000000001';
begin
  if (select settings from public.tasks where game_id = v_g and key = 'uitleg-02')
     <> '{"image":"https://voorbeeld.nl/foto.jpg","playfieldImage":true}'::jsonb then
    raise exception 'uitleg-02 niet goed: %', (select settings from public.tasks where game_id = v_g and key = 'uitleg-02');
  end if;
  if (select settings from public.tasks where game_id = v_g and key = 'uitleg-03') <> '{}'::jsonb then
    raise exception 'ander uitlegscherm veranderd';
  end if;
  if (select settings from public.tasks where game_id = 'f3000000-0000-0000-0000-000000000002' and key = 'uitleg-02') <> '{}'::jsonb then
    raise exception 'ander spel veranderd';
  end if;
  if (select (x -> 'settings' ->> 'playfieldImage')::boolean from public.base_versions b, jsonb_array_elements(b.snapshot -> 'tasks') x
      where b.game_id = v_g and x ->> 'key' = 'uitleg-02') is not true then
    raise exception 'templateversie niet bijgewerkt';
  end if;
  if (select x -> 'settings' ->> 'image' from public.base_versions b, jsonb_array_elements(b.snapshot -> 'tasks') x
      where b.game_id = v_g and x ->> 'key' = 'uitleg-02') <> 'https://voorbeeld.nl/foto.jpg' then
    raise exception 'foto in templateversie weg';
  end if;
end $$;

\echo Alle tests voor het kaartje van het speelveld geslaagd
rollback;
