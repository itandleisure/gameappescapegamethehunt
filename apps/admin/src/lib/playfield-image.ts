/**
 * Kaartje van het getekende speelveld als foto bij een opdracht.
 *
 * Opdrachten met `playfieldImage` (zoals uitlegscherm 2 "Speelveld") tonen
 * geen vaste foto maar een kaartje van het speelveld van de stad: de kaart met
 * de grens erop en de grijze laag erbuiten, zoals spelers het straks in de app
 * zien. De beheeromgeving tekent dat kaartje bij het publiceren in de browser
 * (MapLibre), slaat het op in de bucket media en zet het adres als foto in het
 * spelpakket. Zo is het een gewone afbeelding: de speler-app hoeft er geen kaart
 * voor te tekenen, en hij werkt ook offline en op elke telefoon.
 *
 * Het bestand heet naar een vingerafdruk van grens en kaartstijl. Verandert er
 * niets, dan wordt het bestaande kaartje opnieuw gebruikt.
 */
import {
  boundaryGeoJson,
  boundaryMaskGeoJson,
  DEFAULT_BOUNDARY_COLOR,
  DEFAULT_MAP_SOURCE,
  outsideShade,
  type GamePackage,
  type PlayBoundary,
} from '@hunt/engine';
import type { SupabaseClient } from '@supabase/supabase-js';

/** Afmetingen van het kaartje in CSS-pixels; getekend op dubbele resolutie. */
export const PLAYFIELD_WIDTH = 800;
export const PLAYFIELD_HEIGHT = 600;
const PIXEL_RATIO = 2;

/** Wel of geen opdracht die het kaartje wil, en een grens om te tekenen. */
export function needsPlayfieldImage(pkg: GamePackage): boolean {
  return pkg.tasks.some((t) => t.playfieldImage) && (pkg.boundary?.points.length ?? 0) >= 3;
}

/** Zet het kaartje als foto bij alle opdrachten die erom vragen. */
export function applyPlayfieldImage(pkg: GamePackage, url: string): GamePackage {
  return { ...pkg, tasks: pkg.tasks.map((t) => (t.playfieldImage ? { ...t, image: url } : t)) };
}

/** Alles wat het kaartje bepaalt, in vaste volgorde. */
export function playfieldFingerprint(boundary: PlayBoundary, styleUrl: string): string {
  const shade = outsideShade(boundary);
  return JSON.stringify({
    v: 1,
    size: [PLAYFIELD_WIDTH, PLAYFIELD_HEIGHT, PIXEL_RATIO],
    style: styleUrl,
    color: boundary.color ?? DEFAULT_BOUNDARY_COLOR,
    outside: [shade.color, shade.opacity],
    points: boundary.points.map((p) => (p.curve ? [p.lat, p.lng, p.curve.lat, p.curve.lng] : [p.lat, p.lng])),
  });
}

/** Korte, vaste hash (FNV-1a, 2 × 32 bits) voor de bestandsnaam. */
export function shortHash(text: string): string {
  let a = 0x811c9dc5;
  let b = 0x01000193 ^ 0x5bd1e995;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    a = Math.imul(a ^ c, 0x01000193) >>> 0;
    b = Math.imul(b ^ c, 0x01000193 + 2) >>> 0;
  }
  return a.toString(16).padStart(8, '0') + b.toString(16).padStart(8, '0');
}

/** Pad in de bucket media; de eerste map is het spel (zie de opslagregels). */
export function playfieldPath(gameId: string, boundary: PlayBoundary, styleUrl: string): string {
  return `${gameId}/speelveld-${shortHash(playfieldFingerprint(boundary, styleUrl))}.jpg`;
}

/** Hoek-coördinaten van de grens, inclusief bochten, voor het inzoomen. */
function boundaryBox(boundary: PlayBoundary): [[number, number], [number, number]] {
  const geo = boundaryGeoJson(boundary) as { features: { geometry: { coordinates: number[][] } }[] };
  const coords = geo.features.flatMap((f) => f.geometry.coordinates);
  const lngs = coords.map((c) => c[0]!);
  const lats = coords.map((c) => c[1]!);
  return [
    [Math.min(...lngs), Math.min(...lats)],
    [Math.max(...lngs), Math.max(...lats)],
  ];
}

/**
 * Tekent het kaartje in de browser. Een onzichtbare kaart van vaste maat zoomt
 * in op de grens, wacht tot alle tegels er zijn en geeft een JPG terug, met de
 * bronvermelding van de kaart rechtsonder.
 */
export async function renderPlayfieldImage(
  maplibre: typeof import('maplibre-gl'),
  boundary: PlayBoundary,
  styleUrl: string,
  attribution: string,
  timeoutMs = 30_000,
): Promise<Blob> {
  const holder = document.createElement('div');
  holder.style.cssText = `position:fixed;left:-10000px;top:0;width:${PLAYFIELD_WIDTH}px;height:${PLAYFIELD_HEIGHT}px;pointer-events:none;`;
  document.body.appendChild(holder);
  let map: import('maplibre-gl').Map | null = null;
  try {
    map = new maplibre.Map({
      container: holder,
      style: styleUrl,
      bounds: boundaryBox(boundary),
      fitBoundsOptions: { padding: 40, maxZoom: 17 },
      interactive: false,
      attributionControl: false,
      fadeDuration: 0,
      pixelRatio: PIXEL_RATIO,
      canvasContextAttributes: { preserveDrawingBuffer: true },
    });
    const m = map;
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('De kaart laadde niet op tijd.')), timeoutMs);
      let loaded = false;
      // Fout vóór het laden (stijl onbereikbaar): stoppen. Daarna (één tegel) negeren.
      m.on('error', (e) => {
        if (loaded) return;
        clearTimeout(timer);
        reject(e.error ?? new Error('Kaart kon niet laden.'));
      });
      m.once('load', () => {
        loaded = true;
        const shade = outsideShade(boundary);
        m.addSource('outside', { type: 'geojson', data: boundaryMaskGeoJson(boundary) as never });
        m.addLayer({ id: 'outside', type: 'fill', source: 'outside', paint: { 'fill-color': shade.color, 'fill-opacity': shade.opacity } });
        m.addSource('boundary', { type: 'geojson', data: boundaryGeoJson(boundary) as never });
        m.addLayer({
          id: 'boundary',
          type: 'line',
          source: 'boundary',
          layout: { 'line-join': 'round', 'line-cap': 'round' },
          paint: { 'line-color': boundary.color ?? DEFAULT_BOUNDARY_COLOR, 'line-width': 4 },
        });
        m.once('idle', () => {
          clearTimeout(timer);
          resolve();
        });
      });
    });

    // Kaart naar een gewone canvas, met de bronvermelding erop.
    const src = m.getCanvas();
    const out = document.createElement('canvas');
    out.width = src.width;
    out.height = src.height;
    const ctx = out.getContext('2d');
    if (!ctx) throw new Error('Geen canvas beschikbaar.');
    ctx.drawImage(src, 0, 0);
    if (attribution) {
      const size = 11 * PIXEL_RATIO;
      ctx.font = `${size}px system-ui, sans-serif`;
      const pad = 4 * PIXEL_RATIO;
      const w = ctx.measureText(attribution).width + pad * 2;
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      ctx.fillRect(out.width - w, out.height - size - pad * 2, w, size + pad * 2);
      ctx.fillStyle = '#333';
      ctx.textBaseline = 'bottom';
      ctx.fillText(attribution, out.width - w + pad, out.height - pad);
    }
    return await new Promise<Blob>((resolve, reject) =>
      out.toBlob((b) => (b ? resolve(b) : reject(new Error('Kaartje maken mislukt.'))), 'image/jpeg', 0.85),
    );
  } finally {
    map?.remove();
    holder.remove();
  }
}

/** Kaartstijl en bronvermelding zoals de app ze gebruikt. */
export function playfieldStyle(pkg: Pick<GamePackage, 'map'>): { styleUrl: string; attribution: string } {
  return {
    styleUrl: pkg.map?.styleUrl ?? DEFAULT_MAP_SOURCE.styleUrl,
    attribution: pkg.map?.attribution ?? DEFAULT_MAP_SOURCE.attribution ?? '',
  };
}

/**
 * Zorgt bij het publiceren voor het kaartje en zet het in het pakket. Bestaat
 * het kaartje voor deze grens en stijl al, dan wordt dat gebruikt. Lukt tekenen
 * niet (bijvoorbeeld buiten de browser), dan blijft het pakket zoals het was en
 * zien spelers de gewone foto.
 */
export async function withPlayfieldImage(
  db: SupabaseClient,
  gameId: string,
  pkg: GamePackage,
  load: () => Promise<typeof import('maplibre-gl')>,
): Promise<GamePackage> {
  if (!needsPlayfieldImage(pkg) || typeof document === 'undefined') return pkg;
  const boundary = pkg.boundary!;
  const { styleUrl, attribution } = playfieldStyle(pkg);
  const path = playfieldPath(gameId, boundary, styleUrl);
  const url = db.storage.from('media').getPublicUrl(path).data.publicUrl;
  try {
    const head = await fetch(url, { method: 'HEAD', cache: 'no-store' }).catch(() => null);
    if (!head?.ok) {
      const blob = await renderPlayfieldImage(await load(), boundary, styleUrl, attribution);
      const up = await db.storage.from('media').upload(path, blob, { contentType: 'image/jpeg', upsert: true });
      if (up.error) throw new Error(up.error.message);
    }
    return applyPlayfieldImage(pkg, url);
  } catch (err) {
    console.warn('Kaartje van het speelveld niet gemaakt:', err);
    return pkg;
  }
}
