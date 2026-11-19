-- De migratie voor de blokjespuzzel (314 en 413) nog een keer draaien op
-- testgegevens met het oude bereik, en controleren wat er verandert.
\set ON_ERROR_STOP on
begin;

insert into auth.users (id, is_anonymous) values ('e0000000-0000-0000-0000-000000000001', false);
select set_config('request.jwt.claim.sub', 'e0000000-0000-0000-0000-000000000001', true);
select stub.create_organization('Blokjes BV') as org \gset

insert into public.games (id, org_id, layer, slug) values ('e1000000-0000-0000-0000-000000000001', :'org', 'base', 'blokjes-test');
insert into public.tasks (game_id, key, answer) values
  ('e1000000-0000-0000-0000-000000000001', 'puzzel-blokjes', '{"type":"number","value":363.5,"tolerance":49.5}'),
  ('e1000000-0000-0000-0000-000000000001', 'puzzel-cryptex', '{"type":"number","value":390}');
insert into public.puzzles (org_id, name, answer) values
  (:'org', 'Blokjespuzzel', '{"type":"number","value":363.5,"tolerance":49.5}'),
  (:'org', 'Eigen blokjes', '{"type":"number","value":200}');
insert into public.base_versions (game_id, version, snapshot)
values ('e1000000-0000-0000-0000-000000000001', 7, public.layer_snapshot('e1000000-0000-0000-0000-000000000001'));

\i supabase/migrations/20261120035500_blokjespuzzel_twee_antwoorden.sql

do $$
declare
  goed jsonb := '{"type":"text","accepted":["314","413"]}';
begin
  if (select answer from public.tasks where key = 'puzzel-blokjes' and game_id = 'e1000000-0000-0000-0000-000000000001') <> goed then
    raise exception 'opdracht niet bijgewerkt';
  end if;
  if (select answer from public.tasks where key = 'puzzel-cryptex' and game_id = 'e1000000-0000-0000-0000-000000000001') <> '{"type":"number","value":390}' then
    raise exception 'andere opdracht veranderd';
  end if;
  if (select answer from public.puzzles where name = 'Blokjespuzzel') <> goed then raise exception 'puzzel niet bijgewerkt'; end if;
  if (select answer from public.puzzles where name = 'Eigen blokjes') <> '{"type":"number","value":200}' then raise exception 'eigen puzzel veranderd'; end if;
  if (select t -> 'answer' from public.base_versions b, jsonb_array_elements(b.snapshot -> 'tasks') t
      where b.version = 7 and b.game_id = 'e1000000-0000-0000-0000-000000000001' and t ->> 'key' = 'puzzel-blokjes') <> goed then
    raise exception 'templateversie niet bijgewerkt';
  end if;
end $$;

\echo Alle tests voor de blokjespuzzel geslaagd
rollback;
