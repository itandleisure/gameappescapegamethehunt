-- Speluitleg (uitleg-01 t/m uitleg-12): het woord "Loquiz" eruit. Spelers
-- spelen in de eigen webapp, niet meer in Loquiz.
--   "voor de Loquiz-app"            -> "voor de app"         (scherm 2)
--   "binnen de Loquiz app te chatten" -> "binnen de app te chatten" (scherm 11)
-- Werkt in elke taal: "Loquiz" met een streepje of spatie ervoor een woord
-- valt weg, een losse "Loquiz" (bijvoorbeeld "l'application Loquiz") ook.
-- Alleen teksten van de uitlegschermen, ook in vastgelegde templateversies.
-- Veilig om vaker te draaien.

create or replace function pg_temp.zonder_loquiz(p_text text) returns text
language sql immutable as $$
  select regexp_replace(regexp_replace(p_text, 'Loquiz[- ](?=\w)', '', 'g'), '\s*Loquiz', '', 'g')
$$;

update public.translations
   set text = pg_temp.zonder_loquiz(text), updated_at = now()
 where entity = 'task' and entity_id like 'uitleg-%' and text ~ 'Loquiz';

update public.base_versions b
   set snapshot = jsonb_set(b.snapshot, '{translations}', (
     select jsonb_agg(
       case when x ->> 'entity' = 'task' and x ->> 'entity_id' like 'uitleg-%' and x ->> 'text' ~ 'Loquiz'
            then jsonb_set(x, '{text}', to_jsonb(pg_temp.zonder_loquiz(x ->> 'text')))
            else x end
       order by i)
     from jsonb_array_elements(b.snapshot -> 'translations') with ordinality as e(x, i)
   ))
 where jsonb_typeof(b.snapshot -> 'translations') = 'array'
   and exists (
     select 1 from jsonb_array_elements(b.snapshot -> 'translations') x
     where x ->> 'entity' = 'task' and x ->> 'entity_id' like 'uitleg-%' and x ->> 'text' ~ 'Loquiz'
   );
