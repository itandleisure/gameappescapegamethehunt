import { describe, expect, it } from 'vitest';
import { theHuntBase } from '../../../packages/engine/test/fixtures/the-hunt.js';
import cities from '../src/lib/europe-cities.json';
import {
  CITY_TODOS,
  EUROPE,
  centredLocations,
  centredMeetingPoint,
  cityGameName,
  citySlug,
  findCity,
  newTodoState,
  openTodos,
  setupHref,
  spreadAround,
  type CityList,
} from '../src/lib/city-rollout.js';
import { baseToRows } from '../src/lib/game-model.js';

const list = cities as unknown as CityList;
const base = baseToRows(theHuntBase, { id: 'base', slug: 'the-hunt' });
const center = { lat: 52.6425, lng: 5.0597 };
const metres = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) =>
  Math.hypot((a.lat - b.lat) * 111_320, (a.lng - b.lng) * 111_320 * Math.cos((a.lat * Math.PI) / 180));

describe('nieuwe stad uitrollen', () => {
  it('heeft steden voor elk Europees land', () => {
    for (const code of EUROPE) expect(list[code]?.length, code).toBeGreaterThan(0);
    expect(findCity(list, 'NL', 'hoorn')).toMatchObject({ name: 'Hoorn', country: 'NL' });
    expect(findCity(list, 'NL', 'den haag')?.lat).toBeCloseTo(52.08, 1);
    expect(findCity(list, 'DE', 'koln')?.name).toBe('Köln');
    expect(findCity(list, 'BE', 'Hoorn')).toBeNull();
  });

  it('zet elke opdrachtlocatie (ook per track) in het centrum, dicht bij elkaar maar niet op elkaar', () => {
    const ids = new Set(base.tasks.map((t) => t.id));
    const locs = centredLocations(base, center, ids);
    expect(locs.length).toBe(base.locations.length);
    expect(locs.length).toBeGreaterThan(3);
    for (const l of locs) expect(metres(l, center)).toBeLessThan(150);
    expect(new Set(locs.map((l) => `${l.lat},${l.lng}`)).size).toBe(locs.length);
    // Zelfde opdrachten, tracks en straal als in het basisspel.
    const key = (l: { task_id: string; track: number | null; radius: number }) => `${l.task_id}|${l.track}|${l.radius}`;
    expect(locs.map(key).sort()).toEqual(base.locations.map(key).sort());
  });

  it('slaat opdrachten over die niet meer in het basisspel staan', () => {
    const [first] = base.tasks;
    const ids = new Set(base.tasks.filter((t) => t !== first).map((t) => t.id));
    expect(centredLocations(base, center, ids).some((l) => l.task_id === first!.id)).toBe(false);
  });

  it('spreidt punten in een kleine spiraal', () => {
    const pts = spreadAround(center, 20);
    expect(pts[0]).toEqual(center);
    expect(Math.max(...pts.map((p) => metres(p, center)))).toBeLessThan(80);
  });

  it('zet het verzamelpunt alleen in het centrum als een stad het mag aanpassen', () => {
    const allowed = { ...base, overridable: [...base.overridable, { task_id: null, field: 'meetingPoint', layers: ['city' as const], label: null }] };
    const notAllowed = { ...base, overridable: base.overridable.filter((o) => !(o.task_id === null && o.field === 'meetingPoint')) };
    expect(centredMeetingPoint(notAllowed, center)).toBeNull();
    expect(centredMeetingPoint(allowed, center)).toMatchObject({ task_id: null, field: 'meetingPoint', value: { lat: center.lat, lng: center.lng } });
  });

  it('maakt naam en sleutel van de stad', () => {
    expect(cityGameName({ nl: 'Escape Game The Hunt', en: 'Escape Game The Hunt' }, ['nl', 'en'], ' Hoorn ')).toEqual({
      nl: 'Escape Game The Hunt Hoorn',
      en: 'Escape Game The Hunt Hoorn',
    });
    expect(cityGameName({ nl: 'De Jacht' }, ['nl', 'de'], 'Köln').de).toBe('De Jacht Köln');
    expect(citySlug('the-hunt', "'s-Hertogenbosch", [])).toBe('the-hunt-s-hertogenbosch');
    expect(citySlug('the-hunt', 'Kraków', ['the-hunt-krakow'])).toBe('the-hunt-krakow-2');
  });

  it('houdt bij wat nog moet gebeuren', () => {
    expect(openTodos({})).toBeNull();
    const todo = newTodoState();
    expect(openTodos({ todo })).toBe(CITY_TODOS.length);
    expect(openTodos({ todo: { ...todo, speelveld: true } })).toBe(CITY_TODOS.length - 1);
    expect(setupHref('g1', 'start')).toBe('/spellen/g1/inrichten?stap=3');
  });
});
