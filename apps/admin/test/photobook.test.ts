import { describe, expect, it } from 'vitest';
import {
  bookText,
  defaultItems,
  coverCrop,
  huntStats,
  zipEntryNames,
  displayUrl,
  href,
  parseLinks,
  gameCaption,
  mailBody,
  moveItem,
  paginate,
  parseItems,
  pdfFileName,
  slots,
  unusedGamePhotos,
  wrapText,
} from '../src/lib/photobook.js';
import type { PhotoRow } from '../src/lib/results.js';

const photo = (id: string, team: string, task: string, at: string): PhotoRow => ({
  id,
  team_id: team,
  task_key: task,
  path: `${team}/${task}/${id}.jpg`,
  created_at: `2026-11-21T${at}:00Z`,
});

const photos = [
  photo('1', 'wolven', 'fotomissie', '13:40'),
  photo('2', 'vossen', 'fotomissie', '13:35'),
  photo('3', 'vossen', '_teamfoto', '12:55'),
  photo('4', 'wolven', '_teamfoto', '12:58'),
  photo('5', 'vossen', 'brug', '13:10'),
];

describe('fotoboek', () => {
  it('zet eerst de teamfoto\'s in volgorde van de ranglijst, dan de opdrachtfoto\'s en de vaste foto\'s', () => {
    const items = defaultItems(
      photos,
      ['vossen', 'wolven'],
      (p) => gameCaption(p, p.team_id, p.task_key === '_teamfoto' ? '' : 'Opdracht'),
      ['huisstijl/org/a.jpg'],
    );
    expect(items.map((i) => i.path)).toEqual([
      'vossen/_teamfoto/3.jpg',
      'wolven/_teamfoto/4.jpg',
      'vossen/brug/5.jpg',
      'vossen/fotomissie/2.jpg',
      'wolven/fotomissie/1.jpg',
      'huisstijl/org/a.jpg',
    ]);
    expect(items[0]).toEqual({ source: 'game', path: 'vossen/_teamfoto/3.jpg', caption: 'vossen' });
    expect(items[2]).toEqual({ source: 'game', path: 'vossen/brug/5.jpg', caption: 'vossen · Opdracht' });
    expect(items[5]).toEqual({ source: 'stock', path: 'huisstijl/org/a.jpg', caption: '' });
  });

  it('toont foto\'s die nog niet in het boek staan', () => {
    const items = [{ source: 'game' as const, path: 'vossen/brug/5.jpg', caption: '' }, { source: 'own' as const, path: 'wolven/fotomissie/1.jpg', caption: '' }];
    expect(unusedGamePhotos(items, photos).map((p) => p.id)).toEqual(['1', '2', '3', '4']);
  });

  it('verplaatst een foto', () => {
    expect(moveItem(['a', 'b', 'c', 'd'], 0, 2)).toEqual(['b', 'c', 'a', 'd']);
    expect(moveItem(['a', 'b', 'c'], 2, 0)).toEqual(['c', 'a', 'b']);
    expect(moveItem(['a', 'b'], 1, 9)).toEqual(['a', 'b']);
    expect(moveItem(['a', 'b'], 5, 0)).toEqual(['a', 'b']);
  });

  it('leest alleen geldige items uit de database', () => {
    expect(
      parseItems([
        { source: 'game', path: 'a.jpg', caption: 'A', large: true },
        { source: 'own', path: 'b.jpg' },
        { source: 'stock', path: 'c.jpg', caption: 'C' },
        { source: 'elders', path: 'c.jpg' },
        { source: 'game', path: '' },
        null,
      ]),
    ).toEqual([
      { source: 'game', path: 'a.jpg', caption: 'A', large: true },
      { source: 'own', path: 'b.jpg', caption: '' },
      { source: 'stock', path: 'c.jpg', caption: 'C' },
    ]);
    expect(parseItems('kapot')).toEqual([]);
  });

  it('verdeelt de foto\'s over pagina\'s', () => {
    const n = (count: number, large = false) => Array.from({ length: count }, () => ({ large }));
    const sizes = (items: { large?: boolean }[]) => paginate(items).map((p) => p.length);
    expect(sizes(n(4))).toEqual([4]);
    expect(sizes(n(5))).toEqual([3, 2]);
    expect(sizes(n(9))).toEqual([4, 3, 2]);
    expect(sizes(n(6))).toEqual([4, 2]);
    expect(sizes([...n(2), { large: true }, ...n(1)])).toEqual([2, 1, 1]);
    expect(sizes([])).toEqual([]);
  });

  it('maakt vakken voor 1 tot 4 foto\'s die binnen het vlak blijven', () => {
    const area = { x: 10, y: 20, w: 400, h: 300 };
    for (const count of [1, 2, 3, 4]) {
      const boxes = slots(count, area, 10);
      expect(boxes).toHaveLength(count);
      for (const b of boxes) {
        expect(b.x).toBeGreaterThanOrEqual(area.x);
        expect(b.y).toBeGreaterThanOrEqual(area.y);
        expect(b.x + b.w).toBeLessThanOrEqual(area.x + area.w + 1e-9);
        expect(b.y + b.h).toBeLessThanOrEqual(area.y + area.h + 1e-9);
      }
    }
    // Leesvolgorde: bij vier eerst de bovenste rij (in een PDF is y omhoog).
    const [a, b, c] = slots(4, area, 10);
    expect(a!.y).toBeGreaterThan(c!.y);
    expect(b!.x).toBeGreaterThan(a!.x);
  });

  it('legt twee foto\'s op een staande pagina boven elkaar', () => {
    const [a, b] = slots(2, { x: 0, y: 0, w: 500, h: 700 }, 10);
    expect(a).toEqual({ x: 0, y: 355, w: 500, h: 345 });
    expect(b).toEqual({ x: 0, y: 0, w: 500, h: 345 });
  });

  it('snijdt een foto bij om een vak te vullen', () => {
    expect(coverCrop(4000, 3000, 100, 100)).toEqual({ sx: 500, sy: 0, sw: 3000, sh: 3000 });
    const tall = coverCrop(3000, 4000, 200, 100);
    expect(tall.sw).toBe(3000);
    expect(tall.sh).toBe(1500);
    expect(tall.sy).toBeCloseTo(2500 * 0.35);
  });

  it('rekent de cijfers van de hunt uit zoals het huidige fotoboek', () => {
    const s = huntStats([
      { name: 'Rent chasers', distanceM: 2000 },
      { name: 'Hunters', distanceM: 4400 },
      { name: 'Niet gestart', distanceM: 0 },
      { name: 'Geen gps', distanceM: null },
    ]);
    expect(s.teams.map((x) => x.name)).toEqual(['Hunters', 'Rent chasers']);
    expect(s.teams[0]).toMatchObject({ km: 4.4, stepsPP: 5940, kcalPP: 242 });
    expect(s.teams[0]!.co2Kg).toBeCloseTo(0.792);
    expect(s.totalKm).toBeCloseTo(6.4);
    expect(s.avgKm).toBeCloseTo(3.2);
    expect(s.avgStepsPP).toBe(Math.round((5940 + 2700) / 2));
    expect(s.totalCo2Kg).toBeCloseTo(1.152);
    expect(huntStats([]).avgKm).toBe(0);
  });

  it('maakt links klikbaar', () => {
    expect(href('url', 'escapegamethehunt.nl/werken-bij')).toBe('https://escapegamethehunt.nl/werken-bij');
    expect(href('url', 'http://x.nl')).toBe('http://x.nl');
    expect(href('email', 'info@x.nl')).toBe('mailto:info@x.nl');
    expect(href('phone', '085 004 77 19')).toBe('tel:0850047719');
    expect(displayUrl('https://www.escapegamethehunt.nl/')).toBe('escapegamethehunt.nl');
    expect(parseLinks({ video: ' https://v ', onbekend: 'x', email: '' })).toEqual({ video: 'https://v' });
  });

  it('geeft de foto\'s in de zip nette, unieke namen', () => {
    expect(zipEntryNames([{ caption: 'Vossen' }, { caption: '' }, { caption: 'Vossen · Brug!' }])).toEqual([
      '01-vossen.jpg',
      '02.jpg',
      '03-vossen-brug.jpg',
    ]);
  });

  it('breekt tekst af op woorden', () => {
    const measure = (s: string) => s.length;
    expect(wrapText('een twee drie vier', 9, measure)).toEqual(['een twee', 'drie vier']);
    expect(wrapText('a\n\nb', 10, measure)).toEqual(['a', '', 'b']);
    expect(wrapText('superlangwoord', 4, measure)).toEqual(['superlangwoord']);
  });

  it('maakt een nette bestandsnaam', () => {
    expect(pdfFileName('Bedrijfsuitje Acmé – Leeuwarden!')).toBe('fotoboek-bedrijfsuitje-acme-leeuwarden.pdf');
    expect(pdfFileName('')).toBe('fotoboek.pdf');
  });

  it('teksten in de taal van het fotoboek', () => {
    expect(bookText('en', 'yourPhotos')).toBe('Your photos');
    expect(bookText('xx', 'yourPhotos')).toBe("Jullie foto's");
    expect(bookText('nl', 'totalKm', { n: 5 })).toBe('samen gelopen door 5 teams');
    const mail = mailBody('nl', 'Uitje', 'https://x/fotoboek/abc', 'ABCD-EFGH-JKLM', '2026-12-16T12:00:00Z');
    expect(mail.subject).toBe('Jullie fotoboek: Uitje');
    expect(mail.body).toContain('https://x/fotoboek/abc\nWachtwoord: ABCD-EFGH-JKLM');
    expect(mail.body).toContain('16 december 2026');
    expect(mailBody('de', 'Ausflug', 'L', 'P', null).subject).toContain('Ausflug');
  });
});
