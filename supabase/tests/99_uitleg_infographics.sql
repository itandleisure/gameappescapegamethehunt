-- De migratie voor de infographics van de speluitleg (en het nieuwe scherm
-- "Batterij leeg?") nog een keer draaien op testgegevens, en controleren wat
-- er verandert.
\set ON_ERROR_STOP on
begin;

insert into auth.users (id, is_anonymous) values ('f0000000-0000-0000-0000-000000000013', false);
select set_config('request.jwt.claim.sub', 'f0000000-0000-0000-0000-000000000013', true);
select stub.create_organization('Infographics BV') as org \gset

insert into public.games (id, org_id, layer, slug, settings) values
  ('f3000000-0000-0000-0000-000000000001', :'org', 'base', 'infographics-template',
   '{"sequences":[{"id":"intro","tasks":["uitleg-01","uitleg-02","uitleg-06","uitleg-11","uitleg-12"]}]}'::jsonb),
  ('f3000000-0000-0000-0000-000000000002', :'org', 'base', 'ander-spel', '{"sequences":[]}'::jsonb);
insert into public.tasks (game_id, key, position, settings) values
  ('f3000000-0000-0000-0000-000000000001', 'uitleg-01', 0, '{}'),
  ('f3000000-0000-0000-0000-000000000001', 'uitleg-02', 1, '{"playfieldImage":true}'),
  ('f3000000-0000-0000-0000-000000000001', 'uitleg-06', 2, '{"illustration":"extractiepunt"}'),
  ('f3000000-0000-0000-0000-000000000001', 'uitleg-11', 3, '{"illustration":"eigen"}'),
  ('f3000000-0000-0000-0000-000000000001', 'uitleg-12', 4, '{}'),
  ('f3000000-0000-0000-0000-000000000002', 'uitleg-12', 0, '{}');
insert into public.translations (game_id, entity, entity_id, field, lang, text) values
  ('f3000000-0000-0000-0000-000000000001', 'task', 'uitleg-12', 'title', 'nl', 'Start van het spel'),
  ('f3000000-0000-0000-0000-000000000001', 'task', 'uitleg-12', 'title', 'en', 'Start of the game');
insert into public.rules (game_id, key, position, label, condition, actions) values
  ('f3000000-0000-0000-0000-000000000001', 'introreeks', 0, '0 - Uitleg starten (12 schermen)', '{}',
   '[{"kind":"startSequence","sequence":"intro"}]'),
  ('f3000000-0000-0000-0000-000000000001', 'na-uitleg', 1, 'Na de uitleg', '{}',
   '[{"kind":"show","select":{"tasks":["uitleg-01","uitleg-12"]},"on":{"playground":"speluitleg"}},{"kind":"show","select":{"tag":"track"},"on":"map"}]');
insert into public.base_versions (game_id, version, snapshot)
values ('f3000000-0000-0000-0000-000000000001', 3, public.layer_snapshot('f3000000-0000-0000-0000-000000000001'));

\i supabase/migrations/20261121320000_uitleg_infographics.sql
-- Nog een keer: verandert niets meer.
\i supabase/migrations/20261121320000_uitleg_infographics.sql

do $$
declare
  v_g uuid := 'f3000000-0000-0000-0000-000000000001';
  v_s jsonb;
begin
  if (select settings from public.tasks where game_id = v_g and key = 'uitleg-01') <> '{"illustration":"uitleg-speluitleg"}' then
    raise exception 'uitleg-01 zonder infographic';
  end if;
  if (select settings from public.tasks where game_id = v_g and key = 'uitleg-02') <> '{"playfieldImage":true,"illustration":"uitleg-speelveld"}' then
    raise exception 'uitleg-02 niet goed: %', (select settings from public.tasks where game_id = v_g and key = 'uitleg-02');
  end if;
  if (select settings ->> 'illustration' from public.tasks where game_id = v_g and key = 'uitleg-06') <> 'uitleg-extractiepunt' then
    raise exception 'oude tekening extractiepunt niet vervangen';
  end if;
  if (select settings ->> 'illustration' from public.tasks where game_id = v_g and key = 'uitleg-11') <> 'eigen' then
    raise exception 'eigen tekening overschreven';
  end if;
  if (select count(*) from public.tasks where key = 'uitleg-13') <> 1 then
    raise exception 'uitleg-13 niet precies één keer (alleen in het uitlegspel)';
  end if;
  if (select string_agg(lang || ':' || field, ',' order by lang, field) from public.translations
       where game_id = v_g and entity_id = 'uitleg-13') <> 'en:body,en:title,nl:body,nl:title' then
    raise exception 'teksten uitleg-13 niet goed';
  end if;
  if (select text from public.translations where game_id = v_g and entity_id = 'uitleg-13' and field = 'title' and lang = 'nl') <> 'Batterij leeg?' then
    raise exception 'titel uitleg-13 niet goed';
  end if;
  if (select settings -> 'sequences' -> 0 -> 'tasks' from public.games where id = v_g)
     <> '["uitleg-01","uitleg-02","uitleg-06","uitleg-11","uitleg-13","uitleg-12"]' then
    raise exception 'reeks niet goed: %', (select settings -> 'sequences' from public.games where id = v_g);
  end if;
  if (select actions -> 0 -> 'select' -> 'tasks' from public.rules where game_id = v_g and key = 'na-uitleg')
     <> '["uitleg-01","uitleg-12","uitleg-13"]' then
    raise exception 'regel na-uitleg niet goed';
  end if;
  if (select label from public.rules where game_id = v_g and key = 'introreeks') <> '0 - Uitleg starten (13 schermen)' then
    raise exception 'label introreeks niet goed';
  end if;

  select snapshot into v_s from public.base_versions where game_id = v_g;
  if (select count(*) from jsonb_array_elements(v_s -> 'tasks') x where x ->> 'key' = 'uitleg-13') <> 1 then
    raise exception 'templateversie zonder (of met dubbel) uitleg-13';
  end if;
  if (select x -> 'settings' ->> 'illustration' from jsonb_array_elements(v_s -> 'tasks') x where x ->> 'key' = 'uitleg-06') <> 'uitleg-extractiepunt' then
    raise exception 'templateversie zonder infographic';
  end if;
  if (select count(*) from jsonb_array_elements(v_s -> 'translations') x where x ->> 'entity_id' = 'uitleg-13') <> 4 then
    raise exception 'templateversie: teksten uitleg-13 niet goed';
  end if;
  if v_s -> 'game' -> 'settings' -> 'sequences' -> 0 -> 'tasks' -> 4 <> '"uitleg-13"' then
    raise exception 'templateversie: reeks niet goed';
  end if;
  if (select r ->> 'label' from jsonb_array_elements(v_s -> 'rules') r where r ->> 'key' = 'introreeks') <> '0 - Uitleg starten (13 schermen)' then
    raise exception 'templateversie: label niet goed';
  end if;
end $$;

\echo Alle tests voor de infographics van de speluitleg geslaagd
rollback;
