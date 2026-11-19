import { describe, expect, it } from 'vitest';
import { styleAssetUrls, tileUrls } from '../src/core/offline-map';

describe('kaart vooraf laden in de webapp', () => {
  it('haalt pictogrammen en letters van de stijl op', () => {
    const urls = styleAssetUrls(
      {
        sprite: 'https://tiles.openfreemap.org/sprites/ofm_f384/ofm',
        glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
        layers: [{ layout: { 'text-font': ['Noto Sans Regular'] } }, { layout: { 'text-font': ['Noto Sans Bold'] } }, { layout: {} }],
      },
      'https://example.org/stijl.json',
    );
    expect(urls).toContain('https://tiles.openfreemap.org/sprites/ofm_f384/ofm@2x.png');
    expect(urls).toContain('https://tiles.openfreemap.org/fonts/Noto%20Sans%20Bold/0-255.pbf');
    expect(urls).toHaveLength(4 + 2 * 2);
  });

  it('haalt tegels van het speelveld op, niet dieper dan de bron', () => {
    // Klein stukje Leeuwarden.
    const urls = tileUrls(['https://t/{z}/{x}/{y}.pbf', 'https://b/{z}/{x}/{y}.pbf'], [5.79, 53.198, 5.8, 53.204], 12, 16, 14);
    expect(urls.every((u) => u.startsWith('https://t/'))).toBe(true);
    expect(urls.some((u) => u.startsWith('https://t/15/'))).toBe(false);
    expect(urls.some((u) => u.startsWith('https://t/14/'))).toBe(true);
    expect(urls[0]).toBe('https://t/12/2113/1330.pbf');
    expect(urls.length).toBeLessThan(20);
  });
});
