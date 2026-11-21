-- Speluitleg als infographics: elk uitlegscherm krijgt een tekening met korte
-- tekst in de taal van het team, zodat spelers niet hoeven te lezen. Er komt
-- één scherm bij: "Batterij leeg?" (uitleg-13), vlak voor "Start van het
-- spel" (uitleg-12), zodat de regels die op uitleg-12 letten gewoon blijven
-- werken.
--
-- 1. uitleg-01 t/m uitleg-12 krijgen settings.illustration (een infographic,
--    zie apps/admin/src/lib/illustrations.ts). Alleen als er nog geen tekening
--    stond of de oude tekening 'extractiepunt'. Bij uitleg-02 (Speelveld)
--    blijft het kaartje van de stad staan: dat komt onder de infographic.
-- 2. De nieuwe opdracht uitleg-13 met titel en tekst in elke taal waarin
--    uitleg-12 een titel heeft.
-- 3. De reeks "intro" krijgt uitleg-13 vóór uitleg-12, de regel "na-uitleg"
--    toont uitleg-13 ook bij de speluitleg en het label van "introreeks" zegt
--    13 schermen.
--
-- Geldt voor de basisspellen (templates) met een reeks "intro" waarin
-- uitleg-12 staat, en voor hun vastgelegde templateversies waar steden op
-- draaien. Bij het volgende publiceren zet de beheeromgeving de tekeningen
-- in het spel. Veilig om vaker te draaien.

drop table if exists pg_temp.uitleg_tekening, pg_temp.uitleg_batterij, pg_temp.uitleg_spellen;
create temporary table uitleg_tekening (key text primary key, name text not null);
insert into uitleg_tekening (key, name) values
  ('uitleg-01', 'uitleg-speluitleg'),
  ('uitleg-02', 'uitleg-speelveld'),
  ('uitleg-03', 'uitleg-rugtas'),
  ('uitleg-04', 'uitleg-gameapp'),
  ('uitleg-05', 'uitleg-puzzels'),
  ('uitleg-06', 'uitleg-extractiepunt'),
  ('uitleg-07', 'uitleg-hunters-zien-jullie'),
  ('uitleg-08', 'uitleg-hunters-in-de-buurt'),
  ('uitleg-09', 'uitleg-gepakt'),
  ('uitleg-10', 'uitleg-tijdlijn'),
  ('uitleg-11', 'uitleg-belangrijk'),
  ('uitleg-12', 'uitleg-start'),
  ('uitleg-13', 'uitleg-batterij');

create temporary table uitleg_batterij (lang text primary key, title text not null, body text not null);
insert into uitleg_batterij (lang, title, body) values
  ('nl', 'Batterij leeg?', E'Geen probleem: speel verder op een andere telefoon.\n\n1. Download de app op een andere telefoon.\n2. Tik op de knop “Ons team speelt al – opnieuw inloggen”.\n3. Vul je teamnaam in.\n\n✓ Punten en tijd blijven staan.'),
  ('en', 'Battery dead?', E'No problem: keep playing on another phone.\n\n1. Download the app on another phone.\n2. Tap the button “Our team is already playing – sign in again”.\n3. Enter your team name.\n\n✓ Points and time are kept.'),
  ('de', 'Akku leer?', E'Kein Problem: spielt auf einem anderen Handy weiter.\n\n1. Ladet die App auf einem anderen Handy herunter.\n2. Tippt auf den Knopf “Unser Team spielt schon – erneut anmelden”.\n3. Gebt euren Teamnamen ein.\n\n✓ Punkte und Zeit bleiben erhalten.'),
  ('fr', 'Batterie vide ?', E'Pas de souci : continuez sur un autre téléphone.\n\n1. Téléchargez l''app sur un autre téléphone.\n2. Appuyez sur le bouton “Notre équipe joue déjà – se reconnecter”.\n3. Saisissez le nom d''équipe.\n\n✓ Points et temps conservés.'),
  ('es', '¿Sin batería?', E'Sin problema: seguid en otro móvil.\n\n1. Descargad la app en otro móvil.\n2. Pulsad el botón “Nuestro equipo ya está jugando – volver a entrar”.\n3. Escribid el nombre del equipo.\n\n✓ Puntos y tiempo se mantienen.'),
  ('it', 'Batteria scarica?', E'Nessun problema: continuate su un altro telefono.\n\n1. Scaricate l''app su un altro telefono.\n2. Toccate il pulsante “La nostra squadra sta già giocando – accedi di nuovo”.\n3. Inserite il nome della squadra.\n\n✓ Punti e tempo restano.'),
  ('pt', 'Bateria vazia?', E'Sem problema: continuem noutro telemóvel.\n\n1. Descarreguem a app noutro telemóvel.\n2. Toquem no botão “A nossa equipa já está a jogar – entrar de novo”.\n3. Escrevam o nome da equipa.\n\n✓ Pontos e tempo mantêm-se.'),
  ('da', 'Tomt batteri?', E'Intet problem: spil videre på en anden telefon.\n\n1. Download appen på en anden telefon.\n2. Tryk på knappen “Vores hold spiller allerede – log ind igen”.\n3. Skriv jeres holdnavn.\n\n✓ Point og tid bevares.'),
  ('sv', 'Tomt batteri?', E'Inga problem: spela vidare på en annan telefon.\n\n1. Ladda ner appen på en annan telefon.\n2. Tryck på knappen “Vårt lag spelar redan – logga in igen”.\n3. Skriv ert lagnamn.\n\n✓ Poäng och tid sparas.'),
  ('no', 'Tomt batteri?', E'Ikke noe problem: spill videre på en annen telefon.\n\n1. Last ned appen på en annen telefon.\n2. Trykk på knappen “Laget vårt spiller allerede – logg inn igjen”.\n3. Skriv lagnavnet.\n\n✓ Poeng og tid beholdes.'),
  ('fi', 'Akku loppu?', E'Ei hätää: jatkakaa toisella puhelimella.\n\n1. Lataa sovellus toiseen puhelimeen.\n2. Napauta painiketta “Joukkueemme pelaa jo – kirjaudu uudelleen”.\n3. Kirjoita joukkueen nimi.\n\n✓ Pisteet ja aika säilyvät.'),
  ('pl', 'Pusta bateria?', E'Bez problemu: grajcie dalej na innym telefonie.\n\n1. Pobierzcie aplikację na inny telefon.\n2. Naciśnijcie przycisk “Nasza drużyna już gra – zaloguj ponownie”.\n3. Wpiszcie nazwę drużyny.\n\n✓ Punkty i czas zostają.'),
  ('cs', 'Vybitá baterie?', E'Nevadí: hrajte dál na jiném telefonu.\n\n1. Stáhněte aplikaci do jiného telefonu.\n2. Klepněte na tlačítko “Náš tým už hraje – přihlásit znovu”.\n3. Zadejte název týmu.\n\n✓ Body a čas zůstávají.'),
  ('sk', 'Vybitá batéria?', E'Nevadí: hrajte ďalej na inom telefóne.\n\n1. Stiahnite aplikáciu do iného telefónu.\n2. Ťuknite na tlačidlo “Náš tím už hrá – prihlásiť znova”.\n3. Zadajte názov tímu.\n\n✓ Body a čas zostávajú.'),
  ('hu', 'Lemerült az akku?', E'Semmi gond: játsszatok tovább másik telefonon.\n\n1. Töltsétek le az appot egy másik telefonra.\n2. Koppintsatok a gombra “A csapatunk már játszik – újra belépés”.\n3. Írjátok be a csapatnevet.\n\n✓ A pontok és az idő megmaradnak.'),
  ('ro', 'Baterie descărcată?', E'Nicio problemă: continuați pe alt telefon.\n\n1. Descărcați aplicația pe alt telefon.\n2. Apăsați butonul “Echipa noastră joacă deja – conectare din nou”.\n3. Scrieți numele echipei.\n\n✓ Punctele și timpul rămân.'),
  ('bg', 'Батерията падна?', E'Няма проблем: продължете на друг телефон.\n\n1. Изтеглете приложението на друг телефон.\n2. Натиснете бутона “Отборът ни вече играе – влезте отново”.\n3. Въведете името на отбора.\n\n✓ Точките и времето остават.'),
  ('el', 'Άδεια μπαταρία;', E'Κανένα πρόβλημα: συνεχίστε σε άλλο κινητό.\n\n1. Κατεβάστε την εφαρμογή σε άλλο κινητό.\n2. Πατήστε το κουμπί “Η ομάδα μας ήδη παίζει – σύνδεση ξανά”.\n3. Γράψτε το όνομα ομάδας.\n\n✓ Πόντοι και χρόνος μένουν.'),
  ('hr', 'Prazna baterija?', E'Nema problema: igrajte dalje na drugom mobitelu.\n\n1. Preuzmite aplikaciju na drugi mobitel.\n2. Dodirnite gumb “Naš tim već igra – ponovna prijava”.\n3. Upišite ime tima.\n\n✓ Bodovi i vrijeme ostaju.'),
  ('sl', 'Prazna baterija?', E'Ni težav: igrajte naprej na drugem telefonu.\n\n1. Prenesite aplikacijo na drug telefon.\n2. Tapnite gumb “Naša ekipa že igra – ponovna prijava”.\n3. Vpišite ime ekipe.\n\n✓ Točke in čas ostanejo.'),
  ('et', 'Aku tühi?', E'Pole probleemi: mängige edasi teise telefoniga.\n\n1. Laadige äpp alla teise telefoni.\n2. Puudutage nuppu “Meie meeskond juba mängib – logi uuesti sisse”.\n3. Sisestage tiimi nimi.\n\n✓ Punktid ja aeg jäävad alles.'),
  ('lv', 'Tukša baterija?', E'Nav problēmu: spēlējiet tālāk citā telefonā.\n\n1. Lejupielādējiet lietotni citā telefonā.\n2. Pieskarieties pogai “Mūsu komanda jau spēlē – pieteikties vēlreiz”.\n3. Ievadiet komandas nosaukumu.\n\n✓ Punkti un laiks saglabājas.'),
  ('lt', 'Išsikrovė baterija?', E'Jokių problemų: žaiskite kitu telefonu.\n\n1. Atsisiųskite programėlę į kitą telefoną.\n2. Bakstelėkite mygtuką “Mūsų komanda jau žaidžia – prisijungti iš naujo”.\n3. Įveskite komandos pavadinimą.\n\n✓ Taškai ir laikas išlieka.'),
  ('ga', 'Ceallra folamh?', E'Fadhb ar bith: leanaigí ar aghaidh ar fhón eile.\n\n1. Íoslódáil an aip ar fhón eile.\n2. Brúigh an cnaipe “Tá ár bhfoireann ag imirt cheana – logáil isteach arís”.\n3. Cuir isteach ainm na foirne.\n\n✓ Fanann pointí agus am.'),
  ('mt', 'Batterija vojta?', E'L-ebda problema: kompli fuq telefon ieħor.\n\n1. Niżżlu l-app fuq telefon ieħor.\n2. Agħfsu l-buttuna “It-tim tagħna diġà qed jilgħab – idħol mill-ġdid”.\n3. Daħħlu l-isem tat-tim.\n\n✓ Punti u ħin jibqgħu.');


-- Reeks "intro": uitleg-13 vóór uitleg-12.
create or replace function pg_temp.met_reeks(p_settings jsonb) returns jsonb
language sql immutable as $$
  select jsonb_set(p_settings, '{sequences}', (
    select jsonb_agg(
      case when q ->> 'id' = 'intro' and not (q -> 'tasks') ? 'uitleg-13'
           then jsonb_set(q, '{tasks}', (
             select jsonb_agg(v order by i, o)
             from (
               select t.v, t.i, 1 as o from jsonb_array_elements(q -> 'tasks') with ordinality as t(v, i)
               union all
               select to_jsonb('uitleg-13'::text), t.i, 0 from jsonb_array_elements(q -> 'tasks') with ordinality as t(v, i)
                where t.v = to_jsonb('uitleg-12'::text)
             ) s))
           else q end
      order by n)
    from jsonb_array_elements(p_settings -> 'sequences') with ordinality as e(q, n)
  ))
$$;

create or replace function pg_temp.is_uitleg_spel(p_settings jsonb) returns boolean
language sql immutable as $$
  select jsonb_typeof(p_settings -> 'sequences') = 'array'
     and exists (select 1 from jsonb_array_elements(p_settings -> 'sequences') q
                  where q ->> 'id' = 'intro' and (q -> 'tasks') ? 'uitleg-12')
$$;

-- Regel "na-uitleg": in de lijst met uitlegschermen ook uitleg-13.
create or replace function pg_temp.met_acties(p_actions jsonb) returns jsonb
language sql immutable as $$
  select coalesce(jsonb_agg(
    case when a ->> 'kind' = 'show' and jsonb_typeof(a -> 'select' -> 'tasks') = 'array'
              and (a -> 'select' -> 'tasks') ? 'uitleg-12' and not (a -> 'select' -> 'tasks') ? 'uitleg-13'
         then jsonb_set(a, '{select,tasks}', (a -> 'select' -> 'tasks') || '["uitleg-13"]'::jsonb)
         else a end
    order by n), p_actions)
  from jsonb_array_elements(p_actions) with ordinality as e(a, n)
$$;

create or replace function pg_temp.met_tekening(p_settings jsonb, p_key text) returns jsonb
language sql immutable as $$
  select case
    when (select name from uitleg_tekening where key = p_key) is null then p_settings
    when coalesce(p_settings ->> 'illustration', 'extractiepunt') <> 'extractiepunt' then p_settings
    else coalesce(nullif(p_settings, 'null'::jsonb), '{}'::jsonb)
         || jsonb_build_object('illustration', (select name from uitleg_tekening where key = p_key))
  end
$$;

create temporary table uitleg_spellen as
select g.id from public.games g
 where g.layer = 'base' and pg_temp.is_uitleg_spel(g.settings)
   and exists (select 1 from public.tasks t where t.game_id = g.id and t.key = 'uitleg-12');

-- 1. Tekeningen bij de bestaande schermen.
update public.tasks t
   set settings = pg_temp.met_tekening(t.settings, t.key)
 where t.game_id in (select id from uitleg_spellen)
   and t.key in (select key from uitleg_tekening)
   and t.settings is distinct from pg_temp.met_tekening(t.settings, t.key);

-- 2. Het nieuwe scherm, direct na uitleg-11 (de reeks bepaalt de volgorde).
insert into public.tasks (game_id, key, position, answer, points, settings)
select t.game_id, 'uitleg-13', t.position, '{"type":"info"}'::jsonb, 0, '{"illustration":"uitleg-batterij"}'::jsonb
  from public.tasks t
 where t.game_id in (select id from uitleg_spellen) and t.key = 'uitleg-12'
on conflict (game_id, key) do nothing;

insert into public.translations (game_id, entity, entity_id, field, lang, text)
select tr.game_id, 'task', 'uitleg-13', f.field, b.lang, case f.field when 'title' then b.title else b.body end
  from public.translations tr
  join uitleg_batterij b on b.lang = tr.lang
  cross join (values ('title'), ('body')) as f(field)
 where tr.game_id in (select id from uitleg_spellen)
   and tr.entity = 'task' and tr.entity_id = 'uitleg-12' and tr.field = 'title'
on conflict (game_id, entity, entity_id, field, lang) do nothing;

-- 3. Reeks en regels.
update public.games g
   set settings = pg_temp.met_reeks(g.settings)
 where g.id in (select id from uitleg_spellen)
   and g.settings is distinct from pg_temp.met_reeks(g.settings);

update public.rules r
   set actions = pg_temp.met_acties(r.actions)
 where r.game_id in (select id from uitleg_spellen) and r.key = 'na-uitleg'
   and r.actions is distinct from pg_temp.met_acties(r.actions);

update public.rules r
   set label = replace(r.label, '(12 schermen)', '(13 schermen)')
 where r.game_id in (select id from uitleg_spellen) and r.key = 'introreeks'
   and r.label like '%(12 schermen)%';

-- Vastgelegde templateversies: hetzelfde in de snapshot.
create or replace function pg_temp.met_infographics(s jsonb) returns jsonb
language plpgsql as $$
declare
  v_pos jsonb;
begin
  if not pg_temp.is_uitleg_spel(s -> 'game' -> 'settings') then return s; end if;
  select x -> 'position' into v_pos from jsonb_array_elements(s -> 'tasks') x where x ->> 'key' = 'uitleg-12';
  if v_pos is null then return s; end if;

  s := jsonb_set(s, '{tasks}', (
    select jsonb_agg(
      case when x ->> 'key' in (select key from uitleg_tekening)
           then jsonb_set(x, '{settings}', pg_temp.met_tekening(x -> 'settings', x ->> 'key'))
           else x end
      order by i)
    from jsonb_array_elements(s -> 'tasks') with ordinality as e(x, i)));

  if not exists (select 1 from jsonb_array_elements(s -> 'tasks') x where x ->> 'key' = 'uitleg-13') then
    s := jsonb_set(s, '{tasks}', (s -> 'tasks') || jsonb_build_array(jsonb_build_object(
      'id', gen_random_uuid(), 'key', 'uitleg-13', 'position', v_pos, 'answer', '{"type":"info"}'::jsonb,
      'points', 0, 'wrong_points', 0, 'tags', '[]'::jsonb, 'hint_costs', '[]'::jsonb,
      'has_confirm', false, 'retry_until_correct', false, 'settings', '{"illustration":"uitleg-batterij"}'::jsonb)));
    s := jsonb_set(s, '{translations}', coalesce(s -> 'translations', '[]'::jsonb) || coalesce((
      select jsonb_agg(jsonb_build_object('entity', 'task', 'entity_id', 'uitleg-13', 'field', f.field, 'lang', b.lang,
                                          'text', case f.field when 'title' then b.title else b.body end))
        from jsonb_array_elements(s -> 'translations') tr
        join uitleg_batterij b on b.lang = tr ->> 'lang'
        cross join (values ('title'), ('body')) as f(field)
       where tr ->> 'entity' = 'task' and tr ->> 'entity_id' = 'uitleg-12' and tr ->> 'field' = 'title'), '[]'::jsonb));
  end if;

  s := jsonb_set(s, '{game,settings}', pg_temp.met_reeks(s -> 'game' -> 'settings'));

  if jsonb_typeof(s -> 'rules') = 'array' then
    s := jsonb_set(s, '{rules}', coalesce((
      select jsonb_agg(
        case when r ->> 'key' = 'na-uitleg' then jsonb_set(r, '{actions}', pg_temp.met_acties(r -> 'actions'))
             when r ->> 'key' = 'introreeks' and r ->> 'label' like '%(12 schermen)%'
               then jsonb_set(r, '{label}', to_jsonb(replace(r ->> 'label', '(12 schermen)', '(13 schermen)')))
             else r end
        order by i)
      from jsonb_array_elements(s -> 'rules') with ordinality as e(r, i)), '[]'::jsonb));
  end if;
  return s;
end $$;

update public.base_versions b
   set snapshot = pg_temp.met_infographics(b.snapshot)
 where jsonb_typeof(b.snapshot -> 'tasks') = 'array'
   and pg_temp.is_uitleg_spel(b.snapshot -> 'game' -> 'settings')
   and b.snapshot is distinct from pg_temp.met_infographics(b.snapshot);
