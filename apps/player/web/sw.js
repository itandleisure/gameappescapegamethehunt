/*
 * Service worker van de webapp (speler-app in de browser). Gemaakt door
 * scripts/web-build.mjs, dat de versie en de lijst met bestanden invult.
 *
 * - De app zelf (pagina, scripts, plaatjes) staat na de eerste keer op de
 *   telefoon, zodat hij ook zonder bereik opstart.
 * - Kaartdelen (tegels, letters, plaatjes) komen eerst uit de opslag: die zet
 *   de app er bij het aanmelden in voor het speelveld (map-download.web.ts),
 *   en alles wat de kaart onderweg laadt komt er ook bij.
 * - Beschrijvingen van de kaart (stijl en tegelbeschrijving, .json) komen
 *   eerst van het netwerk. OpenFreeMap zet elke week nieuwe tegels online in
 *   een nieuwe map en haalt oude weg; een bewaarde tegelbeschrijving wijst dan
 *   naar tegels die niet meer bestaan en de kaart blijft leeg. Zonder bereik
 *   komt de bewaarde versie.
 * - De server (Supabase) gaat altijd rechtstreeks; zonder bereik bewaart het
 *   spel zelf wat er nog verstuurd moet worden.
 */
const VERSION = '__VERSION__';
const BASE = '__BASE__';
const PRECACHE = __PRECACHE__;
const EXTERNAL = __EXTERNAL__;
const APP_CACHE = 'hunt-app-' + VERSION;
const MAP_CACHE = 'hunt-kaart';
const MAP_HOSTS = ['tiles.openfreemap.org', 'api.maptiler.com', 'raw.githubusercontent.com', 'unpkg.com'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(APP_CACHE);
      await cache.addAll(PRECACHE);
      // Kaartbibliotheek; mag mislukken (dan bij het eerste gebruik).
      await Promise.all(EXTERNAL.map((url) => cache.add(new Request(url, { mode: 'cors' })).catch(() => undefined)));
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) {
        if (key.startsWith('hunt-app-') && key !== APP_CACHE) await caches.delete(key);
      }
      await self.clients.claim();
    })(),
  );
});

/** Eerst uit de opslag, anders ophalen en bewaren. */
async function cacheFirst(request, cacheName) {
  const hit = await caches.match(request, { ignoreVary: true });
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok || res.type === 'opaque') {
    const cache = await caches.open(cacheName);
    await cache.put(request, res.clone()).catch(() => undefined);
  }
  return res;
}

/** Kaartdelen die niet veranderen: tegels, letters en plaatjes. */
function isMapAsset(url) {
  return /\.(pbf|mvt|png|jpe?g|webp|js|css)$/i.test(url.pathname) || url.pathname.startsWith('/fonts/');
}

/** Eerst het netwerk (met een korte wachttijd), zonder bereik de bewaarde versie. */
async function networkFirst(request, cacheName) {
  try {
    const res = await Promise.race([
      fetch(request),
      new Promise((_, reject) => setTimeout(() => reject(new Error('traag')), 4000)),
    ]);
    if (res.ok) {
      const cache = await caches.open(cacheName);
      await cache.put(request, res.clone()).catch(() => undefined);
      return res;
    }
  } catch {
    // geen bereik of te traag
  }
  return (await caches.match(request, { ignoreVary: true })) || fetch(request);
}

/** De pagina: eerst het netwerk (nieuwste versie), zonder bereik de bewaarde pagina. */
async function page(request) {
  try {
    const res = await Promise.race([
      fetch(request),
      new Promise((_, reject) => setTimeout(() => reject(new Error('traag')), 5000)),
    ]);
    if (res.ok) return res;
  } catch {
    // geen bereik of te traag
  }
  return (await caches.match(BASE + '/index.html')) || (await caches.match(BASE)) || Response.error();
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin === self.location.origin) {
    if (!url.pathname.startsWith(BASE + '/') && url.pathname !== BASE) return;
    if (request.mode === 'navigate') return event.respondWith(page(request));
    if (url.pathname.endsWith('/sw.js')) return;
    return event.respondWith(cacheFirst(request, APP_CACHE));
  }
  if (MAP_HOSTS.includes(url.hostname)) {
    if (url.hostname === 'unpkg.com') return event.respondWith(cacheFirst(request, APP_CACHE));
    event.respondWith(isMapAsset(url) ? cacheFirst(request, MAP_CACHE) : networkFirst(request, MAP_CACHE));
  }
});
