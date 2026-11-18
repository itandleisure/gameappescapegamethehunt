/**
 * Kaartdienst kiezen zonder de kaartstijlen te wijzigen.
 *
 * Onze stijlen (apps/admin/public/kaart/*.json) halen kaarttegels en letters
 * bij OpenFreeMap. Met een MapTiler-sleutel worden die adressen onderweg
 * omgezet naar MapTiler; beide leveren hetzelfde soort kaart (OpenMapTiles),
 * dus de stijlen werken op allebei. Zonder sleutel, of als MapTiler niet
 * reageert, blijft alles bij OpenFreeMap.
 */

import { DEFAULT_MAP_SOURCE } from './types.js';

/** Zoek-en-vervang op een adres; `find` is een reguliere expressie, `replace` mag $1 gebruiken. */
export interface UrlRewrite {
  find: string;
  replace: string;
}

export const MAPTILER_TILEJSON = 'https://api.maptiler.com/tiles/v3-openmaptiles/tiles.json';

/** Adres om te testen of MapTiler reageert en de sleutel geldig is. */
export function mapTilerCheckUrl(key: string): string {
  return `${MAPTILER_TILEJSON}?key=${encodeURIComponent(key)}`;
}

/**
 * Zonder MapTiler: een stijl van MapTiler (zoals Toner) wordt onze zwart-witte
 * stijl, zodat er altijd een kaart is.
 */
export function openFreeMapRewrites(fallbackStyleUrl: string): UrlRewrite[] {
  return [{ find: '^https://api\\.maptiler\\.com/maps/[^/]+/style\\.json.*$', replace: fallbackStyleUrl }];
}

/** Omzettingen van OpenFreeMap naar MapTiler. Leeg zonder sleutel. */
export function mapTilerRewrites(key: string | null | undefined): UrlRewrite[] {
  const k = key?.trim();
  if (!k) return [];
  const q = encodeURIComponent(k);
  return [
    // Stijlen van MapTiler zelf (zoals Toner) staan zonder sleutel in het spel.
    { find: '^(https://api\\.maptiler\\.com/maps/[^?]+)$', replace: `$1?key=${q}` },
    // Beschrijving van de kaarttegels; MapTiler zet de sleutel zelf in de tegeladressen.
    { find: '^https://tiles\\.openfreemap\\.org/planet/?$', replace: `${MAPTILER_TILEJSON}?key=${q}` },
    // Letters voor de straatnamen (zelfde lettertypen, Noto Sans).
    { find: '^https://tiles\\.openfreemap\\.org/fonts/(.+)$', replace: `https://api.maptiler.com/fonts/$1?key=${q}` },
  ];
}

/** Past de omzettingen toe op één adres. */
export function rewriteMapUrl(url: string, rewrites: readonly UrlRewrite[]): string {
  let out = url;
  for (const r of rewrites) out = out.replace(new RegExp(r.find), r.replace);
  return out;
}

type FetchLike = (url: string, init: { signal: AbortController['signal'] }) => Promise<{ ok: boolean }>;

/**
 * Kiest de kaartdienst bij het opstarten: MapTiler als er een sleutel is en
 * MapTiler binnen `timeoutMs` antwoordt, anders OpenFreeMap (met zwart-wit in
 * plaats van een MapTiler-stijl).
 */
export async function chooseMapRewrites(key: string | null | undefined, fetchImpl: FetchLike = (url, init) => fetch(url, init as never), timeoutMs = 4000): Promise<UrlRewrite[]> {
  const rewrites = mapTilerRewrites(key);
  const fallback = openFreeMapRewrites(DEFAULT_MAP_SOURCE.styleUrl);
  if (!rewrites.length) return fallback;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(mapTilerCheckUrl(key!.trim()), { signal: controller.signal });
    if (res.ok) return rewrites;
    console.warn('MapTiler weigert de sleutel; de kaart gebruikt OpenFreeMap.');
  } catch {
    console.warn('MapTiler reageert niet; de kaart gebruikt OpenFreeMap.');
  } finally {
    clearTimeout(timer);
  }
  return fallback;
}
