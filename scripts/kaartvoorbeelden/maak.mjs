// Maakt voorbeeldplaatjes van de kaartvarianten (Leeuwarden), op telefoonformaat.
// Gebruik: node scripts/kaartvoorbeelden/maak.mjs <uitvoermap>
// Buiten het speelveld Toner, erbinnen kleur: twee kaarten op elkaar, de bovenste
// (kleur) uitgeknipt op de vorm van het speelveld.
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';
import { makeStyle, TONER, VARIANTEN } from './stijlen.mjs';

const OUT = process.argv[2] ?? 'kaartvoorbeelden';
mkdirSync(OUT, { recursive: true });

// Speelveld The Hunt Leeuwarden (uit Loquiz).
const SPEELVELD = [[5.797975, 53.207137], [5.801114, 53.206638], [5.802022, 53.206999], [5.803468, 53.205746], [5.805856, 53.204994], [5.804019, 53.203747], [5.802789, 53.199484], [5.798145, 53.199018], [5.797149, 53.198163], [5.788273, 53.198602], [5.78818, 53.200649], [5.786848, 53.201619], [5.786763, 53.201982], [5.788294, 53.202628], [5.787575, 53.203864], [5.78781, 53.204397], [5.790337, 53.20443], [5.792433, 53.20582], [5.794941, 53.205456]];
const ACCENT = '#e5963f';

const VIEWS = [
  { id: 'overzicht', fit: true },
  { id: 'rand', center: [5.7905, 53.2033], zoom: 16.3 },
  { id: 'detail', center: [5.7955, 53.2015], zoom: 17.2 },
];

function page(outside, inside, view) {
  return `<!doctype html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="https://unpkg.com/maplibre-gl@5.6.0/dist/maplibre-gl.css">
<script src="https://unpkg.com/maplibre-gl@5.6.0/dist/maplibre-gl.js"></script>
<style>html,body{margin:0;height:100%}#b,#a{position:absolute;inset:0}</style></head><body>
<div id="b"></div><div id="a"></div><script>
const ring = ${JSON.stringify(SPEELVELD)};
const view = ${JSON.stringify(view)};
const line = { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [...ring, ring[0]] } };
const opts = (container, style) => ({ container, style, interactive: false, attributionControl: false, fadeDuration: 0,
  ...(view.fit ? { bounds: [[Math.min(...ring.map(p=>p[0])), Math.min(...ring.map(p=>p[1]))], [Math.max(...ring.map(p=>p[0])), Math.max(...ring.map(p=>p[1]))]], fitBoundsOptions: { padding: 30 } } : { center: view.center, zoom: view.zoom }) });
const maps = [new maplibregl.Map(opts('b', ${JSON.stringify(outside)})), new maplibregl.Map(opts('a', ${JSON.stringify(inside)}))];
const a = document.getElementById('a');
function clip() { a.style.clipPath = 'polygon(' + ring.map(p => { const q = maps[1].project(p); return q.x + 'px ' + q.y + 'px'; }).join(',') + ')'; }
let ready = 0;
maps.forEach((m) => m.on('load', () => {
  m.addSource('grens', { type: 'geojson', data: line });
  m.addLayer({ id: 'grens', type: 'line', source: 'grens', layout: { 'line-join': 'round' }, paint: { 'line-color': '${ACCENT}', 'line-width': 4 } });
  clip();
  m.once('idle', () => { ready++; if (ready === 2) setTimeout(() => (window.klaar = true), 500); });
}));
</script></body></html>`;
}

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 760 }, deviceScaleFactor: 2 });
const outside = makeStyle(TONER, { labels: true });
const runs = [
  ...VARIANTEN.map((v) => ({ id: v.id, inside: makeStyle(v.palet, { labels: true, landmarks: true }) })),
  { id: '0-huidig-alleen-toner', inside: outside },
];
for (const r of runs) {
  for (const view of VIEWS) {
    const p = await ctx.newPage();
    p.on('pageerror', (e) => console.error(r.id, e.message));
    await p.setContent(page(outside, r.inside, view));
    await p.waitForFunction(() => window.klaar === true, null, { timeout: 60000 });
    await p.screenshot({ path: `${OUT}/${r.id}--${view.id}.png` });
    console.log('klaar', r.id, view.id);
    await p.close();
  }
}
await browser.close();
