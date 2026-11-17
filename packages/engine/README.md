# @hunt/engine

De spelregel-engine en gedeelde datatypes. Eén stuk code voor de speler-app (offline spelen), de beheeromgeving (simulator, publiceren) en de server (scores narekenen). Geen afhankelijkheden.

| Bestand | Wat |
|---|---|
| `types.ts` | Spelpakket, opdrachten, regels, gebeurtenissen, teamtoestand |
| `engine.ts` | `computeState`: toestand van een team uit regels + gebeurtenissen |
| `layers.ts` | Basisspel + stad + klant samenvoegen, controles, ontbrekende vertalingen |
| `answers.ts` | Antwoorden controleren (tekst zonder hoofdletters/spaties/accenten) |
| `geo.ts` | Afstanden en `LocationGate` (GPS-filtering in de app) |
| `tracks.ts` | Teams verdelen over tracks |
| `clock.ts` | Klokcorrectie naar servertijd |

## Hoe de engine rekent

- De toestand volgt volledig uit het spelpakket, het team (track, starttijd) en de lijst gebeurtenissen. Dezelfde invoer geeft altijd dezelfde uitkomst, ook als gebeurtenissen dubbel of in een andere volgorde binnenkomen.
- Elke regel ("wanneer … dan …") vuurt hooguit één keer, op het eerste moment dat de voorwaarde waar is. Tijdregels vuren op het exacte moment.
- Hints, bevestigingsvragen, introreeksen, tracks en meerdere eindes zijn ingebouwd in plaats van nagebouwd met losse opdrachten.

## Testen

```bash
pnpm --filter @hunt/engine test
```

`test/the-hunt-leeuwarden.test.ts` speelt Escape Game The Hunt Leeuwarden na (ontwerp §5.6). De inhoud in `test/fixtures/the-hunt.ts` is testdata met de structuur en regels van Leeuwarden; de echte teksten en coördinaten komen in fase 4.
