// Zet de web worker van MapLibre in public/, zodat de browser hem kan laden.
// Webpack neemt hem niet mee in de bundel (MapLibre 6 zoekt hem naast zijn
// eigen module), waardoor kaarten zonder tegels en pinnen bleven.
import { copyFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);
const dist = dirname(require.resolve('maplibre-gl/dist/maplibre-gl.css'));
const target = new URL('../public/maplibre/', import.meta.url);
mkdirSync(target, { recursive: true });
copyFileSync(join(dist, 'maplibre-gl-worker.mjs'), new URL('maplibre-gl-worker.mjs', target));
console.log('MapLibre-worker gekopieerd naar public/maplibre/');
