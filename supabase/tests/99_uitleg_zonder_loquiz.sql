-- De migratie die "Loquiz" uit de speluitleg haalt nog een keer draaien op
-- testgegevens, en controleren wat er verandert.
\set ON_ERROR_STOP on
begin;

insert into auth.users (id, is_anonymous) values ('f0000000-0000-0000-0000-000000000012', false);
select set_config('request.jwt.claim.sub', 'f0000000-0000-0000-0000-000000000012', true);
select stub.create_organization('Loquizloos BV') as org \gset

insert into public.games (id, org_id, layer, slug) values
  ('f3000000-0000-0000-0000-000000000001', :'org', 'base', 'zonder-loquiz');
insert into public.translations (game_id, entity, entity_id, field, lang, text) values
  ('f3000000-0000-0000-0000-000000000001', 'task', 'uitleg-02', 'body', 'nl', 'Zet locatie aan voor de Loquiz-app.'),
  ('f3000000-0000-0000-0000-000000000001', 'task', 'uitleg-11', 'body', 'nl', 'Het is mogelijk om binnen de Loquiz app te chatten.'),
  ('f3000000-0000-0000-0000-000000000001', 'task', 'uitleg-11', 'body', 'fr', 'Vous pouvez discuter dans l''application Loquiz.'),
  ('f3000000-0000-0000-0000-000000000001', 'task', 'puzzel-1', 'body', 'nl', 'Een puzzel over Loquiz-app.');
insert into public.base_versions (game_id, version, snapshot)
values ('f3000000-0000-0000-0000-000000000001', 7, public.layer_snapshot('f3000000-0000-0000-0000-000000000001'));

\i supabase/migrations/20261120155000_uitleg_zonder_loquiz.sql
\i supabase/migrations/20261120155000_uitleg_zonder_loquiz.sql

do $$
declare v_g uuid := 'f3000000-0000-0000-0000-000000000001';
begin
  if (select text from public.translations where game_id = v_g and entity_id = 'uitleg-02') <> 'Zet locatie aan voor de app.' then
    raise exception 'scherm 2: %', (select text from public.translations where game_id = v_g and entity_id = 'uitleg-02');
  end if;
  if (select text from public.translations where game_id = v_g and entity_id = 'uitleg-11' and lang = 'nl') <> 'Het is mogelijk om binnen de app te chatten.' then
    raise exception 'scherm 11 nl: %', (select text from public.translations where game_id = v_g and entity_id = 'uitleg-11' and lang = 'nl');
  end if;
  if (select text from public.translations where game_id = v_g and entity_id = 'uitleg-11' and lang = 'fr') <> 'Vous pouvez discuter dans l''application.' then
    raise exception 'scherm 11 fr: %', (select text from public.translations where game_id = v_g and entity_id = 'uitleg-11' and lang = 'fr');
  end if;
  if (select text from public.translations where game_id = v_g and entity_id = 'puzzel-1') <> 'Een puzzel over Loquiz-app.' then
    raise exception 'andere opdracht veranderd';
  end if;
  if (select x ->> 'text' from public.base_versions b, jsonb_array_elements(b.snapshot -> 'translations') x
      where b.game_id = v_g and x ->> 'entity_id' = 'uitleg-02') <> 'Zet locatie aan voor de app.' then
    raise exception 'templateversie niet bijgewerkt';
  end if;
end $$;

\echo Alle tests voor de speluitleg zonder Loquiz geslaagd
rollback;
