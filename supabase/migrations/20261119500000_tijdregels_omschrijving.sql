-- Omschrijvingen van de tijdregels uit Template v1 korter, met de minuten
-- vooraan: "10 - Puzzel 1 vrijgeven" in plaats van
-- "Na 10 minuten: bericht en nieuwe puzzel".
--
-- Alleen regels waarvan de omschrijving nog de tekst uit de template is (ook
-- als de tijd al is aangepast). Zelf geschreven omschrijvingen blijven staan.
-- De minuten komen uit de voorwaarde van de regel zelf.

create or replace function pg_temp.minuten(m numeric) returns text
language sql immutable as $$
  select case when m = floor(m) then floor(m)::int::text
              else floor(m)::int::text || ':' || lpad(round((m - floor(m)) * 60)::int::text, 2, '0') end
$$;

-- Puzzels: tijdlijn-10 is puzzel 1, tijdlijn-20 puzzel 2, enzovoort.
update public.rules
   set label = pg_temp.minuten((condition->>'minutes')::numeric)
            || ' - Puzzel ' || (substring(key from '^tijdlijn-(\d+)$')::int / 10) || ' vrijgeven'
 where key ~ '^tijdlijn-(10|20|30|40|50|60)$'
   and condition->>'kind' = 'elapsed'
   and label ~ '^Na .+: bericht en nieuwe puzzel$';

update public.rules
   set label = pg_temp.minuten((condition->>'minutes')::numeric) || ' - Fotomissie vrijgeven'
 where key = 'fotomissie'
   and condition->>'kind' = 'elapsed'
   and label ~ '^Na .+: fotomissie$';

-- Uitleg en finale: de tijd zit in een samengestelde voorwaarde.
update public.rules
   set label = coalesce(
         pg_temp.minuten((select (c->>'minutes')::numeric from jsonb_array_elements(condition->'conditions') c
                           where c->>'kind' = 'elapsed' limit 1)), '0')
       || ' - Uitleg starten (12 schermen)'
 where key = 'introreeks'
   and label like 'Bij de start: 12 uitlegschermen na elkaar%';

update public.rules
   set label = pg_temp.minuten((select (c->>'minutes')::numeric from jsonb_array_elements(condition->'conditions') c
                                 where c->>'kind' = 'elapsed' limit 1))
       || ' - Extractiepunt tonen (alle puzzels goed)'
 where key = 'finale-alles-goed'
   and label ~ '^Na .+ en alle puzzels goed: alleen het juiste extractiepunt \(vlag\)$'
   and condition->>'kind' = 'and';

update public.rules
   set label = pg_temp.minuten((select (c->>'minutes')::numeric from jsonb_array_elements(condition->'conditions') c
                                 where c->>'kind' = 'elapsed' limit 1))
       || ' - Puzzels dicht, drie extractiepunten tonen (niet alle puzzels goed)'
 where key = 'finale-niet-alles-goed'
   and label ~ '^Na .+ en niet alle puzzels goed: puzzels dicht, drie extractiepunten$'
   and condition->>'kind' = 'and';
