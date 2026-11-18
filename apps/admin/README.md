# Beheeromgeving (fase 3)

Next.js (TypeScript), gehost op Vercel. Draait volledig in de browser met
supabase-js; de toegangsregels zitten in de database (row level security).

## Wat er nu in zit

- Inloggen en account aanmaken (e-mail en wachtwoord)
- Eigen organisatie aanmaken als je nog nergens lid van bent (`create_organization`)
- Spellen: overzicht als boom (basisspel › stad › klant), importeren als bundel `{ base, variants }` of spelpakket, publiceren
- Opdracht bewerken met tabbladen (Opdracht, Feedback, Hints, Media, Activatie, Instellingen, Gebruikt in), een taalkeuze bovenaan en tekst met opmaak (vet, cursief, onderstreept, kleur, links, lijsten, uitlijning); in een stad of klant alleen de aanpasbare velden
- Sessies: aanmaken met automatische sessiecode, start en tijdzone, aantal tracks, testmodus, openen en sluiten

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
