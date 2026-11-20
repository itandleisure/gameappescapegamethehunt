-- Op maat maken: de migratie voor de oplossing van de morsecode nog een keer
-- draaien op testgegevens, en controleren dat een klantvariant de oplossing
-- daarna mag aanpassen (en een stad niet).
\set ON_ERROR_STOP on
begin;

insert into auth.users (id, is_anonymous) values ('f2000000-0000-0000-0000-000000000001', false);
select set_config('request.jwt.claim.sub', 'f2000000-0000-0000-0000-000000000001', true);
select stub.create_organization('Op Maat BV') as org \gset

insert into public.games (id, org_id, layer, slug) values
  ('f2100000-0000-0000-0000-000000000001', :'org', 'base', 'om-template');
insert into public.tasks (id, game_id, key, position, answer) values
  ('f2200000-0000-0000-0000-000000000001', 'f2100000-0000-0000-0000-000000000001', 'puzzel-morse', 1, '{"type":"number","value":159}');
insert into public.overridable_fields (game_id, task_id, field, layers) values
  ('f2100000-0000-0000-0000-000000000001', 'f2200000-0000-0000-0000-000000000001', 'hints', array['city','client']::public.game_layer[]);
insert into public.base_versions (game_id, version, snapshot)
values ('f2100000-0000-0000-0000-000000000001', 1, public.layer_snapshot('f2100000-0000-0000-0000-000000000001'));
insert into public.games (id, org_id, layer, slug, parent_id, base_version) values
  ('f2100000-0000-0000-0000-000000000002', :'org', 'city', 'om-stad', 'f2100000-0000-0000-0000-000000000001', 1);
insert into public.games (id, org_id, layer, slug, parent_id) values
  ('f2100000-0000-0000-0000-000000000003', :'org', 'client', 'om-stad-groep', 'f2100000-0000-0000-0000-000000000002');

\i supabase/migrations/20261121200000_op_maat_morse_oplossing.sql
-- Twee keer draaien mag geen dubbele regels geven.
\i supabase/migrations/20261121200000_op_maat_morse_oplossing.sql

do $$ begin
  if (select count(*) from public.overridable_fields
      where task_id = 'f2200000-0000-0000-0000-000000000001' and field = 'answer') <> 1 then
    raise exception 'oplossing niet (precies één keer) aanpasbaar gemaakt';
  end if;
  if (select count(*) from public.base_versions bv, jsonb_array_elements(bv.snapshot -> 'overridable') o
      where bv.game_id = 'f2100000-0000-0000-0000-000000000001' and o ->> 'field' = 'answer'
        and o ->> 'task_id' = 'f2200000-0000-0000-0000-000000000001' and o -> 'layers' = '["client"]') <> 1 then
    raise exception 'templateversie niet (precies één keer) bijgewerkt';
  end if;
  if not public.may_override('f2100000-0000-0000-0000-000000000003', 'f2200000-0000-0000-0000-000000000001', 'answer') then
    raise exception 'klantvariant mag de oplossing niet aanpassen';
  end if;
  if public.may_override('f2100000-0000-0000-0000-000000000002', 'f2200000-0000-0000-0000-000000000001', 'answer') then
    raise exception 'stad mag de oplossing ineens wel aanpassen';
  end if;
end $$;

-- En de klantvariant kan hem echt opslaan.
insert into public.overrides (game_id, task_id, field, value) values
  ('f2100000-0000-0000-0000-000000000003', 'f2200000-0000-0000-0000-000000000001', 'answer', '{"type":"number","value":271}');

\echo Alle tests voor op maat maken geslaagd
rollback;
