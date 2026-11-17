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
  const res = await fetch(`${BASE}/games?limit=1`, { headers: { ...SCHEMES[scheme](key), Accept: 'application/json' } });
  console.log(`Aanmeldvorm ${scheme + 1}: status ${res.status}`);
  if (res.ok) break;
}
if (scheme === SCHEMES.length) throw new Error('Loquiz accepteert de sleutel niet (401)');

async function get(path) {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(BASE + path, { headers: { ...SCHEMES[scheme](key), Accept: 'application/json' } });
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

// Foto's, audio en overlays downloaden, zodat we niet van Loquiz-links afhangen.
// Video's (YouTube/Vimeo) en webpagina's blijven een link.
await mkdir(join(outDir, 'media'), { recursive: true });
const { readdir, readFile } = await import('node:fs/promises');
const { createHash } = await import('node:crypto');
const urls = new Set();
for (const file of await readdir(join(outDir, 'games'))) {
  const game = JSON.parse(await readFile(join(outDir, 'games', file), 'utf8'));
  for (const u of [game.logoUrl, game.taskBackgroundImageUrl]) if (u) urls.add(u);
  for (const o of game.mapOverlays ?? []) if (o?.imageUrl) urls.add(o.imageUrl);
  for (const t of game.tasks ?? []) {
    for (const m of t.media ?? []) if ((m?.type === 'image' || m?.type === 'audio') && m.url) urls.add(m.url);
    if (t.backgroundAudio?.url) urls.add(t.backgroundAudio.url);
    // Afbeeldingen die als <img> in de tekst staan
    for (const field of [t.text, t.comments?.shortIntro, t.comments?.hint, t.comments?.correct, t.comments?.incorrect]) {
      for (const m of String(field ?? '').matchAll(/<img[^>]+src=["']([^"']+)["']/gi)) urls.add(m[1]);
    }
  }
}
const index = {};
let mediaOk = 0;
let mediaFailed = 0;
for (const url of urls) {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(String(res.status));
    const ext = (new URL(url).pathname.match(/\.[a-z0-9]{2,5}$/i)?.[0] ?? '').toLowerCase();
    const name = createHash('sha1').update(url).digest('hex').slice(0, 16) + ext;
    await writeFile(join(outDir, 'media', name), Buffer.from(await res.arrayBuffer()));
    index[url] = { file: name, contentType: res.headers.get('content-type') };
    mediaOk++;
  } catch {
    mediaFailed++;
  }
}
await writeFile(join(outDir, 'media', 'index.json'), JSON.stringify(index, null, 1));
console.log(`Media: ${mediaOk} gedownload, ${mediaFailed} mislukt`);
