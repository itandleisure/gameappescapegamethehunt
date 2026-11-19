# Webapp voor spelers (speler-app in de browser)

Dezelfde speler-app als op de telefoon, maar dan in de browser: geen App Store of Google Play nodig. Spelers openen
de spellink of scannen de QR-code en spelen meteen. Ook de spelleider-modus werkt in de browser.

| | |
|---|---|
| Adres | `https://<domein>/speel`, voor The Hunt `https://escapegamethehunt.badassgames.nl/speel` |
| Met spelcode ingevuld | `/speel?code=<SPELCODE>&game=<game-ID>` (de knop "Nu spelen in de browser" op de spellinkpagina) |
| Code | `apps/player` (dezelfde code als de app; browserdelen in bestanden die eindigen op `.web.ts(x)`) |
| Bouwen | `node apps/player/scripts/web-build.mjs`; de beheeromgeving doet dit vanzelf bij elke deploy (`apps/admin/scripts/build-webapp.mjs` naar `public/speel`) |

## Instellen

Niets extra: de webapp gaat mee met elke deploy van de beheeromgeving op Vercel en staat op elk domein dat aan dat
Vercel-project hangt. Mislukt het bouwen van de webapp, dan gaat de beheeromgeving gewoon online (zonder `/speel`) en
faalt de controle op GitHub.

Optioneel: zet `EXPO_PUBLIC_MAPTILER_KEY` ook bij de omgevingsvariabelen van het Vercel-project, dan gebruikt de
webapp dezelfde MapTiler-kaarten als de app. Zonder sleutel: OpenFreeMap.

## Wat werkt in de browser

| Onderdeel | Webapp | Toelichting |
|---|---|---|
| Aanmelden, teamfoto, opdrachten, hints, punten, timer, chat, einde | ✅ | Zelfde schermen en spelregels als de app |
| Spelleider-modus | ✅ | Inloggen met de spelleidercode; positie delen zolang het scherm aan staat |
| GPS met scherm aan | ✅ | Opdrachten openen vanzelf op locatie |
| GPS met scherm uit of in een andere app | ❌ | Een browser stopt de locatie dan altijd. De webapp houdt het scherm aan, legt dat vooraf uit, en meldt het als de GPS wegvalt of als het spel even uit beeld was |
| Scherm aan houden | ✅ | iPhone vanaf iOS 16.4 en Android (Chrome). Als op het beginscherm gezet: iPhone vanaf iOS 18.4. Kan het niet, dan vraagt de app om automatisch vergrendelen uit te zetten |
| Offline doorspelen | ✅ | Het spel rekent op de telefoon; antwoorden, punten en foto's worden bewaard en verstuurd zodra er bereik is |
| Opstarten zonder bereik | ✅ | Na de eerste keer staat de app op de telefoon (service worker). Herladen zonder internet werkt |
| Kaart zonder bereik | ✅ | Bij het aanmelden wordt de kaart van het speelveld vooraf geladen (tot zoomniveau 14, scherp tot 16+); na afloop verwijderd |
| Foto's | ✅ | Opent de camera; verkleind tot 2048 px; zonder bereik bewaard tot ze verstuurd zijn |
| Trillen bij een nieuwe opdracht | Android ✅, iPhone ❌ | Een iPhone kent trillen in de browser niet; de opdracht komt wel vanzelf in beeld |
| Melding op het vergrendelscherm | ❌ | Kan niet zonder app (de app doet dit ook niet) |
| Op het beginscherm zetten | ✅ | Android: knop "Op beginscherm zetten". iPhone: Delen › Zet op beginscherm (uitleg staat in de app) |
| Eerste keer openen zonder internet | ❌ | Aanmelden heeft altijd bereik nodig (in de app ook) |

**Batterij.** Het scherm staat het hele spel aan; reken op ongeveer een derde van de batterij voor 90 minuten. De
app vraagt spelers de telefoon vooraf op te laden of een powerbank mee te nemen.

**Opslag.** Browsers mogen opgeslagen gegevens van websites na een tijd opruimen (Safari na 7 dagen niet gebruiken).
Tijdens een spel speelt dat niet; de kaart en de app worden daarna gewoon opnieuw geladen.

## Updates

Een nieuwe versie staat online zodra de beheeromgeving opnieuw gedeployed is. Spelers krijgen hem bij de volgende
keer openen met bereik; tijdens een spel zonder bereik blijft de bewaarde versie werken.

## Testen

- `pnpm --filter @hunt/player screens`: alle schermen op 7 schermmaten (ook de uitleg van de webapp).
- Lokaal: `node apps/player/scripts/web-build.mjs` en de map `apps/player/dist-web` serveren onder `/speel`, of
  `pnpm --filter @hunt/admin build && pnpm --filter @hunt/admin start` en `http://localhost:3000/speel` openen.
- GPS en camera in de browser werken alleen via `https` (of `localhost`).
