# Loquiz-import

Haalt bestaande games uit Loquiz en zet ze om naar ons importformaat (Spellen → Importeren).

1. **Ophalen** — de workflow *Loquiz-export* (`.github/workflows/loquiz-export.yml`) haalt met het
   GitHub-geheim `LOQUIZ_API_KEY` alle games op (`fetch.mjs`). De repository is openbaar, dus de
   export wordt versleuteld met `export-public-key.pem` en als `loquiz-export/` op de branch gezet.
   Alleen met de privésleutel (in de projectmap, niet in de repository) is hij te openen.
2. **Omzetten** — `convert.mjs` vult een bestaand bundelbestand (met regels, locaties en punten)
   aan met de echte teksten, antwoorden, feedback, hints, afbeeldingen, verzamelpunt en kaartoverlay.
   Welke Loquiz-opdracht bij welke opdracht hoort staat per stad in `MAPPINGS`.

```sh
node scripts/loquiz/convert.mjs <loquiz-game.json> <skelet-bundel.json> <uitvoer.json> leeuwarden
node --test scripts/loquiz/convert.test.mjs
```

Wat de Loquiz-API **niet** levert: locaties per opdracht, punten per opdracht en de spelregels.
Die komen uit het skelet en worden in de beheeromgeving aangevuld.
Zet nooit Loquiz-inhoud (antwoorden!) onversleuteld in deze repository.
