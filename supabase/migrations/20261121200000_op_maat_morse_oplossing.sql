-- =============================================================================
-- Op maat maken: de oplossing van de morsecodepuzzel mag per groep anders
--
-- Een op-maat-versie (klantvariant) van een stad mocht al de hints van de
-- morsecodepuzzel en de twee lokale vragen aanpassen. Krijgt een groep een
-- eigen morsecode op papier, dan kan nu ook de oplossing anders zijn.
--
-- Dit is alleen een extra toestemming. Hij komt in elk basisspel met een
-- opdracht 'puzzel-morse', en ook in de vastgezette templateversies daarvan,
-- zodat het voor steden op elke versie werkt. Verder verandert er niets aan
-- die versies.
-- =============================================================================

insert into public.overridable_fields (game_id, task_id, field, layers, label)
select t.game_id, t.id, 'answer', array['client']::public.game_layer[], 'Oplossing morsecodepuzzel'
from public.tasks t
join public.games g on g.id = t.game_id and g.layer = 'base'
where t.key = 'puzzel-morse'
  and not exists (
    select 1 from public.overridable_fields f
    where f.game_id = t.game_id and f.task_id = t.id and f.field = 'answer'
  );

update public.base_versions bv
set snapshot = jsonb_set(
  bv.snapshot,
  '{overridable}',
  coalesce(bv.snapshot->'overridable', '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
    'task_id', m.task_id,
    'field', 'answer',
    'layers', jsonb_build_array('client'),
    'label', 'Oplossing morsecodepuzzel'
  ))
)
from (
  select v.game_id, v.version, task->>'id' as task_id
  from public.base_versions v,
       jsonb_array_elements(coalesce(v.snapshot->'tasks', '[]'::jsonb)) task
  where task->>'key' = 'puzzel-morse'
) m
where m.game_id = bv.game_id
  and m.version = bv.version
  and not exists (
    select 1 from jsonb_array_elements(coalesce(bv.snapshot->'overridable', '[]'::jsonb)) o
    where o->>'task_id' = m.task_id and o->>'field' = 'answer'
  );
