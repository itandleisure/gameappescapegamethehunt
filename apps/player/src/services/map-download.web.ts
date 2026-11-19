import { DEFAULT_MAP_SOURCE, insideStyleUrl, rewriteMapUrl, type GamePackage } from '@hunt/engine';
import { styleAssetUrls, tileUrls, type MapStyleJson } from '../core/offline-map';
import { playAreaBounds } from '../core/play-area';
import { prepareMapProvider } from './map-provider';

/**
 * Webapp: de kaart van het speelveld vooraf in de opslag van de browser
 * zetten (Cache Storage), zodat hij ook in steegjes zonder bereik werkt. De
 * service worker (public/sw.js, zie scripts/web-build.mjs) haalt kaartdelen
 * daarna eerst uit die opslag. Na afloop weer verwijderd.
 */
export const MAP_CACHE = 'hunt-kaart';
const MIN_ZOOM = 12;
const MAX_ZOOM = 16;
/** Zoveel adressen tegelijk ophalen. */
const PARALLEL = 6;

export function mapStyleUrl(game: GamePackage): string {
  return game.map?.styleUrl ?? DEFAULT_MAP_SOURCE.styleUrl;
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { mode: 'cors' });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return (await res.json()) as T;
}

export async function downloadPlayArea(_sessionId: string, game: GamePackage, onProgress: (percent: number) => void): Promise<void> {
  const rewrites = await prepareMapProvider();
  const bounds = playAreaBounds(game);
  if (!bounds || typeof caches === 'undefined') return;
  const rw = (url: string) => rewriteMapUrl(url, rewrites);

  const styleUrl = rw(mapStyleUrl(game));
  const style = await getJson<MapStyleJson>(styleUrl);
  const urls = [styleUrl, ...styleAssetUrls(style, styleUrl).map(rw)];
  // Stijl binnen het speelveld (zoals Toner met kleur): zelfde kaartdelen, eigen stijl en letters.
  const inside = insideStyleUrl(mapStyleUrl(game));
  if (inside) {
    const insideUrl = rw(inside);
    const insideStyle = await getJson<MapStyleJson>(insideUrl).catch(() => null);
    if (insideStyle) urls.push(insideUrl, ...styleAssetUrls(insideStyle, insideUrl).map(rw));
  }
  for (const source of Object.values(style.sources ?? {})) {
    if (source.type !== 'vector' && source.type !== 'raster') continue;
    let tiles = source.tiles;
    let maxzoom = source.maxzoom;
    if (!tiles && source.url) {
      const tileJsonUrl = rw(source.url);
      urls.push(tileJsonUrl);
      const tileJson = await getJson<{ tiles?: string[]; maxzoom?: number }>(tileJsonUrl);
      tiles = tileJson.tiles;
      maxzoom = tileJson.maxzoom ?? maxzoom;
    }
    if (tiles?.length) urls.push(...tileUrls(tiles.map(rw), bounds, MIN_ZOOM, MAX_ZOOM, maxzoom));
  }

  const cache = await caches.open(MAP_CACHE);
  let done = 0;
  let next = 0;
  const unique = [...new Set(urls)];
  const worker = async () => {
    while (next < unique.length) {
      const url = unique[next++]!;
      try {
        if (!(await cache.match(url))) {
          const res = await fetch(url, { mode: 'cors' });
          if (res.ok) await cache.put(url, res);
        }
      } catch {
        // één tegel mislukt: de rest gaat door; zonder bereik later opnieuw bij het openen van de kaart
      }
      done++;
      if (done % 10 === 0 || done === unique.length) onProgress(Math.round((done / unique.length) * 100));
    }
  };
  await Promise.all(Array.from({ length: PARALLEL }, worker));
}

/** Kaart van het speelveld weer uit de browser halen. */
export async function removePlayAreas(keepSessionId?: string): Promise<void> {
  if (keepSessionId || typeof caches === 'undefined') return;
  await caches.delete(MAP_CACHE).catch(() => false);
}
