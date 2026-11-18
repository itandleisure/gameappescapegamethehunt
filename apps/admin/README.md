# Beheeromgeving (fase 3)

Next.js (TypeScript), gehost op Vercel. Draait volledig in de browser met
supabase-js; de toegangsregels zitten in de database (row level security).

## Wat er nu in zit

- Inloggen en account aanmaken (e-mail en wachtwoord)
- Eigen organisatie aanmaken als je nog nergens lid van bent (`create_organization`)
- Spellen: overzicht als boom (basisspel › stad › klant), importeren als bundel `{ base, variants }` of spelpakket, publiceren
- Opdracht bewerken met tabbladen (Opdracht, Feedback, Hints, Media, Activatie, Instellingen, Gebruikt in), een taalkeuze bovenaan en tekst met opmaak (vet, cursief, onderstreept, kleur, links, lijsten, uitlijning); in een stad of klant alleen de aanpasbare velden
- Sessies: aanmaken met automatische sessiecode, start en tijdzone, aantal tracks, testmodus, openen en sluiten
- Fotoboek per hunt (tabblad Fotoboek): spelfoto's, eigen foto's en vaste foto's kiezen en ordenen, een PDF in de stijl van het huidige fotoboek maken (in de browser, met pdf-lib en Lato) en 28 dagen delen via `/fotoboek/<link>` met wachtwoord, met PDF en zip van alle foto's. Vaste foto's en links staan op `/instellingen/fotoboek`

Volgt nog: regels, kaarteditor (locaties per track, overlay), klantvariant maken, vertalingen,
live monitor, resultaten en photowall.

## Lokaal draaien

```bash
pnpm install
pnpm --filter @hunt/admin dev
```

De Supabase-gegevens staan als standaard in `src/lib/supabase.ts` (publiek).
Andere waarden kunnen via `NEXT_PUBLIC_SUPABASE_URL` en `NEXT_PUBLIC_SUPABASE_ANON_KEY`.

## Vercel

- Root Directory: `apps/admin`, Framework: Next.js
- Build gebruikt webpack (`next build --webpack`), omdat de engine met `.js`-imports naar `.ts`-bestanden verwijst.

## Gebruikt uit `@hunt/engine`

- `validateGame` bij het importeren van een spelpakket
- Later: `composeGame` (publiceren), `missingTranslations`, `computeState` (simulator en live monitor)

## Talen

De beheerapp is er in het Nederlands, Engels, Duits, Spaans, Portugees en
Italiaans (dezelfde talen als de speler-app). De taalkeuze staat rechtsboven en
op het inlogscherm, en wordt per gebruiker in het account bewaard.

- Schrijf teksten in het Nederlands en zet ze in `t('…')` (component: `const t = useT()`;
  buiten een component: `t` uit `@/lib/i18n`). De Nederlandse tekst is de sleutel.
- Vaste lijsten met labels markeer je met `tKey('…')` en vertaal je bij het tonen met `t(label)`.
- De vertalingen staan in `src/i18n/<taal>.ts`. `test/i18n.test.ts` faalt als een tekst
  in een taal ontbreekt; tot die er is, toont de app gewoon de Nederlandse tekst.
- Spelinhoud (opdrachten, uitleg) wordt niet hier vertaald; die staat per taal in het spel.
