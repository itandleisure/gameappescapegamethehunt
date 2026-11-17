import type { LatLng, MapOverlay } from '@hunt/engine';
import type { LayerRows } from './game-model';

/** Spelvelden op de kaartpagina voor overlay en verzamelpunt. */
export type MapGameField = 'mapOverlay' | 'meetingPoint';

/**
 * Mag deze laag het veld aanpassen? Het basisspel altijd; een stad of klant
 * alleen als het basisspel het veld voor die laag aanpasbaar maakt.
 */
export function gameFieldEditable(chain: LayerRows[], field: MapGameField): boolean {
  const base = chain[0]!;
  const layer = chain[chain.length - 1]!.game.layer;
  if (layer === 'base') return true;
  return base.overridable.some((o) => o.task_id === null && o.field === field && o.layers.includes(layer));
}

/** Komt de waarde uit deze laag zelf (en niet uit een laag erboven)? */
export function ownGameField(chain: LayerRows[], field: MapGameField): boolean {
  const self = chain[chain.length - 1]!;
  if (self.game.layer === 'base') return field in (self.game.settings ?? {});
  return self.overrides.some((o) => o.task_id === null && o.field === field);
}

const EXTENSIONS: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };

/** Toegestane afbeeldingen voor een overlay. */
export function overlayExtension(type: string): string | null {
  return EXTENSIONS[type] ?? null;
}

/** Opslagpad in de bucket media: altijd in de map van het spel. */
export function overlayPath(gameId: string, type: string, now = Date.now()): string {
  const ext = overlayExtension(type);
  if (!ext) throw new Error('Gebruik een PNG-, JPG- of WebP-afbeelding.');
  return `${gameId}/overlay-${now}.${ext}`;
}

const M_PER_DEG_LAT = 111_320;

/**
 * Eerste plaatsing van een nieuwe overlay: gecentreerd rond `center`,
 * `widthMeters` breed en met de verhouding van de afbeelding.
 */
export function initialBounds(center: LatLng, width: number, height: number, widthMeters: number): MapOverlay['bounds'] {
  const heightMeters = widthMeters * (height / width);
  const dLat = heightMeters / 2 / M_PER_DEG_LAT;
  const dLng = widthMeters / 2 / (M_PER_DEG_LAT * Math.cos((center.lat * Math.PI) / 180));
  return [
    { lat: round(center.lat + dLat), lng: round(center.lng - dLng) },
    { lat: round(center.lat - dLat), lng: round(center.lng + dLng) },
  ];
}

/** Hoekpunten voor een MapLibre-afbeeldingsbron: NW, NO, ZO, ZW. */
export function imageCorners([nw, se]: MapOverlay['bounds']): [[number, number], [number, number], [number, number], [number, number]] {
  return [
    [nw.lng, nw.lat],
    [se.lng, nw.lat],
    [se.lng, se.lat],
    [nw.lng, se.lat],
  ];
}

/**
 * Nieuwe hoekpunten na het slepen van één hoek. Houdt NW echt noordwest van
 * ZO, ook als iemand een hoek voorbij de andere sleept.
 */
export function moveCorner(bounds: MapOverlay['bounds'], corner: 'nw' | 'se', to: LatLng): MapOverlay['bounds'] {
  const [nw, se] = bounds;
  const a = corner === 'nw' ? to : nw;
  const b = corner === 'se' ? to : se;
  return [
    { lat: round(Math.max(a.lat, b.lat)), lng: round(Math.min(a.lng, b.lng)) },
    { lat: round(Math.min(a.lat, b.lat)), lng: round(Math.max(a.lng, b.lng)) },
  ];
}

/** De hele overlay verschuiven (bijvoorbeeld naar het midden van de kaart). */
export function centerBounds(bounds: MapOverlay['bounds'], center: LatLng): MapOverlay['bounds'] {
  const [nw, se] = bounds;
  const dLat = center.lat - (nw.lat + se.lat) / 2;
  const dLng = center.lng - (nw.lng + se.lng) / 2;
  return [
    { lat: round(nw.lat + dLat), lng: round(nw.lng + dLng) },
    { lat: round(se.lat + dLat), lng: round(se.lng + dLng) },
  ];
}

function round(n: number) {
  return Math.round(n * 1e6) / 1e6;
}
