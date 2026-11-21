import { describe, expect, it } from 'vitest';
import { type BaseGame, CompositionError, composeGame, missingTranslations, validateGame } from '../src/layers.js';
import { t } from '../src/text.js';
import { amsterdam, leeuwarden, parteon, theHuntBase } from './fixtures/the-hunt.js';

const meta = { id: 'test', version: 1 };
const task = (pkg: ReturnType<typeof composeGame>, id: string) => pkg.tasks.find((x) => x.id === id)!;

describe('gelaagd gamemodel', () => {
  it('stad vult locaties en lokale vragen in; de rest komt uit het basisspel', () => {
    const lwd = composeGame(theHuntBase, [leeuwarden], meta);
    const ams = composeGame(theHuntBase, [amsterdam], meta);
    expect(task(lwd, 'lokaal-1').body.nl).toContain('Leeuwarden');
    expect(task(ams, 'lokaal-1').body.nl).toContain('Amsterdam');
    expect(task(lwd, 'puzzel-morse')).toEqual(task(ams, 'puzzel-morse'));
    expect(lwd.rules).toEqual(ams.rules);
  });

  it('een wijziging in het basisspel komt in alle steden', () => {
    const base: BaseGame = JSON.parse(JSON.stringify(theHuntBase));
    base.tasks.find((x) => x.id === 'puzzel-tangram')!.hints[0]!.text.nl = 'Betere hint';
    for (const city of [leeuwarden, amsterdam]) {
      expect(task(composeGame(base, [city], meta), 'puzzel-tangram').hints[0]!.text.nl).toBe('Betere hint');
    }
  });

  it('klantvariant Parteon past alleen de lokale vragen en morse-hints aan', () => {
    const pkg = composeGame(theHuntBase, [amsterdam, parteon], meta);
    expect(task(pkg, 'lokaal-1').body.nl).toBe('Wat is de duurzaamheidsambitie van Parteon?');
    // De klant vult alleen NL in: Engels is dan nog niet vertaald (geen oude stadsvraag)
    expect(task(pkg, 'lokaal-1').body.en).toBeUndefined();
    const hints = task(pkg, 'puzzel-morse').hints;
    expect(hints.map((h) => h.text.nl)).toEqual(['Parteon-hint 1', 'Parteon-hint 2', 'Parteon-hint 3']);
    expect(hints.map((h) => h.cost)).toEqual([25, 50, 75]);
  });

  it('weigert aanpassingen aan velden die niet aanpasbaar zijn', () => {
    const bad = {
      id: 'stiekem',
      layer: 'client' as const,
      name: { nl: 'Stiekem' },
      overrides: [
        { target: { task: 'puzzel-tangram', field: 'points' as const }, value: 1000 },
        { target: { task: 'start', field: 'location' as const }, value: { lat: 0, lng: 0, radius: 5 } },
      ],
    };
    expect(() => composeGame(theHuntBase, [leeuwarden, bad], meta)).toThrow(CompositionError);
    try {
      composeGame(theHuntBase, [leeuwarden, bad], meta);
    } catch (e) {
      expect((e as CompositionError).issues).toEqual([
        'stiekem: opdracht puzzel-tangram.points mag niet worden aangepast door een klant',
        'stiekem: opdracht start.location mag niet worden aangepast door een klant',
      ]);
    }
  });

  it('een stad kan de foto bij een opdracht vervangen als dat mag', () => {
    const base: BaseGame = JSON.parse(JSON.stringify(theHuntBase));
    base.tasks.find((x) => x.id === 'lokaal-1')!.image = 'https://example.org/basis.jpg';
    base.overridable.push({ target: { task: 'lokaal-1', field: 'image' }, layers: ['city'] });
    const city = { id: 'lwd', layer: 'city' as const, name: { nl: 'Lwd' }, overrides: [{ target: { task: 'lokaal-1', field: 'image' as const }, value: 'https://example.org/oldehove.jpg' }] };
    expect(task(composeGame(base, [], meta), 'lokaal-1').image).toBe('https://example.org/basis.jpg');
    expect(task(composeGame(base, [city], meta), 'lokaal-1').image).toBe('https://example.org/oldehove.jpg');
  });

  it('een foto moet een https-adres zijn', () => {
    const base: BaseGame = JSON.parse(JSON.stringify(theHuntBase));
    base.tasks[0]!.image = 'http://example.org/onveilig.jpg';
    expect(() => composeGame(base, [], meta)).toThrow(/foto moet een https-adres zijn/);
  });

  it('stadsvariant moet vóór de klantvariant komen', () => {
    expect(() => composeGame(theHuntBase, [parteon, amsterdam], meta)).toThrow(/staat na een klantvariant/);
  });

  it('het basisspel bevat geen dode verwijzingen', () => {
    expect(validateGame({ ...theHuntBase, version: 0 })).toEqual([]);
    const broken = { ...theHuntBase, version: 0, rules: [{ id: 'x', when: { kind: 'completed' as const, select: { task: 'bestaat-niet' } }, then: [{ kind: 'end' as const, ending: 'nee' }] }] };
    expect(validateGame(broken)).toEqual(['regel x: onbekende opdracht bestaat-niet', 'regel x: onbekend einde nee']);
  });

  it('Hunter in de buurt: een stad kiest een eigen afstand als dat mag, en die moet kloppen', () => {
    const base: BaseGame = JSON.parse(JSON.stringify(theHuntBase));
    base.hunterAlert = { radius: 100 };
    base.overridable.push({ target: { game: 'hunterAlert' }, layers: ['city'] });
    const city = { ...leeuwarden, overrides: [...leeuwarden.overrides, { target: { game: 'hunterAlert' as const }, value: { radius: 60 } }] };
    expect(composeGame(base, [city], meta).hunterAlert).toEqual({ radius: 60 });
    expect(composeGame(base, [leeuwarden], meta).hunterAlert).toEqual({ radius: 100 });
    expect(validateGame({ ...composeGame(base, [leeuwarden], meta), hunterAlert: { radius: 0 } })).toEqual([]);
    expect(validateGame({ ...composeGame(base, [leeuwarden], meta), hunterAlert: { radius: -5 } })).toEqual([
      'hunter in de buurt: afstand moet tussen 0 en 500 meter liggen',
    ]);
  });

  it('controleert de speelveldgrens', () => {
    const p = (lat: number, lng: number) => ({ lat, lng });
    const ok = { ...theHuntBase, version: 0, boundary: { points: [p(53.2, 5.79), p(53.21, 5.8), p(53.2, 5.81)] } };
    expect(validateGame(ok)).toEqual([]);
    expect(validateGame({ ...ok, boundary: { points: [p(53.2, 5.79), p(53.21, 5.8)] } })).toEqual(['speelveldgrens: minstens 3 punten nodig']);
    expect(validateGame({ ...ok, boundary: { ...ok.boundary, color: 'rood' } })).toEqual(['speelveldgrens: kleur moet #rrggbb zijn']);
  });
});

describe('vertalingen', () => {
  it('NL en EN zijn compleet voor Leeuwarden', () => {
    expect(missingTranslations(composeGame(theHuntBase, [leeuwarden], meta))).toEqual([]);
  });

  it('toont wat nog niet vertaald is', () => {
    const pkg = composeGame(theHuntBase, [amsterdam, parteon], meta);
    const missing = missingTranslations(pkg);
    expect(missing).toEqual([
      { where: 'opdracht puzzel-morse · hint 1', lang: 'en' },
      { where: 'opdracht puzzel-morse · hint 2', lang: 'en' },
      { where: 'opdracht puzzel-morse · hint 3', lang: 'en' },
      { where: 'opdracht lokaal-1 · tekst', lang: 'en' },
      { where: 'opdracht lokaal-2 · tekst', lang: 'en' },
    ]);
    expect(missingTranslations(pkg, ['nl'])).toEqual([]);
    expect(missingTranslations(pkg, ['nl', 'de']).filter((m) => m.lang === 'de').length).toBeGreaterThan(50);
  });

  it('valt terug op de standaardtaal', () => {
    expect(t({ nl: 'Hallo' }, 'en', 'nl')).toBe('Hallo');
    expect(t({ nl: 'Hallo', en: 'Hello' }, 'en', 'nl')).toBe('Hello');
  });
});

describe('kaartbron', () => {
  it('gebruikt standaard OpenStreetMap en kan per stad worden ingesteld', async () => {
    const { DEFAULT_MAP_SOURCE } = await import('../src/types.js');
    expect(DEFAULT_MAP_SOURCE.attribution).toContain('OpenStreetMap');
    const base: BaseGame = {
      ...JSON.parse(JSON.stringify(theHuntBase)),
      overridable: [...theHuntBase.overridable, { target: { game: 'map' }, layers: ['city'] }],
    };
    const own = { styleUrl: 'https://kaart.example.test/leeuwarden/style.json', attribution: '© OpenStreetMap-bijdragers' };
    const pkg = composeGame(base, [{ ...leeuwarden, overrides: [...leeuwarden.overrides, { target: { game: 'map' }, value: own }] }], meta);
    expect(pkg.map).toEqual(own);
  });
});
