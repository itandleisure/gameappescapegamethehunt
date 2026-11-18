-- Omschrijving van de laatste tijdregel uit Template v1 in hetzelfde format
-- als de andere tijdregels: "90 - Alles uit en einde". Alleen waar nog de oude
-- templatetekst staat; de minuten komen uit de voorwaarde zelf.

update public.rules
   set label = case when (condition->>'minutes')::numeric = floor((condition->>'minutes')::numeric)
                    then floor((condition->>'minutes')::numeric)::int::text
                    else floor((condition->>'minutes')::numeric)::int::text || ':'
                         || lpad(round(((condition->>'minutes')::numeric - floor((condition->>'minutes')::numeric)) * 60)::int::text, 2, '0') end
            || ' - Alles uit en einde'
 where key = 'tijd-op'
   and condition->>'kind' = 'elapsed'
   and label ~ '^Na .+: alles uit en einde$';
