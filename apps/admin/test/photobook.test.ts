import { describe, expect, it } from 'vitest';
import {
  bookText,
  defaultItems,
  fit,
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
  it('zet de foto\'s per team in volgorde van de ranglijst, teamfoto eerst en groot', () => {
    const items = defaultItems(photos, ['vossen', 'wolven'], (p) => gameCaption(p, p.team_id, p.task_key === '_teamfoto' ? '' : 'Opdracht'));
    expect(items.map((i) => i.path)).toEqual([
      'vossen/_teamfoto/3.jpg',
      'vossen/brug/5.jpg',
      'vossen/fotomissie/2.jpg',
      'wolven/_teamfoto/4.jpg',
      'wolven/fotomissie/1.jpg',
    ]);
    expect(items[0]).toMatchObject({ source: 'game', caption: 'vossen', large: true });
    expect(items[1]).toEqual({ source: 'game', path: 'vossen/brug/5.jpg', caption: 'vossen · Opdracht' });
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
        { source: 'elders', path: 'c.jpg' },
        { source: 'game', path: '' },
        null,
      ]),
    ).toEqual([
      { source: 'game', path: 'a.jpg', caption: 'A', large: true },
      { source: 'own', path: 'b.jpg', caption: '' },
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

  it('past een foto in een vak zonder bij te snijden', () => {
    expect(fit(4000, 3000, { x: 0, y: 0, w: 200, h: 200 })).toEqual({ x: 0, y: 25, w: 200, h: 150 });
    expect(fit(1000, 2000, { x: 0, y: 0, w: 200, h: 200 })).toEqual({ x: 50, y: 0, w: 100, h: 200 });
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
    expect(bookText('en', 'ranking')).toBe('Leaderboard');
    expect(bookText('xx', 'ranking')).toBe('Ranglijst');
    expect(bookText('nl', 'page', { n: 3 })).toBe('Pagina 3');
    const mail = mailBody('nl', 'Uitje', 'https://x/fotoboek/abc');
    expect(mail.subject).toBe('Jullie fotoboek: Uitje');
    expect(mail.body).toContain('https://x/fotoboek/abc');
    expect(mailBody('de', 'Ausflug', 'L').subject).toContain('Ausflug');
  });
});
