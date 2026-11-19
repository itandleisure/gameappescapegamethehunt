# Spellinks en QR-codes: /<game-ID>:<spelcode>

Net als bij Loquiz heeft elk event een vaste link:

| Link | Voorbeeld | Voor wie |
|---|---|---|
| Spellink | `https://thehunt.badassgames.nl/the-hunt-leeuwarden:ABC12` | Spelers (ticket, QR-code, uitnodiging) |
| Resultatenlink | `https://<beheer-domein>/resultaten/the-hunt-leeuwarden:ABC12` | Spelleiding (inloggen nodig) |

- **Game-ID** (vóór de dubbele punt): uniek en leesbaar per spel. Bestaande spellen kregen er een uit hun sleutel
  (bijv. `the-hunt-leeuwarden`). Aanpassen kan op de pagina van de stad of klant (“Game-ID · Aanpassen”).
- **Spelcode** (na de dubbele punt): de code van het event, zoals altijd (bijv. `ABC12` of `VANDIJKBV`).
- De spelcode alleen vindt het event al. Een link met een oud of verkeerd game-ID werkt dus gewoon; de pagina zet dan de
  juiste link in de adresbalk. Inloggen met alleen de code in de app blijft ook werken.

In de beheeromgeving staat bij elk event de knop **Spellink en QR-code**: kopiëren, en de QR-code als SVG downloaden.

## Wat er gebeurt als iemand de QR-code scant

1. **App staat al op de telefoon** (en de app-build met app-links is geïnstalleerd): de app opent direct op het
   aanmeldscherm met de spelcode ingevuld. Teamnaam en telefoonnummer invullen, klaar.
2. **App staat er nog niet op**: de telefoon opent de spellinkpagina met de naam van het spel, de spelcode groot in beeld
   en knoppen naar de App Store / Google Play, plus “Ik heb de app al: open de app”.
   Na het installeren scant de speler de QR-code nog een keer (of tikt opnieuw op de link): dan opent de app met de code
   ingevuld. (De winkels geven de code niet door aan een net geïnstalleerde app; daarom die tweede keer scannen.)

## Zelf instellen

### 1. Domein voor de spellinks
Het domein is voorlopig `thehunt.badassgames.nl`, alleen voor Escape Game The Hunt (dat staat als standaard in de app). Een andere naam kan: zie hieronder en stap 2.

- Vercel → project van de beheeromgeving → Settings → Domains → domein toevoegen, en de DNS-regel (CNAME) bij je
  domeinbeheerder zetten zoals Vercel aangeeft.
- Vercel → Settings → Environment Variables:
  - `NEXT_PUBLIC_SPEL_DOMEIN` = `https://thehunt.badassgames.nl`
  - `NEXT_PUBLIC_APP_STORE_URL` = link naar de app in de App Store (bijv. `https://apps.apple.com/app/id1234567890`),
    zodra de app daar staat. Zonder deze waarde staat er op een iPhone geen App Store-knop.
  - `NEXT_PUBLIC_PLAY_STORE_URL` = alleen nodig als de Google Play-link afwijkt van
    `https://play.google.com/store/apps/details?id=com.thebadassgroup.thehunt`.
  - `APPLE_TEAM_ID` = Team ID uit developer.apple.com → Membership (10 tekens).
  - `ANDROID_SHA256_FINGERPRINTS` = SHA-256-vingerafdruk uit Google Play Console → Test and release → App integrity →
    App signing key certificate. Meerdere (bijv. ook die van de testbuild uit `eas credentials`) scheiden met een komma.
  - Daarna opnieuw deployen.
- Controle: `https://thehunt.badassgames.nl/.well-known/apple-app-site-association` en
  `https://thehunt.badassgames.nl/.well-known/assetlinks.json` moeten je Team ID en vingerafdruk laten zien.

Zolang `NEXT_PUBLIC_SPEL_DOMEIN` niet is ingesteld, gebruiken de spellinks het adres van de beheeromgeving zelf. Die
werken dan als webpagina, maar openen de app niet direct. Druk dus pas QR-codes op tickets als het domein klaar is.

### 2. Nieuwe app-build
Dat links de app openen, zit in de app zelf (iPhone: Associated Domains, Android: app links). Dat werkt pas na een
**nieuwe build** (`eas build`) die via TestFlight/App Store en Google Play is geïnstalleerd, niet via een update
(`eas update`) en niet in Expo Go. Een ander domein dan `thehunt.badassgames.nl`? Zet dan bij de build
`APP_LINK_HOST=<domein>` (in `eas.json` onder `env`), en hetzelfde domein in `NEXT_PUBLIC_SPEL_DOMEIN`.

Bij Apple: in het Apple Developer-account staat “Associated Domains” bij de App ID aan; EAS doet dat normaal vanzelf bij
de build.

Het invullen van de spelcode vanuit de link werkt na een gewone update al wel, maar alleen voor links die de app openen
(dus pas met de nieuwe build).

## Andere spellen

Elk spel (of webapp) krijgt een eigen domein, bijvoorbeeld `thehunt.badassgames.nl` voor Escape Game The Hunt.
Het domein is een instelling (`NEXT_PUBLIC_SPEL_DOMEIN` in Vercel en `APP_LINK_HOST` bij de app-build), dus een ander
domein vraagt geen codewijziging.

## Voor de webshop

Per boeking:

1. Maak een event aan (nu met de hand in de beheeromgeving; een API om events automatisch aan te maken volgt later) en
   noteer de spelcode, of kies zelf een spelcode (4 tot 12 letters/cijfers, bijv. het ordernummer).
2. Bouw de link: `https://thehunt.badassgames.nl/<game-ID>:<spelcode>`, bijv.
   `https://thehunt.badassgames.nl/the-hunt-leeuwarden:ORDER4711`. Het game-ID staat op de pagina van de stad.
3. Zet die link in een QR-code op het ticket (elke QR-bibliotheek, foutcorrectie M is genoeg), en zet de spelcode er
   ook leesbaar bij voor wie niet kan scannen.
