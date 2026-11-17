// Haalt alle games (met opdrachten) uit Loquiz via de API en schrijft ze als
// JSON naar de map die als eerste argument wordt meegegeven.
// De inhoud (antwoorden!) wordt niet gelogd: de repository is openbaar.
// Gebruik: LOQUIZ_API_KEY=... node scripts/loquiz/fetch.mjs <uitvoermap>
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const BASE = 'https://api.loquiz.com/v3';
const key = process.env.LOQUIZ_API_KEY;
const outDir = process.argv[2];
if (!key) throw new Error('LOQUIZ_API_KEY ontbreekt');
if (!outDir) throw new Error('Geef een uitvoermap op');

async function get(path) {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(BASE + path, { headers: { Authorization: `ApiKey-v1 ${key}`, Accept: 'application/json' } });
    if (res.ok) return res.json();
    if (attempt < 4 && (res.status === 429 || res.status >= 500)) {
      await new Promise((r) => setTimeout(r, 2000 * attempt));
      continue;
    }
    throw new Error(`Loquiz gaf status ${res.status} op ${path.split('?')[0].replace(/[^/]{12,}/g, '…')}`);
  }
}

await mkdir(join(outDir, 'games'), { recursive: true });
const list = [];
for (let skip = 0; ; skip += 100) {
  const page = await get(`/games?limit=100&skip=${skip}`);
  const items = page.items ?? page;
  list.push(...items);
  if (!Array.isArray(items) || items.length < 100) break;
}
await writeFile(join(outDir, 'games.json'), JSON.stringify(list, null, 1));
console.log(`Lijst: ${list.length} games`);

let ok = 0;
let failed = 0;
for (const g of list) {
  try {
    const game = await get(`/games/${encodeURIComponent(g.id)}`);
    await writeFile(join(outDir, 'games', `${g.id}.json`), JSON.stringify(game, null, 1));
    ok++;
  } catch (err) {
    failed++;
    console.log(String(err.message));
  }
}
console.log(`Opgehaald: ${ok}, mislukt: ${failed}`);
