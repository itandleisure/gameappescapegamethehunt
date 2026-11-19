/**
 * Bouwt de webapp: de speler-app voor in de browser, te installeren op het
 * beginscherm (PWA) en zonder bereik op te starten.
 *
 *   node scripts/web-build.mjs                          # naar dist-web/, onder /speel
 *   node scripts/web-build.mjs --out ../admin/public/speel --base /speel
 *
 * De beheeromgeving roept dit aan bij het bouwen (zie apps/admin/package.json),
 * zodat de webapp op hetzelfde domein staat als de spellinks:
 * https://<domein>/speel
 * De server moet bij sw.js de kop `Service-Worker-Allowed: /speel` meesturen
 * (zie apps/admin/next.config.ts), omdat de webapp ook op /speel zelf staat.
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : fallback;
};
const out = resolve(process.cwd(), arg('out', join(root, 'dist-web')));
const base = arg('base', '/speel').replace(/\/$/, '');

// Kaartbibliotheek van de kaartpagina (src/ui/map/web-map-html.ts).
const mapHtml = readFileSync(join(root, 'src/ui/map/web-map-html.ts'), 'utf8');
const maplibre = /MAPLIBRE = '([^']+)'/.exec(mapHtml)?.[1];
const EXTERNAL = maplibre ? [`${maplibre}/maplibre-gl.js`, `${maplibre}/maplibre-gl.css`] : [];

rmSync(out, { recursive: true, force: true });
const result = spawnSync('npx', ['expo', 'export', '--platform', 'web', '--output-dir', out], {
  cwd: root,
  stdio: 'inherit',
  env: { ...process.env, PLAYER_WEB_BASE: base, EXPO_NO_TELEMETRY: '1' },
  shell: process.platform === 'win32',
});
if (result.status !== 0) {
  console.error('Webapp bouwen mislukt');
  process.exit(1);
}

// Pictogrammen.
for (const file of ['icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'apple-touch-icon.png', 'favicon.png']) {
  cpSync(join(root, 'web', file), join(out, file));
}

// Beschrijving voor "op beginscherm zetten".
const manifest = {
  name: 'Escape Game The Hunt',
  short_name: 'The Hunt',
  lang: 'nl',
  // Zonder slash aan het eind: zo staat het adres ook in de beheeromgeving (Next.js haalt die slash weg).
  start_url: base,
  scope: base,
  display: 'standalone',
  orientation: 'portrait',
  background_color: '#101214',
  theme_color: '#101214',
  icons: [
    { src: `${base}/icon-192.png`, sizes: '192x192', type: 'image/png' },
    { src: `${base}/icon-512.png`, sizes: '512x512', type: 'image/png' },
    { src: `${base}/icon-maskable-512.png`, sizes: '512x512', type: 'image/png', purpose: 'maskable' },
  ],
};
writeFileSync(join(out, 'manifest.webmanifest'), JSON.stringify(manifest, null, 2));

// Kop van de pagina: beginscherm, iPhone-instellingen, service worker.
const head = `
    <link rel="manifest" href="${base}/manifest.webmanifest" />
    <meta name="theme-color" content="#101214" />
    <meta name="mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
    <meta name="apple-mobile-web-app-title" content="The Hunt" />
    <link rel="apple-touch-icon" href="${base}/apple-touch-icon.png" />
    <link rel="icon" type="image/png" href="${base}/favicon.png" />
    <style>html,body{background:#101214;overscroll-behavior:none}</style>
    <script>
      // Knop "Op beginscherm zetten" (Android): de vraag van de browser bewaren tot de speler erop tikt.
      window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); window.__huntInstall = e; window.dispatchEvent(new Event('hunt-install')); });
      if ('serviceWorker' in navigator) window.addEventListener('load', function () { navigator.serviceWorker.register('${base}/sw.js', { scope: '${base}' }).catch(function () {}); });
    </script>
`;
const indexPath = join(out, 'index.html');
let index = readFileSync(indexPath, 'utf8');
index = index
  .replace('<html lang="en">', '<html lang="nl">')
  .replace(/<meta name="viewport"[^>]*>/, '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />')
  .replace('</head>', `${head}  </head>`);
writeFileSync(indexPath, index);

// Service worker met alle bestanden van deze versie.
function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}
const files = walk(out)
  .map((f) => relative(out, f).split('\\').join('/'))
  .filter((f) => f !== 'sw.js' && f !== 'metadata.json' && !f.endsWith('.map'));
const hash = createHash('sha256');
for (const f of files.sort()) hash.update(f).update(readFileSync(join(out, f)));
const version = hash.digest('hex').slice(0, 12);
const precache = [base, ...files.map((f) => `${base}/${f}`)];
const sw = readFileSync(join(root, 'web', 'sw.js'), 'utf8')
  .replace('__VERSION__', version)
  .replace('__BASE__', base)
  .replace('__PRECACHE__', JSON.stringify(precache))
  .replace('__EXTERNAL__', JSON.stringify(EXTERNAL));
writeFileSync(join(out, 'sw.js'), sw);

console.log(`Webapp klaar in ${out} (versie ${version}, ${files.length} bestanden, adres ${base}/)`);
if (!existsSync(join(out, '_expo'))) console.warn('Let op: geen scripts gevonden in _expo/.');
