/*
 * Service worker van de webapp (speler-app in de browser). Gemaakt door
 * scripts/web-build.mjs, dat de versie en de lijst met bestanden invult.
 *
 * - De app zelf (pagina, scripts, plaatjes) staat na de eerste keer op de
 *   telefoon, zodat hij ook zonder bereik opstart.
 * - Kaartdelen (stijl, tegels, letters) komen eerst uit de opslag: die zet de
 *   app er bij het aanmelden in voor het speelveld (map-download.web.ts), en
 *   alles wat de kaart onderweg laadt komt er ook bij.
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
    event.respondWith(cacheFirst(request, url.hostname === 'unpkg.com' ? APP_CACHE : MAP_CACHE));
  }
});
