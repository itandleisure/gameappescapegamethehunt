-- Eigen naam bij een templateversie.
--
-- Een versie heette tot nu toe alleen "v1", "v2", ... Nu kan het team elke
-- versie een naam geven, bijvoorbeeld "Nederland" of "Internationaal –
-- Spanje/Frankrijk", ook achteraf. Het versienummer blijft bestaan (steden
-- zijn daaraan gekoppeld); de naam is alleen een label. Leeg = geen naam,
-- dan toont de beheeromgeving gewoon "Template v{n}".

alter table public.base_versions
  add column name text check (name is null or (length(btrim(name)) between 1 and 80));

grant update (name) on public.base_versions to authenticated;
