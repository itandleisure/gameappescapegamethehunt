// Maakt een losse proefpagina (HTML) met de echte kaartcode van de speler-app en de stijl
// "Toner met kleur", voor Leeuwarden. Gebruik: node scripts/kaartvoorbeelden/proefkaart.mjs <bestand.html>
import { readFileSync, writeFileSync } from 'node:fs';
import { makeStyle, TONER, VARIANTEN } from './stijlen.mjs';

const src = readFileSync(new URL('../../apps/player/src/ui/map/web-map-html.ts', import.meta.url), 'utf8');
const script = src.slice(src.indexOf('String.raw`') + 11, src.indexOf('`;\n\nexport function webMapHtml'));
const css = src.slice(src.indexOf('return `', src.indexOf('export function mapCss')) + 8, src.indexOf('`;', src.indexOf('export function mapCss')))
  .replaceAll('${accent}', '#e5963f').replaceAll('${dark}', '#252f3d').replace(/url\(\$\{LOGO_ICON_DATA_URI\}\)/, 'none');
const ring = [[5.797975, 53.207137], [5.801114, 53.206638], [5.802022, 53.206999], [5.803468, 53.205746], [5.805856, 53.204994], [5.804019, 53.203747], [5.802789, 53.199484], [5.798145, 53.199018], [5.797149, 53.198163], [5.788273, 53.198602], [5.78818, 53.200649], [5.786848, 53.201619], [5.786763, 53.201982], [5.788294, 53.202628], [5.787575, 53.203864], [5.78781, 53.204397], [5.790337, 53.20443], [5.792433, 53.20582], [5.794941, 53.205456]];
const data = {
  bounds: [5.786763, 53.198163, 5.805856, 53.207137],
  boundary: { points: ring.map(([lng, lat]) => ({ lat, lng })), color: '#e5963f', outside: { color: '#000000', opacity: 0 } },
  markers: [
    { id: '1', lat: 53.2016, lng: 5.7958, label: '1', badge: '1' },
    { id: '2', lat: 53.2003, lng: 5.7915, label: '2', badge: '2' },
    { id: '3', lat: 53.2037, lng: 5.7993, label: '3', badge: '3' },
  ],
  inside: makeStyle(VARIANTEN[0].palet, { landmarks: true }),
};
const out = process.argv[2] ?? 'proefkaart-leeuwarden.html';
writeFileSync(out, `<!doctype html><html lang="nl"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
<title>Proefkaart Leeuwarden: Toner met kleur</title>
<link rel="stylesheet" href="https://unpkg.com/maplibre-gl@5.6.0/dist/maplibre-gl.css">
<script src="https://unpkg.com/maplibre-gl@5.6.0/dist/maplibre-gl.js"></script>
<style>html,body{margin:0;height:100%;background:#252f3d}#wrap{position:relative;height:100%;max-width:480px;margin:0 auto}#map{position:absolute;inset:0}
#uitleg{position:absolute;top:10px;left:10px;right:10px;z-index:5;background:rgba(37,47,61,.92);color:#fff;font:14px/1.4 -apple-system,Segoe UI,sans-serif;padding:10px 12px;border-radius:8px}#uitleg b{color:#e5963f}
${css}</style></head><body><div id="wrap"><div id="map"></div><div id="uitleg"><b>Proefkaart Leeuwarden.</b> Toner met kleur in het speelveld. Sleep en zoom gerust in; de namen van kerken, stadhuis en musea verschijnen bij inzoomen.</div></div>
<script>
function showError(m){document.getElementById('uitleg').textContent='Kaart: '+m;}
const hunt = new Function('maplibregl','container','styleUrl','rewriteList','showError', ${JSON.stringify(script)})(maplibregl, 'map', ${JSON.stringify(makeStyle(TONER))}, [], showError);
hunt(${JSON.stringify(data)});
</script></body></html>`);
console.log('geschreven:', out);
