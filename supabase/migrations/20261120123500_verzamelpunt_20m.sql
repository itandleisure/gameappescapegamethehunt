-- Verzamelpunt (meeting point): de cirkel is voortaan standaard 20 meter
-- straal. Waar de oude standaard van 10 meter vast is opgeslagen (de
-- kaartpagina slaat de straal altijd mee op), zetten we die op 20. Andere
-- waarden blijven staan. Gepubliceerde versies veranderen niet; die krijgen
-- de nieuwe straal bij de volgende keer publiceren. Veilig om vaker te draaien.

-- Templates (en andere spellen) met het verzamelpunt in de instellingen.
update public.games
set settings = jsonb_set(settings, '{meetingPoint,radius}', '20'::jsonb)
where (settings -> 'meetingPoint' ->> 'radius')::numeric = 10;

-- Steden en klanten met een eigen verzamelpunt.
update public.overrides
set value = jsonb_set(value, '{radius}', '20'::jsonb)
where field = 'meetingPoint' and task_id is null
  and jsonb_typeof(value) = 'object' and (value ->> 'radius')::numeric = 10;

-- Vastgelegde templateversies, waar steden op draaien.
update public.base_versions
set snapshot = jsonb_set(snapshot, '{game,settings,meetingPoint,radius}', '20'::jsonb)
where (snapshot -> 'game' -> 'settings' -> 'meetingPoint' ->> 'radius')::numeric = 10;

update public.base_versions b
set snapshot = jsonb_set(b.snapshot, '{overrides}', (
  select jsonb_agg(
    case when o ->> 'field' = 'meetingPoint' and jsonb_typeof(o -> 'value') = 'object' and (o -> 'value' ->> 'radius')::numeric = 10
      then jsonb_set(o, '{value,radius}', '20'::jsonb)
      else o end
    order by i)
  from jsonb_array_elements(b.snapshot -> 'overrides') with ordinality as x(o, i)
))
where jsonb_typeof(b.snapshot -> 'overrides') = 'array'
  and exists (
    select 1 from jsonb_array_elements(b.snapshot -> 'overrides') o
    where o ->> 'field' = 'meetingPoint' and jsonb_typeof(o -> 'value') = 'object' and (o -> 'value' ->> 'radius')::numeric = 10
  );
