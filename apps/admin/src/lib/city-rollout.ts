/**
 * Een nieuwe stad uitrollen vanuit een versie van het basisspel.
 *
 * De stad krijgt alle opdrachtlocaties (iconen) uit die versie, maar dan in
 * het centrum van de nieuwe stad. Daarna verschuift het team ze naar de echte
 * plekken. Zo staan ze meteen op de goede kaart en is er niets vergeten.
 */
import type { LatLng } from '@hunt/engine';
import type { LayerRows, LocationRow, OverrideRow } from './game-model';
import { tKey } from './i18n';

export interface Place {
  /** Landcode, bijvoorbeeld NL. */
  country: string;
  name: string;
  lat: number;
  lng: number;
}

// ---------------------------------------------------------------------------
// Landen en steden
// ---------------------------------------------------------------------------

/** De Europese landen in de keuzelijst (zelfde lijst als scripts/europe-cities.mjs). */
export const EUROPE = [
  'AD', 'AL', 'AT', 'BA', 'BE', 'BG', 'BY', 'CH', 'CY', 'CZ', 'DE', 'DK', 'EE', 'ES', 'FI', 'FR', 'GB', 'GR',
  'HR', 'HU', 'IE', 'IS', 'IT', 'LI', 'LT', 'LU', 'LV', 'MC', 'MD', 'ME', 'MK', 'MT', 'NL', 'NO', 'PL', 'PT',
  'RO', 'RS', 'RU', 'SE', 'SI', 'SK', 'SM', 'UA', 'VA', 'XK',
] as const;

/** Per land: [naam, lat, lng]. */
export type CityList = Record<string, [string, number, number][]>;

/** Landen op naam in de taal van de beheerapp. */
export function countryOptions(locale: string): { code: string; name: string }[] {
  let names: Intl.DisplayNames | null = null;
  try {
    names = new Intl.DisplayNames([locale], { type: 'region' });
  } catch {
    names = null;
  }
  return EUROPE.map((code) => ({ code, name: names?.of(code) ?? code })).sort((a, b) => a.name.localeCompare(b.name, locale));
}

/** Zoekt een plaats in de keuzelijst van het land (hoofdletters en accenten maken niet uit). */
export function findCity(cities: CityList, country: string, name: string): Place | null {
  const want = fold(name);
  if (!want) return null;
  const hit = (cities[country] ?? []).find(([n]) => fold(n) === want);
  return hit ? { country, name: hit[0], lat: hit[1], lng: hit[2] } : null;
}

const fold = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase();

/**
 * Een plaats die niet in de lijst staat, opzoeken bij OpenStreetMap
 * (Nominatim), alleen binnen het gekozen land.
 */
export async function geocode(name: string, country: string, lang: string): Promise<Place | null> {
  const url = new URL('https://nominatim.openstreetmap.org/search');
  url.search = new URLSearchParams({
    q: name.trim(),
    countrycodes: country.toLowerCase(),
    format: 'jsonv2',
    limit: '1',
    'accept-language': lang,
  }).toString();
  const res = await fetch(url);
  if (!res.ok) throw new Error(`OpenStreetMap: ${res.status}`);
  const list = (await res.json()) as { lat: string; lon: string; name?: string; display_name?: string }[];
  const first = list[0];
  if (!first) return null;
  return { country, name: name.trim(), lat: round(Number(first.lat)), lng: round(Number(first.lon)) };
}

// ---------------------------------------------------------------------------
// Naam en sleutel
// ---------------------------------------------------------------------------

/** Spelnaam per taal: naam van het basisspel plus de stad, bijvoorbeeld "Escape Game The Hunt Hoorn". */
export function cityGameName(baseName: Record<string, string>, languages: string[], city: string): Record<string, string> {
  const fallback = Object.values(baseName)[0] ?? '';
  const out: Record<string, string> = {};
  for (const lang of languages) out[lang] = `${baseName[lang] || fallback} ${city.trim()}`.trim();
  return out;
}

/** Sleutel (slug) voor de nieuwe stad die nog niet bestaat, bijvoorbeeld "the-hunt-hoorn" of "the-hunt-hoorn-2". */
export function citySlug(baseSlug: string, city: string, taken: Iterable<string>): string {
  const part = city
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  const root = `${baseSlug}-${part || 'stad'}`.slice(0, 60).replace(/-+$/, '');
  const used = new Set(taken);
  if (!used.has(root)) return root;
  for (let n = 2; ; n++) if (!used.has(`${root}-${n}`)) return `${root}-${n}`;
}

// ---------------------------------------------------------------------------
// Iconen in het centrum
// ---------------------------------------------------------------------------

const M_PER_DEG_LAT = 111_320;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

/**
 * `n` punten rond het centrum, in een kleine spiraal met zo'n `spacing` meter
 * ertussen. Zo liggen de iconen niet allemaal precies op elkaar en is elk
 * icoon apart te pakken en te verslepen.
 */
export function spreadAround(center: LatLng, n: number, spacing = 15): LatLng[] {
  const out: LatLng[] = [];
  for (let i = 0; i < n; i++) {
    const r = i === 0 ? 0 : spacing * Math.sqrt(i);
    const a = i * GOLDEN_ANGLE;
    const dLat = (r * Math.cos(a)) / M_PER_DEG_LAT;
    const dLng = (r * Math.sin(a)) / (M_PER_DEG_LAT * Math.cos((center.lat * Math.PI) / 180));
    out.push({ lat: round(center.lat + dLat), lng: round(center.lng + dLng) });
  }
  return out;
}

/**
 * Alle opdrachtlocaties uit de versie van het basisspel (ook per track), in
 * het centrum van de nieuwe stad, met dezelfde straal. Opdrachten die nu niet
 * meer in het basisspel staan, worden overgeslagen.
 */
export function centredLocations(version: LayerRows, center: LatLng, existingTaskIds: Set<string>): LocationRow[] {
  const order = new Map(version.tasks.map((t) => [t.id, t.position]));
  const list = version.locations
    .filter((l) => existingTaskIds.has(l.task_id))
    .sort((a, b) => (order.get(a.task_id) ?? 0) - (order.get(b.task_id) ?? 0) || (a.track ?? 0) - (b.track ?? 0));
  const points = spreadAround(center, list.length);
  return list.map((l, i) => ({ task_id: l.task_id, track: l.track, radius: l.radius, ...points[i]! }));
}

/**
 * Het verzamelpunt in het centrum, met de tekst van het basisspel. Alleen als
 * een stad het verzamelpunt mag aanpassen.
 */
export function centredMeetingPoint(version: LayerRows, center: LatLng): OverrideRow | null {
  const allowed = version.overridable.some((o) => o.task_id === null && o.field === 'meetingPoint' && o.layers.includes('city'));
  if (!allowed) return null;
  const text: Record<string, string> = {};
  for (const r of version.translations) {
    if (r.entity === 'game' && r.entity_id === '' && r.field === 'meetingPoint') text[r.lang] = r.text;
  }
  return { task_id: null, field: 'meetingPoint', value: { lat: round(center.lat), lng: round(center.lng), text } };
}

// ---------------------------------------------------------------------------
// Nog te doen per nieuwe stad
// ---------------------------------------------------------------------------

export type TodoKey = 'overlay' | 'pins' | 'questions' | 'test';

export const CITY_TODOS: { key: TodoKey; label: string; link: 'overlay' | 'kaart' | 'opdrachten' | null }[] = [
  { key: 'overlay', label: tKey('Overlay (kaarttekening) van de stad laten maken en plaatsen'), link: 'overlay' },
  { key: 'pins', label: tKey('Iconen vanuit het centrum naar de juiste plek slepen, ook start- en verzamelpunt'), link: 'kaart' },
  { key: 'questions', label: tKey('Stadsvragen schrijven'), link: 'opdrachten' },
  { key: 'test', label: tKey('Proefronde lopen en de stad publiceren'), link: null },
];

/** De lijst zoals die bij een stad in settings.todo staat (true = klaar). */
export type TodoState = Partial<Record<TodoKey, boolean>>;

export function todoState(settings: Record<string, unknown> | null | undefined): TodoState | null {
  const value = settings?.todo;
  return value && typeof value === 'object' ? (value as TodoState) : null;
}

/** Hoeveel punten nog open staan, of null als de stad geen lijst heeft (bijvoorbeeld een oude stad). */
export function openTodos(settings: Record<string, unknown> | null | undefined): number | null {
  const state = todoState(settings);
  if (!state) return null;
  return CITY_TODOS.filter((td) => !state[td.key]).length;
}

/** Een nieuwe lijst: alles nog open. */
export const newTodoState = (): TodoState => Object.fromEntries(CITY_TODOS.map((td) => [td.key, false]));

function round(n: number) {
  return Math.round(n * 1e6) / 1e6;
}
