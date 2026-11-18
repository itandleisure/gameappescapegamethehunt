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
    expect(r).toHaveLength(2);
    expect(seen).toEqual(['https://api.maptiler.com/tiles/v3-openmaptiles/tiles.json?key=k']);
  });

  it('valt terug op OpenFreeMap bij een geweigerde sleutel, een fout of geen antwoord', async () => {
    const { chooseMapRewrites } = await import('../src/map-provider.js');
    const warn = console.warn;
    console.warn = () => undefined;
    try {
      expect(await chooseMapRewrites('k', async () => ({ ok: false }))).toEqual([]);
      expect(await chooseMapRewrites('k', async () => { throw new Error('offline'); })).toEqual([]);
      const hang = (_: string, init: { signal: AbortController['signal'] }) =>
        new Promise<{ ok: boolean }>((_, reject) => init.signal.addEventListener('abort', () => reject(new Error('afgebroken'))));
      expect(await chooseMapRewrites('k', hang, 20)).toEqual([]);
      expect(await chooseMapRewrites('', async () => ({ ok: true }))).toEqual([]);
    } finally {
      console.warn = warn;
    }
  });
});
