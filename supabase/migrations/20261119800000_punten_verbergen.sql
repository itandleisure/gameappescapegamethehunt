-- Punten verbergen na 60 minuten, zoals in Loquiz: tot dan zien teams hun
-- punten (hints kosten punten), daarna niet meer, voor de spanning in de
-- finale. De spelleiding ziet ze gewoon in de ranglijst.
--
-- Voegt de regel "60 - Punten verbergen" toe aan het basisspel Escape Game
-- The Hunt, als die er nog niet is. Steden krijgen hem bij de volgende
-- templateversie ("Nieuwe versie vastzetten").

insert into public.rules (game_id, key, position, label, condition, actions)
select g.id,
       'punten-verbergen',
       coalesce((select max(position) from public.rules r where r.game_id = g.id), 0) + 1,
       '60 - Punten verbergen',
       '{"kind": "elapsed", "minutes": 60}'::jsonb,
       '[{"kind": "hideScore"}]'::jsonb
  from public.games g
 where g.layer = 'base'
   and exists (select 1 from public.translations t
                where t.game_id = g.id and t.entity = 'game' and t.entity_id = ''
                  and t.field = 'name' and t.text ilike 'Escape Game The Hunt')
   and not exists (select 1 from public.rules r where r.game_id = g.id and r.key = 'punten-verbergen');
