-- Blokjespuzzel: de goede antwoorden zijn 314 en 413. Loquiz kende alleen een
-- bereik, dus de import maakte er "363,5 plus of min 49,5" van (alles tussen
-- 314 en 413 goed). Nu precies die twee antwoorden, als lijst met goede
-- antwoorden. Alleen waar nog het oude bereik staat; eigen aanpassingen
-- blijven staan. Gepubliceerde versies veranderen niet; die krijgen het
-- nieuwe antwoord bij de volgende keer publiceren.

create function pg_temp.is_oud(p jsonb) returns boolean language sql immutable as $$
  select p ->> 'type' = 'number' and (p ->> 'value')::numeric = 363.5 and (p ->> 'tolerance')::numeric = 49.5
$$;

-- Opdrachten in templates, steden en klanten.
update public.tasks set answer = '{"type":"text","accepted":["314","413"]}'::jsonb
where key = 'puzzel-blokjes' and pg_temp.is_oud(answer);

-- Aanpassingen van een antwoord per laag.
update public.overrides set value = '{"type":"text","accepted":["314","413"]}'::jsonb
where field = 'answer' and jsonb_typeof(value) = 'object' and pg_temp.is_oud(value);

-- De lijst met fysieke puzzels.
update public.puzzles set answer = '{"type":"text","accepted":["314","413"]}'::jsonb, updated_at = now()
where pg_temp.is_oud(answer);

-- Vastgelegde templateversies, waar steden op draaien.
update public.base_versions b set snapshot = jsonb_set(b.snapshot, '{tasks}', (
  select jsonb_agg(
    case when t ->> 'key' = 'puzzel-blokjes' and pg_temp.is_oud(t -> 'answer')
      then jsonb_set(t, '{answer}', '{"type":"text","accepted":["314","413"]}'::jsonb)
      else t end
    order by i)
  from jsonb_array_elements(b.snapshot -> 'tasks') with ordinality as x(t, i)
))
where jsonb_typeof(b.snapshot -> 'tasks') = 'array' and jsonb_array_length(b.snapshot -> 'tasks') > 0
  and exists (
    select 1 from jsonb_array_elements(b.snapshot -> 'tasks') t
    where t ->> 'key' = 'puzzel-blokjes' and pg_temp.is_oud(t -> 'answer')
  );
