import { describe, expect, it } from 'vitest';
import { mapTilerCheckUrl, mapTilerRewrites, rewriteMapUrl } from '../src/map-provider.js';

describe('kaartdienst', () => {
  it('laat zonder sleutel alles bij OpenFreeMap', () => {
    expect(mapTilerRewrites(undefined)).toEqual([]);
    expect(mapTilerRewrites('  ')).toEqual([]);
    expect(rewriteMapUrl('https://tiles.openfreemap.org/planet', [])).toBe('https://tiles.openfreemap.org/planet');
  });

  it('zet tegels en letters om naar MapTiler', () => {
    const r = mapTilerRewrites('abc123');
    expect(rewriteMapUrl('https://tiles.openfreemap.org/planet', r)).toBe('https://api.maptiler.com/tiles/v3-openmaptiles/tiles.json?key=abc123');
    expect(rewriteMapUrl('https://tiles.openfreemap.org/fonts/Noto%20Sans%20Regular/0-255.pbf', r)).toBe(
      'https://api.maptiler.com/fonts/Noto%20Sans%20Regular/0-255.pbf?key=abc123',
    );
  });

  it('laat andere adressen met rust', () => {
    const r = mapTilerRewrites('abc123');
    for (const url of [
      'https://tiles.openfreemap.org/planet/20261115_080022_pt/14/8434/5390.pbf',
      'https://tiles.openfreemap.org/sprites/ofm_f384/ofm',
      'https://raw.githubusercontent.com/itandleisure/gameappescapegamethehunt/main/apps/admin/public/kaart/stijl.json',
      'https://example.test/overlay.png',
    ]) {
      expect(rewriteMapUrl(url, r)).toBe(url);
    }
  });

  it('maakt een testadres met de sleutel', () => {
    expect(mapTilerCheckUrl('a b')).toBe('https://api.maptiler.com/tiles/v3-openmaptiles/tiles.json?key=a%20b');
  });
});

describe('kaartdienst kiezen', () => {
  it('kiest MapTiler als die antwoordt', async () => {
    const { chooseMapRewrites } = await import('../src/map-provider.js');
    const seen: string[] = [];
    const r = await chooseMapRewrites('k', async (url) => (seen.push(url), { ok: true }));
    expect(r).toEqual(mapTilerRewrites('k'));
    expect(seen).toEqual(['https://api.maptiler.com/tiles/v3-openmaptiles/tiles.json?key=k']);
  });

  it('valt terug op OpenFreeMap bij een geweigerde sleutel, een fout of geen antwoord', async () => {
    const { chooseMapRewrites, openFreeMapRewrites } = await import('../src/map-provider.js');
    const { DEFAULT_MAP_SOURCE } = await import('../src/types.js');
    const none = openFreeMapRewrites(DEFAULT_MAP_SOURCE.styleUrl);
    const warn = console.warn;
    console.warn = () => undefined;
    try {
      expect(await chooseMapRewrites('k', async () => ({ ok: false }))).toEqual(none);
      expect(await chooseMapRewrites('k', async () => { throw new Error('offline'); })).toEqual(none);
      const hang = (_: string, init: { signal: AbortController['signal'] }) =>
        new Promise<{ ok: boolean }>((_, reject) => init.signal.addEventListener('abort', () => reject(new Error('afgebroken'))));
      expect(await chooseMapRewrites('k', hang, 20)).toEqual(none);
      expect(await chooseMapRewrites('', async () => ({ ok: true }))).toEqual(none);
    } finally {
      console.warn = warn;
    }
  });
});

describe('stijlen van MapTiler', () => {
  it('krijgen de sleutel erbij met MapTiler', async () => {
    const { MAPTILER_TONER } = await import('../src/types.js');
    expect(rewriteMapUrl(MAPTILER_TONER, mapTilerRewrites('k'))).toBe('https://api.maptiler.com/maps/toner-v2/style.json?key=k');
    // Adressen die MapTiler zelf al met sleutel teruggeeft blijven gelijk.
    const signed = 'https://api.maptiler.com/maps/toner-v2/sprite.json?key=k';
    expect(rewriteMapUrl(signed, mapTilerRewrites('k'))).toBe(signed);
  });

  it('worden zwart-wit zonder MapTiler', async () => {
    const { MAPTILER_TONER, DEFAULT_MAP_SOURCE } = await import('../src/types.js');
    const { openFreeMapRewrites } = await import('../src/map-provider.js');
    const none = openFreeMapRewrites(DEFAULT_MAP_SOURCE.styleUrl);
    expect(rewriteMapUrl(MAPTILER_TONER, none)).toBe(DEFAULT_MAP_SOURCE.styleUrl);
    expect(rewriteMapUrl('https://tiles.openfreemap.org/planet', none)).toBe('https://tiles.openfreemap.org/planet');
  });
});
