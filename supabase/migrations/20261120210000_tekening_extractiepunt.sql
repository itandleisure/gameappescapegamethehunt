-- Speluitleg, scherm "Extractiepunt" (uitleg-06): voortaan een tekening in de
-- huisstijl in plaats van de losse finishvlag. Bovenste rij: alle puzzels
-- opgelost geeft één finishvlag. Onderste rij: niet alles opgelost geeft na 75
-- minuten drie mogelijke extractiepunten. Zonder tekst, dus voor elke taal.
--
-- De opdracht krijgt de instelling illustration = 'extractiepunt'. Bij het
-- publiceren zet de beheeromgeving de tekening (public/illustraties/
-- extractiepunt.png) in de bucket media en als foto in het spel (zie
-- apps/admin/src/lib/illustrations.ts). Tot het publiceren blijft de oude foto.
--
-- Alleen opdrachten uitleg-06 met de Nederlandse titel "Extractiepunt", in de
-- spellen zelf en in de vastgelegde templateversies waar steden op draaien.
-- Veilig om vaker te draaien.

update public.tasks t
   set settings = coalesce(t.settings, '{}'::jsonb) || '{"illustration": "extractiepunt"}'::jsonb
 where t.key = 'uitleg-06'
   and t.settings ->> 'illustration' is null
   and exists (
     select 1 from public.translations tr
      where tr.game_id = t.game_id and tr.entity = 'task' and tr.entity_id = 'uitleg-06'
        and tr.field = 'title' and tr.lang = 'nl' and trim(tr.text) = 'Extractiepunt'
   );

update public.base_versions b
   set snapshot = jsonb_set(b.snapshot, '{tasks}', (
     select jsonb_agg(
       case when x ->> 'key' = 'uitleg-06'
            then jsonb_set(x, '{settings}', coalesce(nullif(x -> 'settings', 'null'::jsonb), '{}'::jsonb) || '{"illustration": "extractiepunt"}'::jsonb)
            else x end
       order by i)
     from jsonb_array_elements(b.snapshot -> 'tasks') with ordinality as e(x, i)
   ))
 where jsonb_typeof(b.snapshot -> 'tasks') = 'array'
   and exists (
     select 1 from jsonb_array_elements(b.snapshot -> 'tasks') x
      where x ->> 'key' = 'uitleg-06'
        and x -> 'settings' ->> 'illustration' is null
   )
   and exists (
     select 1 from jsonb_array_elements(b.snapshot -> 'translations') tr
      where tr ->> 'entity' = 'task' and tr ->> 'entity_id' = 'uitleg-06'
        and tr ->> 'field' = 'title' and tr ->> 'lang' = 'nl' and trim(tr ->> 'text') = 'Extractiepunt'
   );
