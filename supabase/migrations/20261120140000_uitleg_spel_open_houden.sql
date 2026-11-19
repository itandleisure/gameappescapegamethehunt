-- Speluitleg, scherm "Belangrijke informatie" (uitleg-11): de tip over het
-- scherm aan houden wordt sterker en staat voortaan bovenaan de lijst.
-- Spelers spelen nu in de webapp. Die houdt de GPS alleen bij zolang het spel
-- open in beeld staat: vergrendelen of naar een andere app gaan zet de GPS uit.
--
-- Oud (laatste punt):  "- Blijf in de Loquiz-gameapp en houd je scherm actief"
-- Nieuw (eerste punt): "- Houd het spel open in beeld: ..."
--
-- Per taal wordt het punt dat nog "Loquiz" noemt (een regel die met "- "
-- begint) weggehaald en komt de nieuwe tip als eerste punt. Teksten zonder
-- zo'n regel blijven staan, dus zelf herschreven uitleg verandert niet.
-- Geldt voor templates, steden, klanten en de vastgelegde templateversies.
-- Veilig om vaker te draaien: daarna staat er geen Loquiz-regel meer.

create temporary table uitleg_tip (lang text primary key, line text not null);
insert into uitleg_tip (lang, line) values
  ('nl', '- Houd het spel open in beeld: vergrendel je telefoon niet en ga niet naar een andere app (zoals WhatsApp of de camera). Anders stopt de GPS en gaan opdrachten niet vanzelf open.'),
  ('en', '- Keep the game open on screen: don''t lock your phone or switch to another app (like WhatsApp or the camera). Otherwise GPS stops and tasks won''t open by themselves.'),
  ('de', '- Lasst das Spiel offen im Bild: Sperrt das Handy nicht und wechselt nicht in eine andere App (z. B. WhatsApp oder die Kamera). Sonst stoppt das GPS und Aufgaben öffnen sich nicht von selbst.'),
  ('fr', '- Gardez le jeu ouvert à l''écran : ne verrouillez pas le téléphone et ne passez pas à une autre app (comme WhatsApp ou l''appareil photo). Sinon le GPS s''arrête et les missions ne s''ouvrent pas toutes seules.'),
  ('es', '- Mantened el juego abierto en pantalla: no bloqueéis el móvil ni cambiéis a otra app (como WhatsApp o la cámara). Si no, el GPS se detiene y las misiones no se abren solas.'),
  ('it', '- Tenete il gioco aperto sullo schermo: non bloccate il telefono e non passate a un''altra app (come WhatsApp o la fotocamera). Altrimenti il GPS si ferma e le missioni non si aprono da sole.'),
  ('pt', '- Mantenham o jogo aberto no ecrã: não bloqueiem o telemóvel nem mudem para outra app (como o WhatsApp ou a câmara). Caso contrário, o GPS para e as missões não abrem sozinhas.'),
  ('da', '- Hold spillet åbent på skærmen: lås ikke telefonen, og skift ikke til en anden app (som WhatsApp eller kameraet). Ellers stopper GPS''en, og opgaverne åbner ikke af sig selv.'),
  ('sv', '- Håll spelet öppet på skärmen: lås inte telefonen och byt inte till en annan app (som WhatsApp eller kameran). Annars stannar GPS:en och uppdragen öppnas inte av sig själva.'),
  ('no', '- Hold spillet åpent på skjermen: ikke lås telefonen, og ikke bytt til en annen app (som WhatsApp eller kameraet). Ellers stopper GPS-en, og oppdragene åpnes ikke av seg selv.'),
  ('fi', '- Pitäkää peli auki näytöllä: älkää lukitko puhelinta älkääkä vaihtako toiseen sovellukseen (kuten WhatsAppiin tai kameraan). Muuten GPS pysähtyy eivätkä tehtävät aukea itsestään.'),
  ('pl', '- Trzymajcie grę otwartą na ekranie: nie blokujcie telefonu i nie przechodźcie do innej aplikacji (np. WhatsApp lub aparatu). W przeciwnym razie GPS się zatrzyma, a zadania nie otworzą się same.'),
  ('cs', '- Mějte hru otevřenou na obrazovce: nezamykejte telefon a nepřepínejte do jiné aplikace (např. WhatsApp nebo fotoaparát). Jinak se GPS zastaví a úkoly se samy neotevřou.'),
  ('sk', '- Majte hru otvorenú na obrazovke: nezamykajte telefón a neprepínajte do inej aplikácie (napr. WhatsApp alebo fotoaparát). Inak sa GPS zastaví a úlohy sa samy neotvoria.'),
  ('hu', '- Tartsátok nyitva a játékot a képernyőn: ne zárjátok le a telefont, és ne váltsatok másik alkalmazásra (például WhatsAppra vagy a kamerára). Különben a GPS leáll, és a feladatok nem nyílnak meg maguktól.'),
  ('ro', '- Țineți jocul deschis pe ecran: nu blocați telefonul și nu treceți la altă aplicație (de exemplu WhatsApp sau camera). Altfel GPS-ul se oprește și misiunile nu se mai deschid singure.'),
  ('bg', '- Дръжте играта отворена на екрана: не заключвайте телефона и не превключвайте към друго приложение (например WhatsApp или камерата). Иначе GPS спира и задачите няма да се отварят сами.'),
  ('el', '- Κρατήστε το παιχνίδι ανοιχτό στην οθόνη: μην κλειδώνετε το τηλέφωνο και μην αλλάζετε σε άλλη εφαρμογή (όπως το WhatsApp ή την κάμερα). Αλλιώς το GPS σταματά και οι αποστολές δεν ανοίγουν μόνες τους.'),
  ('hr', '- Držite igru otvorenom na zaslonu: ne zaključavajte mobitel i ne prelazite u drugu aplikaciju (npr. WhatsApp ili kameru). Inače se GPS zaustavlja i zadaci se neće sami otvoriti.'),
  ('sl', '- Igro imejte odprto na zaslonu: ne zaklepajte telefona in ne preklapljajte v drugo aplikacijo (npr. WhatsApp ali kamero). Sicer se GPS ustavi in naloge se ne odprejo same.'),
  ('et', '- Hoidke mäng ekraanil lahti: ärge lukustage telefoni ega minge teise rakendusse (näiteks WhatsApp või kaamera). Muidu GPS peatub ja ülesanded ei avane ise.'),
  ('lv', '- Turiet spēli atvērtu ekrānā: nebloķējiet tālruni un nepārslēdzieties uz citu lietotni (piemēram, WhatsApp vai kameru). Citādi GPS apstājas un uzdevumi paši neatveras.'),
  ('lt', '- Laikykite žaidimą atidarytą ekrane: neužrakinkite telefono ir neperjunkite į kitą programėlę (pvz., WhatsApp ar kamerą). Kitaip GPS sustos ir užduotys pačios neatsidarys.'),
  ('ga', '- Coinnigí an cluiche oscailte ar an scáileán: ná cuirigí glas ar an bhfón agus ná téigí go haip eile (mar WhatsApp nó an ceamara). Murach sin stopann an GPS agus ní osclaíonn na tascanna leo féin.'),
  ('mt', '- Żommu l-logħba miftuħa fuq l-iskrin: tissakkrux it-telefon u taqilbux għal app oħra (bħal WhatsApp jew il-kamera). Inkella l-GPS jieqaf u l-kompiti ma jinfetħux waħedhom.');

-- Oude regel weg, nieuwe tip als eerste punt.
create or replace function pg_temp.met_tip(p_text text, p_lang text) returns text
language sql stable as $$
  select (select line from uitleg_tip where lang = p_lang) || E'\n'
      || regexp_replace(p_text, '^- [^\n]*Loquiz[^\n]*(\n|$)', '', 'n')
$$;

create or replace function pg_temp.heeft_oude_regel(p_text text) returns boolean
language sql immutable as $$
  select p_text ~ '(^|\n)- [^\n]*Loquiz'
$$;

-- Teksten in de spellen zelf.
update public.translations t
   set text = pg_temp.met_tip(t.text, t.lang), updated_at = now()
 where t.entity = 'task' and t.entity_id = 'uitleg-11' and t.field = 'body'
   and t.lang in (select lang from uitleg_tip)
   and pg_temp.heeft_oude_regel(t.text);

-- Vastgelegde templateversies, waar steden op draaien.
update public.base_versions b
   set snapshot = jsonb_set(b.snapshot, '{translations}', (
     select jsonb_agg(
       case when x ->> 'entity' = 'task' and x ->> 'entity_id' = 'uitleg-11' and x ->> 'field' = 'body'
                 and x ->> 'lang' in (select lang from uitleg_tip)
                 and pg_temp.heeft_oude_regel(x ->> 'text')
            then jsonb_set(x, '{text}', to_jsonb(pg_temp.met_tip(x ->> 'text', x ->> 'lang')))
            else x end
       order by i)
     from jsonb_array_elements(b.snapshot -> 'translations') with ordinality as e(x, i)
   ))
 where jsonb_typeof(b.snapshot -> 'translations') = 'array'
   and exists (
     select 1 from jsonb_array_elements(b.snapshot -> 'translations') x
     where x ->> 'entity' = 'task' and x ->> 'entity_id' = 'uitleg-11' and x ->> 'field' = 'body'
       and x ->> 'lang' in (select lang from uitleg_tip)
       and pg_temp.heeft_oude_regel(x ->> 'text')
   );

drop table uitleg_tip cascade;
