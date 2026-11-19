import { tileXY, type Bounds } from './play-area';

/**
 * Welke adressen de webapp vooraf moet ophalen zodat de kaart van het
 * speelveld ook zonder bereik werkt: de kaartstijl, de pictogrammen
 * (sprite), de letters voor straatnamen en de kaarttegels. Zonder netwerk,
 * zodat het te testen is.
 */

interface StyleLayer {
  layout?: { 'text-font'?: unknown };
}
export interface MapStyleJson {
  sprite?: string | { id: string; url: string }[];
  glyphs?: string;
  sources?: Record<string, { type?: string; url?: string; tiles?: string[]; maxzoom?: number; minzoom?: number }>;
  layers?: StyleLayer[];
}

/** Tekens 0-511: Latijnse letters met accenten, cijfers en leestekens. */
const GLYPH_RANGES = ['0-255', '256-511'];

/** Pictogrammen en letters van de stijl. */
export function styleAssetUrls(style: MapStyleJson, styleUrl: string): string[] {
  const urls: string[] = [];
  const sprites = typeof style.sprite === 'string' ? [style.sprite] : (style.sprite ?? []).map((s) => s.url);
  for (const sprite of sprites) {
    const base = new URL(sprite, styleUrl).toString();
    for (const suffix of ['.json', '.png', '@2x.json', '@2x.png']) urls.push(base + suffix);
  }
  if (style.glyphs) {
    const fonts = new Set<string>();
    for (const layer of style.layers ?? []) {
      const font = layer.layout?.['text-font'];
      if (Array.isArray(font) && font.every((f) => typeof f === 'string')) fonts.add(font.join(','));
    }
    for (const font of fonts) {
      for (const range of GLYPH_RANGES) {
        urls.push(new URL(style.glyphs.replace('{fontstack}', encodeURIComponent(font)).replace('{range}', range), styleUrl).toString());
      }
    }
  }
  return urls;
}

/** Tegeladressen voor het speelveld, van minZoom tot maxZoom (maar niet dieper dan de bron levert). */
export function tileUrls(templates: readonly string[], bounds: Bounds, minZoom: number, maxZoom: number, sourceMaxZoom = 22): string[] {
  const [west, south, east, north] = bounds;
  const top = Math.min(maxZoom, sourceMaxZoom);
  const urls: string[] = [];
  templates.forEach((template, i) => {
    // Bij meerdere servers (a/b/c) maakt het niet uit welke; de eerste is genoeg.
    if (i > 0) return;
    for (let z = Math.min(minZoom, top); z <= top; z++) {
      const [x1, y1] = tileXY(west, north, z);
      const [x2, y2] = tileXY(east, south, z);
      for (let x = Math.min(x1, x2); x <= Math.max(x1, x2); x++) {
        for (let y = Math.min(y1, y2); y <= Math.max(y1, y2); y++) {
          urls.push(template.replace('{z}', String(z)).replace('{x}', String(x)).replace('{y}', String(y)));
        }
      }
    }
  });
  return urls;
}
