# Speler-app

React Native + Expo (TypeScript) voor iPhone en Android.

## Wat de app doet

- **Aanmelden** met de sessiecode van de spelleiding, teamnaam en taal (standaard de taal van de telefoon). Verder spelen op een tweede telefoon met de teamcode.
- **Kaart** (MapLibre, OpenStreetMap) met de opdrachten van de eigen track, de eigen positie en eventueel de overlay. Alleen het speelveld wordt bij het inloggen gedownload en na afloop verwijderd.
- **GPS**: opdrachten openen vanzelf op locatie (twee goede metingen of 3 seconden binnen de cirkel, slechte metingen tellen niet). Werkt ook met het scherm uit, op Android met een melding.
- **Opdrachten**: bevestigen, tekst, getal, meerkeuze, foto, hints met puntaftrek, reeksen zoals de speluitleg, playgrounds zoals het extractiepunt, berichten van de spelregels, timer en score.
- **Offline doorspelen**: het spel rekent op de telefoon met dezelfde engine als de server. Gebeurtenissen, GPS-bundels en foto's gaan naar de server zodra er bereik is.
- **Foto's** worden verkleind tot maximaal 2048 px aan de langste zijde (nooit vergroot, staand blijft staand) en op de achtergrond geüpload voor de fotowall en het fotoboek.
- Teksten van de app in NL, EN, DE, ES, PT en IT.

## Opbouw

| Map | Inhoud |
|---|---|
| `app/` | Schermen (expo-router): aanmelden, kaart, opdrachtenlijst, opdracht, einde |
| `src/core/` | Logica zonder telefoon, volledig getest: `GameController`, klokcorrectie, speelveld, teksten, Supabase-koppeling |
| `src/services/` | Telefoonfuncties: GPS op de achtergrond, kaart downloaden, Supabase-client |
| `src/ui/` | Huisstijl en bouwstenen van de schermen |
| `test/` | Tests met een nep-server (offline, herstart, tweede telefoon, foto's) |

## Ontwikkelen

```bash
pnpm --filter @hunt/player test        # tests
pnpm --filter @hunt/player typecheck   # typecontrole
pnpm --filter @hunt/player exec expo export --platform android   # bundel bouwen als controle
```

### Schermcontrole op veel schermmaten

```bash
pnpm --filter @hunt/player screens                       # bouwen en alles controleren
pnpm --filter @hunt/player screens --device=klein --scene=opdracht
```

Bouwt de app voor de browser met nepdata (`SCREEN_PREVIEW=1`: server, GPS, kaart en camera komen uit `preview/`) en opent elk scherm op zeven schermmaten, van 320 px breed tot een tablet. Met opdrachtfoto's van normaal tot 8000 × 6000, 40 × 30, panorama, heel lang en een kapotte link, en met extra lange teksten. Hij controleert of niets buiten beeld valt, elke knop bereikbaar en groot genoeg is, foto's binnen het scherm blijven en de app geen fouten geeft. Schermafbeeldingen en een overzicht komen in `screens/index.html`. Draait ook in CI.

Op een Android-emulator testen (ook nep-GPS): zie `testen-op-laptop.md` in de projectmap.

Op een telefoon testen vraagt een development build (de kaart en GPS op de achtergrond zitten niet in Expo Go):

```bash
cd apps/player
npx eas-cli build --profile development --platform android   # APK voor je eigen Android-telefoon
npx expo start --dev-client
```

### Testen in Expo Go

De app draait ook in Expo Go (de test-app uit de App Store en Play Store), met twee beperkingen: de kaart is een webkaart (zelfde stijl en markeringen) en GPS werkt alleen met het scherm aan. Testversies komen via EAS Update op het kanaal `preview`.

Voor een testversie zonder computer: `--profile preview` geeft een APK die je via een link installeert.

## Expo-project

| Instelling | Waarde |
|---|---|
| Owner (organisatie) | `the-badass-group` |
| Slug | `gameappescapegamethehunt` |
| Project ID (`extra.eas.projectId` in app.json) | `af20ef2e-91ed-4ff2-88fb-19a7f95b444e` |

De naam in de stores en op het telefoonscherm stellen we apart in (`name` in app.json). Het toegangstoken voor automatische builds (`EXPO_TOKEN`) komt als secret in GitHub, nooit in de repository.
