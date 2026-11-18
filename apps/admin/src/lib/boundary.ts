import { curvePoint, type BoundaryPoint, type LatLng } from '@hunt/engine';

const M_PER_DEG_LAT = 111_320;

/** Afstand in meters (vlakke benadering, ruim genoeg voor een speelveld). */
function meters(a: LatLng, b: LatLng): number {
  const dy = (a.lat - b.lat) * M_PER_DEG_LAT;
  const dx = (a.lng - b.lng) * M_PER_DEG_LAT * Math.cos((((a.lat + b.lat) / 2) * Math.PI) / 180);
  return Math.hypot(dx, dy);
}

function round(n: number) {
  return Math.round(n * 1e6) / 1e6;
}

const rounded = (p: LatLng): LatLng => ({ lat: round(p.lat), lng: round(p.lng) });

/**
 * Nieuw punt in de grens. Het komt op de zijde waar de lijn er het minst door
 * verlengt, zodat klikken naast een zijde die zijde een knik geeft in plaats
 * van een kruisende lijn. Met minder dan 3 punten komt het achteraan.
 */
export function insertPoint(points: BoundaryPoint[], p: LatLng): BoundaryPoint[] {
  const point = rounded(p);
  if (points.length < 3) return [...points, point];
  let best = points.length;
  let bestCost = Infinity;
  for (let i = 0; i < points.length; i++) {
    const a = points[i]!;
    const b = points[(i + 1) % points.length]!;
    const cost = meters(a, point) + meters(point, b) - meters(a, b);
    if (cost < bestCost) {
      bestCost = cost;
      best = i + 1;
    }
  }
  // De zijde waar het punt op komt, wordt weer recht.
  const before = points.map((q, i) => (i === best - 1 ? straight(q) : q));
  return [...before.slice(0, best), point, ...before.slice(best)];
}

export function movePoint(points: BoundaryPoint[], index: number, p: LatLng): BoundaryPoint[] {
  return points.map((q, i) => (i === index ? { ...q, ...rounded(p) } : q));
}

export function removePoint(points: BoundaryPoint[], index: number): BoundaryPoint[] {
  return points.filter((_, i) => i !== index);
}

function straight(p: BoundaryPoint): BoundaryPoint {
  const { curve: _c, ...rest } = p;
  return rest;
}

/** Handvat midden op de zijde van punt `index` naar het volgende: daar sleep je een bocht in. */
export function segmentHandle(points: BoundaryPoint[], index: number): LatLng {
  const a = points[index]!;
  const b = points[(index + 1) % points.length]!;
  return a.curve ? curvePoint(a, a.curve, b, 0.5) : { lat: (a.lat + b.lat) / 2, lng: (a.lng + b.lng) / 2 };
}

/**
 * Maakt van een zijde een bocht die door `through` loopt (het gesleepte
 * handvat): het stuurpunt ligt dan op 2·through − (a+b)/2.
 */
export function bendSegment(points: BoundaryPoint[], index: number, through: LatLng): BoundaryPoint[] {
  const a = points[index]!;
  const b = points[(index + 1) % points.length]!;
  const curve = rounded({ lat: 2 * through.lat - (a.lat + b.lat) / 2, lng: 2 * through.lng - (a.lng + b.lng) / 2 });
  return points.map((q, i) => (i === index ? { ...q, curve } : q));
}

/** Zijde weer recht maken. */
export function straightenSegment(points: BoundaryPoint[], index: number): BoundaryPoint[] {
  return points.map((q, i) => (i === index ? straight(q) : q));
}

/** Rechthoek om alle locaties met wat marge: een snel begin voor de grens. */
export function rectAround(locations: LatLng[], marginMeters = 75): LatLng[] {
  if (locations.length === 0) return [];
  const lats = locations.map((l) => l.lat);
  const lngs = locations.map((l) => l.lng);
  const north = Math.max(...lats);
  const south = Math.min(...lats);
  const dLat = marginMeters / M_PER_DEG_LAT;
  const dLng = marginMeters / (M_PER_DEG_LAT * Math.cos((((north + south) / 2) * Math.PI) / 180));
  const w = Math.min(...lngs) - dLng;
  const e = Math.max(...lngs) + dLng;
  const n = north + dLat;
  const s = south - dLat;
  return [
    { lat: n, lng: w },
    { lat: n, lng: e },
    { lat: s, lng: e },
    { lat: s, lng: w },
  ].map(rounded);
}

export { boundaryGeoJson } from '@hunt/engine';
