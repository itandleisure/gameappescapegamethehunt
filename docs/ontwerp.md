# Technisch ontwerp en planning: eigen Hunt-app

Status: voorstel, ter beoordeling door Frans
Datum: 16 november 2026
Basis: het functieoverzicht van Loquiz ("Loquiz functieoverzicht voor eigen app"), met The Hunt NL Leeuwarden als referentiespel.

## 1. Samenvatting

We bouwen drie onderdelen die samen Loquiz vervangen:

1. **Speler-app** voor iPhone en Android, uit één codebase (React Native met Expo). Native, omdat GPS daar nauwkeuriger en betrouwbaarder is dan in de browser, ook als het scherm even uit gaat.
2. **Beheeromgeving** in de browser, voor het opzetten van games, steden, klantvarianten, vertalingen en spelsessies, en voor live meekijken en resultaten.
3. **Server** op Supabase (database, inloggen, bestandsopslag en live-updates), gehost in de EU.

Het hart van het systeem is een **spelregel-engine** die het "als dit, dan dat"-verloop van Loquiz nabouwt. Die engine is één stuk code dat zowel in de app draait (zodat het spel ook bij slecht bereik doorloopt) als op de server (zodat scores en resultaten kloppen).

Twee dingen doen we bewust beter dan Loquiz:

- **Gelaagde games**: één basisspel, met daarbovenop een stadsvariant, een klantvariant en vertalingen. Een betere hinttekst in het basisspel staat dan meteen in alle steden.
- **Meertaligheid in één game**: het team kiest bij de start de taal; de beheeromgeving laat zien welke teksten nog niet vertaald zijn.

De eerste versie (MVP) doet precies wat The Hunt Leeuwarden nodig heeft. Met de planning hieronder is een veldtest in Leeuwarden haalbaar rond week 10, en de overstap van Loquiz rond week 14 tot 16.

## 2. Stackkeuze

| Onderdeel | Keuze | Waarom |
|---|---|---|
| Speler-app | **React Native + Expo** (TypeScript) | Eén codebase voor iOS en Android. Expo regelt builds, ondertekening en het verspreiden van testversies (TestFlight en Google Play) vanuit de cloud, zonder dat er een Mac nodig is. Updates van teksten en kleine fixes kunnen zonder nieuwe store-review worden uitgerold (EAS Update). |
| GPS | `expo-location` met hoogste nauwkeurigheid, plus achtergrondlocatie | Continue GPS met filtering in de app; blijft werken als het scherm uit gaat (Android via voorgrondmelding, iOS via achtergrondlocatie). |
| Kaart | **MapLibre** met kaartdata van **OpenStreetMap** (zie 2.1) | Open source, zonder account of API-sleutel. Eigen kaartstijl (zoals nu in Loquiz), eigen overlay-afbeelding per stad, en kaarten vooraf downloaden voor offline gebruik. |
| Beheeromgeving | **Next.js** (React, TypeScript) | Zelfde taal en gedeelde code met de app, inclusief de spelregel-engine en de datatypes. |
| Server | **Supabase** (Postgres, Auth, Storage, Realtime, Edge Functions), EU-regio; beheeromgeving op **Vercel** (zie hoofdstuk 11) | Weinig eigen serverbeheer, live-updates voor de monitor en chat zitten erin, standaard Postgres zodat we nooit vastzitten. |
| Code-opbouw | Monorepo met pnpm workspaces | App, beheer en gedeelde engine in één repository, zodat een wijziging aan de regels overal tegelijk geldt. |

**Waarom niet Flutter?** Flutter is net zo geschikt voor de app, maar dan schrijven we de app in Dart en de beheeromgeving in TypeScript. Met React Native is de spelregel-engine één stuk code voor app, beheer en server. Dat is voor dit project het belangrijkste argument, omdat de regels het lastigste en meest foutgevoelige deel zijn.

**Waarom geen eigen server?** Kan later altijd nog, omdat Supabase gewoon Postgres is. Voor de start scheelt het weken werk aan inloggen, opslag en live-verbindingen.

### 2.1 Kaart: OpenStreetMap

De kaart gebruikt **OpenStreetMap**: open kaartdata, gratis, zonder account of API-sleutel. De app tekent de kaart zelf met MapLibre (ook open source), zodat we de kaartstijl en de stads-overlay zelf bepalen.

De data is open, maar de kaarttegels moeten ergens vandaan komen. Daar zijn drie mogelijkheden:

| Bron | Geschikt voor | Toelichting |
|---|---|---|
| Tegelserver van OpenStreetMap zelf (tile.openstreetmap.org) | Niet voor deze app | De gebruiksregels van OpenStreetMap verbieden zwaar gebruik door apps en het vooraf downloaden van gebieden. Dat laatste hebben we nodig voor offline spelen |
| **OpenFreeMap** | Start, testen en veldtest | Gratis en open source, vectorkaarten op basis van OpenStreetMap, geen sleutel nodig. Een gratis dienst zonder garanties, dus niet de enige basis voor productie |
| **Eigen kaartbestand** (Protomaps-formaat) op Cloudflare R2 | Productie | Eén bestand met de kaart van Nederland of alleen de speelsteden, gemaakt uit OpenStreetMap-data. Wij beheren het zelf, het kost enkele euro's per maand en het speelveld kan per sessie vooraf worden gedownload |

Plan: we starten met OpenFreeMap en stappen vóór de livegang (fase 6) over op een eigen kaartbestand. De kaartbron is per spel in te stellen (`map.styleUrl`), dus voor die overstap hoeft de app niet opnieuw door de stores.

Op de kaart staat altijd de bronvermelding "© OpenStreetMap-bijdragers". Die is verplicht.

## 3. Architectuur

```
┌───────────────────────┐        ┌───────────────────────┐
│  Speler-app (iOS/And) │        │  Beheeromgeving (web) │
│  - kaart + GPS        │        │  - games & varianten  │
│  - spelregel-engine   │        │  - vertalingen        │
│  - offline opslag     │        │  - sessies & teams    │
│  - wachtrij events    │        │  - live monitor/chat  │
└──────────┬────────────┘        │  - resultaten/export  │
           │ events + sync       └──────────┬────────────┘
           ▼                                ▼
┌──────────────────────────────────────────────────────────┐
│ Supabase (EU)                                            │
│  Postgres · Auth · Storage (media, foto's) · Realtime    │
│  Edge Functions: game publiceren, events valideren,      │
│                  scores herberekenen, Excel-export        │
└──────────────────────────────────────────────────────────┘
        ▲
        └── gedeelde package: spelregel-engine + datatypes
```

### 3.1 Hoe een spel loopt

1. De spelleiding maakt in de beheeromgeving een **sessie** aan (bijvoorbeeld "The Hunt Leeuwarden, za 14:00, klant X"), met een inlogcode en QR-code en het aantal tracks.
2. Elk team scant de QR-code of tikt de code in, kiest een teamnaam en de taal. De app downloadt het complete spelpakket: opdrachten, regels, media en kaarttegels van het speelveld.
3. Het team krijgt bij inloggen automatisch een track toegewezen (zie 5.4).
4. Tijdens het spel draait de engine in de app. Elke gebeurtenis (locatie bereikt, antwoord gegeven, hint gekocht, timer verlopen) wordt lokaal opgeslagen en zo snel mogelijk naar de server gestuurd.
5. De server ontvangt de gebeurtenissen, rekent de score opnieuw uit met dezelfde engine en zet alles live door naar de monitor in de beheeromgeving.

### 3.2 Offline en slecht bereik

- Het spelpakket en de kaart van het speelveld staan na het inloggen volledig op de telefoon. Het spel loopt door zonder internet.
- Gebeurtenissen gaan in een wachtrij en worden verstuurd zodra er weer verbinding is. Elke gebeurtenis heeft een uniek id, zodat dubbel versturen geen kwaad kan.
- De speeltijd rekent vanaf de starttijd van de server. De app corrigeert voor een afwijkende telefoonklok, zodat een team de timer niet kan beïnvloeden.

### 3.3 GPS-nauwkeurigheid

Dit is de reden voor een eigen app, dus hier zit extra aandacht:

- GPS draait continu op de hoogste nauwkeurigheid zolang een spel actief is, ook met het scherm uit.
- Metingen met een slechte nauwkeurigheid (bijvoorbeeld meer dan 30 meter onzekerheid) tellen niet mee voor het openen van een opdracht.
- Een locatie opent pas als het team er echt is: binnen de straal, met een korte bevestiging (twee opeenvolgende metingen of een paar seconden binnen de cirkel). Zo voorkomen we dat een sprong in het signaal een opdracht opent.
- Elke sessie logt de nauwkeurigheid van de metingen. Bij de veldtest vergelijken we dat met Loquiz op dezelfde route.
- Als vangnet kan de spelleiding een opdracht vanuit de monitor handmatig openen voor een team.

## 4. Gelaagd gamemodel

Een speelbaar spel wordt samengesteld uit lagen. Elke laag vult alleen in wat hij mag aanpassen:

```
Basisspel "The Hunt"        opdrachten, regels, puzzels, hints, tijdlijn, punten
  └─ Stadsvariant          kaart-overlay, pinlocaties (start, tracks, extractiepunten),
     "Leeuwarden"          GPS-coördinaten extractiepunt, hintfoto, lokale vragen 54/55
       └─ Klantvariant     lokale vragen 54/55, hints morsecodepuzzel
          "Parteon"        (de fysieke puzzel valt buiten de app)
            └─ Taal        vertaling per opdracht; team kiest bij de start
```

Hoe dat werkt:

- In het basisspel markeert de maker welke velden een stad of klant mag invullen ("aanpasbare velden"). Voor The Hunt zijn dat precies de punten uit het functieoverzicht. In de beheeromgeving staan die velden per stad en klant klaar als een kort formulier, in plaats van 94 opdrachten.
- Bij het **publiceren** voegt de server de lagen samen tot één vaste versie. Een sessie speelt altijd een gepubliceerde versie. Wijzigingen tijdens een lopend spel hebben dus geen onverwacht effect, en achteraf is altijd te zien welke versie gespeeld is.
- Een wijziging in het basisspel komt na opnieuw publiceren in alle steden en klantvarianten.
- Vertalingen hangen aan elk tekstveld, in elke laag. De beheeromgeving toont teksten naast elkaar per taal en markeert wat ontbreekt. Publiceren in een taal met ontbrekende teksten geeft een waarschuwing.
- Resultaten blijven per sessie samen, ongeacht de taal die een team koos.

## 5. Spelregel-engine

### 5.1 Principe

Het spelverloop wordt beschreven met regels in de vorm **wanneer [voorwaarde] dan [actie]**, zoals in Loquiz. De toestand van een team (welke opdrachten zichtbaar, open, afgerond of uit zijn, score, einde) volgt volledig uit de regels plus de lijst gebeurtenissen van dat team. Dat maakt het spel voorspelbaar, testbaar en achteraf na te spelen.

### 5.2 Voorwaarden (MVP)

| Voorwaarde | Voorbeeld uit The Hunt |
|---|---|
| Opdracht(en) afgerond / goed / fout | Puzzel goed → hints van die puzzel uit |
| Selectie op één opdracht, een reeks, of een tag | "Alle opdrachten met tag *oplossing* goed" |
| Speeltijd groter dan x minuten | Elke 10 min nieuwe puzzel; na 35 min fotomissie; na 60 min finale |
| x seconden na het afronden van een opdracht | Uitlegschermen die automatisch na elkaar openen |
| Score vergelijken | Treasure Hunt: bij 15 punten de schat tonen |
| Team zit op track n | Trackvragen per track |
| En / of / niet | "Alle puzzels goed **en** speeltijd > 60 min" |

### 5.3 Acties (MVP)

Toon op kaart, toon in lijst, toon op een extra scherm (playground), direct openen, deactiveren, punten toekennen, bericht tonen, spel beëindigen met een uitkomst (bijvoorbeeld "ontsnapt", "verkeerd extractiepunt", "tijd op").

### 5.4 Ingebouwd in plaats van nagebouwd met losse opdrachten

Een aantal dingen bouwt Loquiz na met extra opdrachten en regels. In de eigen app worden het gewone instellingen, wat het opzetten van een stad veel eenvoudiger maakt:

- **Hints**: een opdracht heeft een lijst hints met elk een puntenprijs (bijvoorbeeld −25, −50, −75). De bevestiging "Weten jullie zeker dat je hint 1 (−25) wilt?" is standaard. Hints gaan vanzelf uit als de opdracht goed is beantwoord. In Leeuwarden zijn dat nu ruim 40 losse opdrachten.
- **Bevestigingsvraag**: elke opdracht kan een bevestiging vragen voordat hij opent, zoals bij het extractiepunt.
- **Introreeks**: een reeks schermen die na elkaar openen, en daarna terug te lezen zijn in de speluitleg.
- **Tracks**: per sessie een instelbaar aantal (standaard 5). Teams worden op volgorde van inloggen verdeeld: team 1 op track 1, team 5 op track 5, team 6 weer op track 1. Elke track heeft dezelfde vragen op andere locaties.
- **Meerdere eindes**: elk einde heeft een eigen eindscherm en eventueel een bonus (+600 bij het juiste extractiepunt).
- **Verzamelpunt** na afloop.

### 5.5 Regels bewerken

In plaats van de puzzelblokjes van Loquiz krijgt de beheeromgeving een overzichtelijke regel-editor: per regel een rij "Wanneer … dan …" met keuzelijsten. Daarnaast komt er een **simulator**: speel het spel in de browser door, spoel de tijd vooruit en zie welke opdrachten verschijnen. Daarmee kun je een nieuwe stad controleren zonder over straat te lopen.

### 5.6 Testen van de engine

Het volledige verloop van Leeuwarden wordt als geautomatiseerde test vastgelegd (bijvoorbeeld: "team lost alles op in 55 minuten, gaat naar het juiste extractiepunt, eindigt met score X"). Elke wijziging aan de engine moet die scenario's blijven halen.

## 6. Datamodel (hoofdlijnen)

| Tabel | Belangrijkste velden | Toelichting |
|---|---|---|
| `organizations` | naam, logo, kleuren | Badass Games / The Hunt, World of City Escapes |
| `users` | e-mail, rol (owner, admin, editor, instructeur) | Beheerders en spelleiding |
| `games` | naam, type (basis/stad/klant), `parent_id`, talen | De lagen uit hoofdstuk 4 |
| `tasks` | sleutel, antwoordtype, juiste antwoorden, punten, radius, activatie, hints, tags | Alleen in het basisspel |
| `task_locations` | taak, track (optioneel), lat/lng, radius | Per stadsvariant in te vullen |
| `overrides` | game, taak, veld, taal, waarde | Wat een stad of klant aanpast |
| `translations` | entiteit, veld, taal, tekst | Alle teksten, per taal |
| `rules` | volgorde, voorwaarde (JSON), acties (JSON) | Alleen in het basisspel |
| `playgrounds` | naam, achtergrond, knoppen | Extractiepunt, Speluitleg |
| `media` | bestand, type, taal (optioneel) | Afbeeldingen, audio, video, overlays |
| `game_versions` | game, versienummer, samengesteld spelpakket (JSON), gepubliceerd op | Vaste versie die gespeeld wordt |
| `sessions` | gameversie, datum, inlogcode, aantal tracks, testmodus, status | Eén spelmoment (boeking) |
| `teams` | sessie, naam, taal, track, inlogvolgorde, start-/eindtijd, uitkomst | |
| `events` | team, type, taak, gegevens, tijd telefoon, tijd server | Alles wat er gebeurt; bron van score en resultaten |
| `positions` | team, lat/lng, nauwkeurigheid, tijd | Voor live kaart, route en GPS-analyse |
| `photos` | team, taak, bestand | Fotomissie en photowall |
| `messages` | sessie, team, afzender, tekst | Chat spelleiding ↔ team |

Antwoordtypes in de MVP: geen antwoord (info), meerkeuze, meerdere antwoorden, tekst, getal en foto. Samen dekken die 470 van de 481 opdrachten in jullie bibliotheek. Tekstantwoorden worden vergeleken zonder hoofdletters, spaties en accenten, met meerdere goede antwoorden per opdracht.

Toegang wordt in de database zelf afgedwongen (row level security): een team ziet alleen zijn eigen sessie, een beheerder alleen de eigen organisatie.

## 7. Beheeromgeving

MVP-schermen:

1. **Games**: basisspel bewerken (opdrachten, hints, regels, playgrounds, media), met simulator.
2. **Stadsvariant**: kaart met verplaatsbare pins (start, tracks, extractiepunten), overlay uploaden en uitlijnen, lokale vragen invullen.
3. **Klantvariant**: formulier met alleen de klantvelden (vragen 54/55, morsecode-hints).
4. **Vertalingen**: teksten naast elkaar per taal, filter "nog niet vertaald".
5. **Sessies**: sessie aanmaken, QR-code en inlogcode, aantal tracks, testmodus, open/dicht.
6. **Live monitor**: kaart met teams en routes, ranglijst, voortgang per team, chat, opdracht handmatig openen, sessie afsluiten.
7. **Resultaten**: ranglijst, antwoorden per opdracht, photowall, export naar Excel, en een deelbare resultatenpagina voor de klant met The Hunt-logo.

### 7.1 Resultatenpagina, live kaart en fotoboek

De game masters gebruiken de resultatenpagina van Loquiz tijdens en na het spel. Dat komt één-op-één terug, en de gegevens worden ook buiten de app bruikbaar voor het fotoboek.

**Tijdens het spel (game master)**

- Live kaart met de actuele locatie en de gelopen route van elk team, met filter per team. Posities komen live binnen (Supabase Realtime), zonder te verversen.
- Ranglijst met per team: punten, speeltijd, totaalafstand, aantal goed/fout, gebruikte hints en waar het team in het spel is.
- Chat met een team of met iedereen, en opdrachten handmatig openen.

**Fotorol**

- De foto uit de fotomissie (na 35 minuten) wordt automatisch geüpload zodra het team hem maakt. Zonder bereik wacht de foto in de wachtrij en gaat hij alsnog mee zodra er verbinding is.
- De foto's staan per sessie in de photowall op de resultatenpagina en zijn ook te downloaden.

**Resultaten per team**

| Gegeven | Hoe het wordt bepaald |
|---|---|
| Punten | Door de server nagerekend met de spelregel-engine |
| Speeltijd | Van start tot einde op servertijd |
| Totaalafstand | Uit de GPS-route; onnauwkeurige metingen, stilstaan en sprongen in het signaal tellen niet mee |
| Uitkomst | Ontsnapt, verkeerd extractiepunt of tijd op |
| Foto's | Alle foto's van het team, met link |

**Ophalen voor het fotoboek (de "template")**

Elke sessie heeft een geheime link. Zet de spelleiding "resultaten delen" aan, dan geeft die link alle gegevens hierboven terug, zonder inloggen:

- als JSON, voor low-code tools en automatiseringen die het fotoboek vullen;
- als CSV, die direct in Excel opent, met per team een rij en de foto-links in eigen kolommen.

Foto-links zijn 7 dagen geldig en worden bij elke aanvraag opnieuw gemaakt. Is een link te ver verspreid, dan maakt de spelleiding met één knop een nieuwe. Dezelfde link dient als deelbare resultatenpagina voor de klant.

## 8. MVP-scope

**Wel in de eerste versie** (alles wat The Hunt Leeuwarden nodig heeft):

- Inloggen met code of QR, teamnaam, taalkeuze
- Introreeks van 12 schermen en terug te lezen speluitleg
- Kaart met eigen stijl en stads-overlay, offline beschikbaar
- GPS-activatie met radius en filtering, ook met scherm uit
- Antwoordtypes: info, meerkeuze, meerdere antwoorden, tekst, getal, foto
- Zes puzzels die elke 10 minuten vrijkomen, met berichten over de verstreken tijd
- Drie hints per puzzel met puntaftrek en bevestiging
- Fotomissie na 35 minuten
- Tracks met automatische verdeling (standaard 5)
- Finale met drie extractiepunten, bevestiging, +600 bij juist punt, einde bij fout punt of na 75 minuten
- Zichtbare speeltijd, scores van andere teams, verzamelpunt na afloop
- Playgrounds Extractiepunt en Speluitleg
- Basisspel + stadsvariant + klantvariant + vertalingen (NL en EN als eerste)
- Beheeromgeving, live monitor met live kaart van de teams, chat, resultaten met Excel-export, testmodus
- Automatische foto-upload van de fotomissie, photowall, en export van resultaten en foto's voor het fotoboek (zie 7.1)

**Niet in de eerste versie** (later, op volgorde van belang):

- Opdrachtenbibliotheek en templates voor andere spellen (City Escapes, Strandgame)
- QR- en barcode-activatie
- Puzzelstukjesbord (Backpack in Varna)
- Webhook naar het boekingssysteem en losse toegangscodes per klant
- Onzichtbare strafzones (mijnenvelden, alleen Kampen)
- Augmented photo, object finder, video, activity station

## 9. Planning in fases

De weken zijn een inschatting vanaf de start van fase 1. De grootste onzekerheden zijn de store-goedkeuring en wat de veldtest oplevert.

| Fase | Weken | Wat | Resultaat |
|---|---|---|---|
| 0. Voorbereiden | nu – 2 | Ontwikkelaarsaccounts aanvragen (zie hoofdstuk 10), Supabase-account, keuze appnaam en icoon | Accounts klaar vóór de eerste testbuild |
| 1. Fundament | 1 – 3 | Monorepo, database en toegangsregels, spelregel-engine met Leeuwarden als testscenario | Engine speelt Leeuwarden foutloos na in een test |
| 2. Speler-app | 3 – 7 | Alle MVP-functies van de app, GPS-filtering, offline, wachtrij, automatische foto-upload | Testbuild op eigen telefoons |
| 3. Beheeromgeving | 4 – 8 | Editor, varianten, vertalingen, sessies, live monitor met kaart, resultatenpagina, photowall, export voor het fotoboek | Spelleiding kan zelf een sessie draaien en het fotoboek vullen |
| 4. Leeuwarden invoeren | 8 – 9 | The Hunt overzetten als basisspel + stadsvariant Leeuwarden, NL en EN, simulator-controle | Spel compleet in eigen systeem |
| 5. Veldtest | 9 – 10 | Met jullie eigen team in Leeuwarden, naast Loquiz op dezelfde route; GPS-logs vergelijken | Lijst verbeterpunten, besluit over livegang |
| 6. Verbeteren en publiceren | 10 – 12 | Punten uit de veldtest, app indienen bij App Store en Google Play | App openbaar in beide stores |
| 7. Overstap | 12 – 16 | Eerste echte boekingen, daarna Amsterdam, Kampen, klantvarianten en andere talen; Loquiz opzeggen (let op de looptijd van het jaarabonnement) | Loquiz niet meer nodig voor The Hunt |
| 8. Uitbreiden | daarna | Should-haves, andere spellen van World of City Escapes | |

Tijdens de overstap draaien Loquiz en de eigen app een paar weken naast elkaar, zodat er altijd een terugvaloptie is.

## 10. Ontwikkelaarsaccounts: wat Frans moet regelen

Zonder deze accounts kan de app niet op iPhones van testers en niet in de stores. Start hier zo snel mogelijk mee, omdat de aanvraag als bedrijf een paar weken kan duren.

### Stap 1: D-U-N-S-nummer (nu)

Apple en Google vragen voor een bedrijfsaccount een D-U-N-S-nummer. Dit is gratis aan te vragen via Apple's eigen opzoekpagina voor ontwikkelaars (developer.apple.com, "D-U-N-S Number lookup") en duurt doorgaans tot 2 weken. Mogelijk heeft het bedrijf er al een via de KvK-registratie; de opzoekpagina laat dat zien.

Een bedrijfsaccount is aan te raden: dan staat de bedrijfsnaam in de stores in plaats van een persoonsnaam, en bij Google geldt voor nieuwe persoonlijke accounts een verplichte testperiode van 14 dagen met minimaal 12 testers voordat de app openbaar mag.

### Stap 2: Apple Developer Program (week 1 – 2)

- Kosten: 99 dollar per jaar.
- Aanmelden op developer.apple.com als organisatie, met D-U-N-S-nummer, een Apple-account met tweestapsverificatie, en een website van het bedrijf.
- Nodig voor: TestFlight (testversies op iPhones van het eigen team, vanaf fase 2) en publicatie in de App Store (fase 6).
- Na goedkeuring: mij of een ontwikkelaar toegang geven via App Store Connect ("Users and Access"), zodat builds automatisch kunnen worden geüpload.

### Stap 3: Google Play Console (week 1 – 2)

- Kosten: eenmalig 25 dollar.
- Aanmelden als organisatie op play.google.com/console, met D-U-N-S-nummer en identiteitscontrole.
- Nodig voor: interne testversie op Android-telefoons (fase 2) en publicatie in Google Play (fase 6).
- Tot het account klaar is, kunnen Android-testers de app ook rechtstreeks installeren zonder store.

### Stap 4: privacy (vóór fase 6)

Beide stores eisen een privacyverklaring op een website en een uitleg waarom de app achtergrondlocatie gebruikt. Apple beoordeelt achtergrondlocatie streng; de app vraagt daarom alleen tijdens een actief spel om locatie en legt in een scherm uit waarom. Ik lever de teksten aan; die moeten op jullie website komen.

## 11. Hosting en kosten

GitHub is de plek voor de **code**: de versiegeschiedenis, het beoordelen van wijzigingen en het automatisch bouwen en testen. Het spel zelf draait niet op GitHub, maar bij gespecialiseerde diensten die elk één taak hebben:

| Onderdeel | Waar het draait | Waarom daar |
|---|---|---|
| Broncode | **GitHub** (deze repository) | Standaardplek; koppelt met alle diensten hieronder, die automatisch bouwen bij een nieuwe versie |
| Server: database, inloggen, foto's, live-updates | **Supabase**, regio Frankfurt (EU) | Alles in één, AVG-vriendelijk in de EU, standaard Postgres zodat we kunnen verhuizen |
| Beheeromgeving en resultatenpagina | **Vercel** | Zet de Next.js-site automatisch online bij elke wijziging op GitHub, met eigen domein (bijvoorbeeld beheer.thehunt.nl) |
| App bouwen en testversies verspreiden | **Expo EAS** | Bouwt iOS- en Android-versies in de cloud en zet ze op TestFlight en Google Play |
| Speler-app | **App Store en Google Play** | Hoe spelers de app installeren |
| Kaarttegels | **OpenStreetMap**: eerst OpenFreeMap, later eigen kaartbestand (zie 2.1) | Open source, geen account nodig |

Geschatte lopende kosten bij het huidige volume (84 tot 207 spelers per maand, dus enkele honderden teams):

| Post | Kosten |
|---|---|
| Supabase Pro (EU) | ca. 25 dollar per maand |
| Vercel Pro (nodig bij zakelijk gebruik) | ca. 20 dollar per maand |
| Expo EAS (builds en updates) | 0 tot 19 dollar per maand |
| Kaarttegels (OpenStreetMap) | 0 euro; met eigen kaartbestand op R2 enkele euro's per maand |
| GitHub | gratis (privé repository) |
| Apple Developer Program | 99 dollar per jaar (ca. 8 per maand) |
| Google Play Console | 25 dollar eenmalig |
| **Totaal lopend** | **ca. 55 – 100 euro per maand** |

Ter vergelijking: Loquiz kost nu ca. **420 – 1.035 euro per maand** voor The Hunt (5 euro per speler). De eigen oplossing kost dus ongeveer een tiende, en de kosten stijgen nauwelijks mee met het aantal spelers. Bij flinke groei (duizenden spelers per maand) komen er hooguit enkele tientallen euro's bij voor opslag van foto's en kaartgebruik. Ontwikkeltijd en onderhoud vallen buiten deze bedragen.

### 11.1 Groei naar 100.000 evenementen per jaar

Het doel op termijn is 10.000 tot 100.000 evenementen per jaar, met pieken van rond de 1.000 sessies en zo'n 10.000 telefoons tegelijk. We bouwen daar nu niet voor uit, maar maken ook geen keuzes die het later blokkeren.

| Onderdeel | Bij de start | Wat bij groei | Al voorbereid |
|---|---|---|---|
| GPS naar de server | De telefoon meet continu, maar stuurt een uitgedunde route (bij ≥ 10 m verplaatsing, stilstaand eens per 30 s) in één bundel per 20 seconden | Bij 10.000 telefoons ~500 verzoeken per seconde in plaats van ~10.000. Eventueel alleen de telefoon van de teamcaptain laten sturen | `PositionUploader` in de engine, `record_positions` in de database |
| Live kaart | Supabase Realtime op de tabel met posities | Overstappen op Realtime Broadcast per sessie, zodat posities niet eerst door de database hoeven | De monitor leest posities via één plek in de code |
| Opslag van posities | Alle posities in Postgres | Ruwe posities na 90 dagen opruimen; afstand en route per team blijven bewaard. Tabel per maand opdelen | Afstand wordt per team berekend en kan worden vastgelegd bij het einde |
| Foto's | Supabase Storage | Nieuwe foto's naar Cloudflare R2: geen kosten voor downloaden, ca. 15 dollar per TB per maand. Bij 100.000 evenementen gaat het om enkele TB per jaar | Elke foto onthoudt zijn opslag (`storage_provider`); links maken gaat via één functie |
| Kaarttegels | OpenFreeMap (OpenStreetMap) | Eigen kaartbestand van Nederland en de speelsteden (Protomaps-formaat, OpenStreetMap-data) op Cloudflare R2: geen afhankelijkheid van een gratis dienst, vaste lage kosten, en geschikt om het speelveld vooraf te downloaden | Kaartbron is instelbaar per spel (`map.styleUrl`), met een standaard in de app |
| Database | Supabase Pro | Grotere database-instantie (ca. 100 tot 400 dollar per maand) en een leeskopie voor de resultatenpagina's | Standaard Postgres, dus ook te verhuizen |

Grove inschatting van de lopende kosten bij 100.000 evenementen per jaar: enkele honderden tot rond de 1.000 euro per maand, afhankelijk van het aantal foto's en kaartgebruik. Dat is nog steeds een fractie van wat Loquiz bij dat volume zou kosten.

## 12. Risico's

| Risico | Aanpak |
|---|---|
| Accountaanvraag duurt lang | Nu starten met D-U-N-S; Android-test kan zonder store |
| Apple keurt achtergrondlocatie af | Alleen tijdens actief spel, duidelijke uitleg in de app; fallback: alleen voorgrondlocatie met scherm-aan-modus |
| GPS in smalle straten blijft onnauwkeurig | Filtering en radius per locatie instelbaar; handmatig openen door spelleiding; veldtest naast Loquiz |
| Verloop wijkt af van Loquiz | Leeuwarden als geautomatiseerde test en simulator vóór de veldtest |
| Overzetten van 94 opdrachten per stad kost tijd | Gelaagd model: alleen Leeuwarden volledig, andere steden alleen het stadsformulier. Mogelijk een importscript als Loquiz een export of API biedt (nog uitzoeken) |
| Telefoon valt uit of batterij leeg | Teamtoestand staat op de server; inloggen op een tweede telefoon met dezelfde teamcode zet het spel voort |

## 13. Open punten voor Frans

1. Bedrijfsnaam waaronder de app in de stores komt, en de appnaam (bijvoorbeeld "The Hunt").
2. Moet World of City Escapes later ook in dezelfde app, of krijgt dat een eigen app? Dit bepaalt of we nu al meerdere merken in de app inbouwen.
3. Einddatum van het Loquiz-jaarabonnement, om de overstap op af te stemmen.
4. Welke talen naast NL en EN het eerst nodig zijn.
