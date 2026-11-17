// Haalt alle games (met opdrachten) uit Loquiz via de API en schrijft ze als
// JSON naar de map die als eerste argument wordt meegegeven.
// De inhoud (antwoorden!) wordt niet gelogd: de repository is openbaar.
// Gebruik: LOQUIZ_API_KEY=... node scripts/loquiz/fetch.mjs <uitvoermap>
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const BASE = 'https://api.loquiz.com/v3';
const key = (process.env.LOQUIZ_API_KEY ?? '').trim().replace(/^ApiKey-v1\s+/i, '');
const outDir = process.argv[2];
if (!key) throw new Error('LOQUIZ_API_KEY ontbreekt');
if (!outDir) throw new Error('Geef een uitvoermap op');

// De documentatie noemt "ApiKey-v1 <sleutel>"; probeer bij 401 ook andere vormen.
const SCHEMES = [
  (k) => ({ Authorization: `ApiKey-v1 ${k}` }),
  (k) => ({ Authorization: `Bearer ${k}` }),
  (k) => ({ Authorization: k }),
  (k) => ({ 'X-Api-Key': k }),
];
let scheme = 0;
console.log(`Sleutel: ${key.length} tekens`);
for (; scheme < SCHEMES.length; scheme++) {
  const res = await fetch(`${BASE}/games?limit=1`, { headers: { ...SCHEMES[scheme](key), Accept: 'application/json' }, signal: AbortSignal.timeout(30000) });
  console.log(`Aanmeldvorm ${scheme + 1}: status ${res.status}`);
  if (res.ok) break;
}
if (scheme === SCHEMES.length) throw new Error('Loquiz accepteert de sleutel niet (401)');

async function get(path) {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(BASE + path, { headers: { ...SCHEMES[scheme](key), Accept: 'application/json' }, signal: AbortSignal.timeout(30000) });
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
    if (ok % 25 === 0) console.log(`  ${ok} games opgehaald…`);
  } catch (err) {
    failed++;
    console.log(String(err.message));
  }
}
console.log(`Opgehaald: ${ok}, mislukt: ${failed}`);

// Foto's en audio worden niet hier gedownload: de beheeromgeving kopieert
// externe afbeeldingen bij het importeren naar de eigen opslag.
