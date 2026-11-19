-- De migratie voor de tip "Houd het spel open in beeld" (uitleg-11) nog een
-- keer draaien op testgegevens, en controleren wat er verandert.
\set ON_ERROR_STOP on
begin;

insert into auth.users (id, is_anonymous) values ('f0000000-0000-0000-0000-000000000011', false);
select set_config('request.jwt.claim.sub', 'f0000000-0000-0000-0000-000000000011', true);
select stub.create_organization('Uitleg BV') as org \gset

insert into public.games (id, org_id, layer, slug) values
  ('f2000000-0000-0000-0000-000000000001', :'org', 'base', 'uitleg-template');
insert into public.translations (game_id, entity, entity_id, field, lang, text) values
  ('f2000000-0000-0000-0000-000000000001', 'task', 'uitleg-11', 'body', 'nl',
   E'- Wees voorzichtig\n- Zet wifi uit\n- Blijf in de Loquiz-gameapp en houd je scherm actief\n\nChatten\nHet is mogelijk om binnen de Loquiz app te chatten.'),
  ('f2000000-0000-0000-0000-000000000001', 'task', 'uitleg-11', 'body', 'en',
   E'- Be careful\n- Stay in the Loquiz game app and keep your screen active'),
  ('f2000000-0000-0000-0000-000000000001', 'task', 'uitleg-11', 'body', 'de',
   E'- Selbst geschrieben, ohne alte Zeile'),
  ('f2000000-0000-0000-0000-000000000001', 'task', 'uitleg-02', 'body', 'nl',
   E'- Zet locatie aan voor de Loquiz-app');
insert into public.base_versions (game_id, version, snapshot)
values ('f2000000-0000-0000-0000-000000000001', 7, public.layer_snapshot('f2000000-0000-0000-0000-000000000001'));

\i supabase/migrations/20261120140000_uitleg_spel_open_houden.sql
-- Nog een keer: verandert niets meer.
\i supabase/migrations/20261120140000_uitleg_spel_open_houden.sql

do $$
declare
  v_nl text := E'- Houd het spel open in beeld: vergrendel je telefoon niet en ga niet naar een andere app (zoals WhatsApp of de camera). Anders stopt de GPS en gaan opdrachten niet vanzelf open.\n- Wees voorzichtig\n- Zet wifi uit\n\nChatten\nHet is mogelijk om binnen de Loquiz app te chatten.';
  v_g uuid := 'f2000000-0000-0000-0000-000000000001';
begin
  if (select text from public.translations where game_id = v_g and entity_id = 'uitleg-11' and lang = 'nl') <> v_nl then
    raise exception 'nl niet goed: %', (select text from public.translations where game_id = v_g and entity_id = 'uitleg-11' and lang = 'nl');
  end if;
  if (select text from public.translations where game_id = v_g and entity_id = 'uitleg-11' and lang = 'en')
     <> E'- Keep the game open on screen: don''t lock your phone or switch to another app (like WhatsApp or the camera). Otherwise GPS stops and tasks won''t open by themselves.\n- Be careful\n' then
    raise exception 'en niet goed: %', (select text from public.translations where game_id = v_g and entity_id = 'uitleg-11' and lang = 'en');
  end if;
  if (select text from public.translations where game_id = v_g and entity_id = 'uitleg-11' and lang = 'de') <> '- Selbst geschrieben, ohne alte Zeile' then
    raise exception 'eigen tekst veranderd';
  end if;
  if (select text from public.translations where game_id = v_g and entity_id = 'uitleg-02') <> '- Zet locatie aan voor de Loquiz-app' then
    raise exception 'ander uitlegscherm veranderd';
  end if;
  if (select x ->> 'text' from public.base_versions b, jsonb_array_elements(b.snapshot -> 'translations') x
      where b.game_id = v_g and x ->> 'entity_id' = 'uitleg-11' and x ->> 'lang' = 'nl') <> v_nl then
    raise exception 'templateversie niet bijgewerkt';
  end if;
end $$;

\echo Alle tests voor de tip over het spel open houden geslaagd
rollback;
