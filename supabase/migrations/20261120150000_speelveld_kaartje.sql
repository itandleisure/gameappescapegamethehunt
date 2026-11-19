-- Speluitleg, scherm "Speelveld" (uitleg-02): voortaan staat daar een kaartje
-- van het getekende speelveld van de stad in plaats van de vaste foto (die
-- kwam uit Loquiz en liet het speelveld van Leeuwarden zien).
--
-- De opdracht krijgt de instelling playfieldImage. Bij het publiceren maakt de
-- beheeromgeving het kaartje van de speelveldgrens van de stad en zet het als
-- foto in het spel (zie apps/admin/src/lib/playfield-image.ts). Zonder
-- getekende grens blijft de oude foto staan.
--
-- Alleen opdrachten uitleg-02 met de Nederlandse titel "Speelveld", in de
-- spellen zelf en in de vastgelegde templateversies waar steden op draaien.
-- Veilig om vaker te draaien.

update public.tasks t
   set settings = coalesce(t.settings, '{}'::jsonb) || '{"playfieldImage": true}'::jsonb
 where t.key = 'uitleg-02'
   and coalesce((t.settings ->> 'playfieldImage')::boolean, false) = false
   and exists (
     select 1 from public.translations tr
      where tr.game_id = t.game_id and tr.entity = 'task' and tr.entity_id = 'uitleg-02'
        and tr.field = 'title' and tr.lang = 'nl' and trim(tr.text) = 'Speelveld'
   );

update public.base_versions b
   set snapshot = jsonb_set(b.snapshot, '{tasks}', (
     select jsonb_agg(
       case when x ->> 'key' = 'uitleg-02'
            then jsonb_set(x, '{settings}', coalesce(nullif(x -> 'settings', 'null'::jsonb), '{}'::jsonb) || '{"playfieldImage": true}'::jsonb)
            else x end
       order by i)
     from jsonb_array_elements(b.snapshot -> 'tasks') with ordinality as e(x, i)
   ))
 where jsonb_typeof(b.snapshot -> 'tasks') = 'array'
   and exists (
     select 1 from jsonb_array_elements(b.snapshot -> 'tasks') x
      where x ->> 'key' = 'uitleg-02'
        and coalesce((x -> 'settings' ->> 'playfieldImage')::boolean, false) = false
   )
   and exists (
     select 1 from jsonb_array_elements(b.snapshot -> 'translations') tr
      where tr ->> 'entity' = 'task' and tr ->> 'entity_id' = 'uitleg-02'
        and tr ->> 'field' = 'title' and tr ->> 'lang' = 'nl' and trim(tr ->> 'text') = 'Speelveld'
   );
