import { describe, expect, it } from 'vitest';
import file from '../src/templates/escape-game-the-hunt-v1.json';
import { parseGameFile } from '../src/lib/game-import.js';
import type { GamePackage } from '@hunt/engine';
import { theHuntBase } from '../../../packages/engine/test/fixtures/the-hunt.js';
import { applyPuzzles, puzzleChoice, puzzleFromTask, puzzleSlots, type PuzzleRow } from '../src/lib/puzzles.js';

const game = { ...theHuntBase, version: 0 };
const ID = '11111111-2222-3333-4444-555555555555';
const intl: PuzzleRow = {
  id: ID,
  name: 'Morsecode (internationaal)',
  title: { nl: 'Morsecode', en: 'Morse code' },
  body: {},
  correct_comment: {},
  wrong_comment: {},
  answer: { type: 'number', value: 42 },
  hints: [{ cost: 25, text: { en: 'Listen closely' } }],
  image: null,
};

describe('fysieke puzzels', () => {
  const slots = puzzleSlots(game);

  it('heeft zes puzzelplekken', () => {
    expect(slots).toHaveLength(6);
  });

  it('leest de keuze per plek; oude waarden tellen als geen keuze', () => {
    const choice = puzzleChoice({ puzzles: { [slots[0]!.id]: ID, [slots[1]!.id]: 'int', [slots[2]!.id]: false } }, game);
    expect(choice[slots[0]!.id]).toBe(ID);
    expect(choice[slots[1]!.id]).toBeNull();
    expect(choice[slots[2]!.id]).toBeNull();
  });

  it('zet de gekozen puzzel op de plek en laat de rest staan', () => {
    const slot = slots[1]!;
    const out = applyPuzzles(game, { [slot.id]: ID }, [intl]);
    const task = out.tasks.find((t) => t.id === slot.id)!;
    expect(task.answer).toEqual({ type: 'number', value: 42 });
    expect(task.hints).toHaveLength(1);
    expect(task.title).toEqual({ nl: 'Morsecode', en: 'Morse code' });
    // Lege teksten nemen die van de plek over; tags en punten blijven.
    expect(task.body).toEqual(slot.body);
    expect(task.tags).toEqual(slot.tags);
    expect(task.points).toBe(slot.points);
    expect(out.tasks.find((t) => t.id === slots[0]!.id)).toEqual(slots[0]);
  });

  it('negeert een puzzel die niet meer bestaat', () => {
    expect(applyPuzzles(game, { [slots[0]!.id]: ID }, [])).toEqual(game);
  });

  it('maakt een puzzel van een opdracht uit het template', () => {
    const p = puzzleFromTask(slots[0]!, 'Tangram');
    expect(p?.answer).toEqual(slots[0]!.answer);
    expect(p?.hints.map((h) => h.cost)).toEqual(slots[0]!.hints.map((h) => h.cost));
    // Alleen Nederlands: de fysieke puzzels zijn er in het Nederlands.
    expect(p?.title).toEqual({ nl: 'Tangram' });
    expect(p?.hints.every((h) => Object.keys(h.text).every((k) => k === 'nl'))).toBe(true);
  });
});

describe('naam van de gekozen puzzel in de teksten', () => {
  const parsed = parseGameFile(JSON.stringify(file));
  if (!parsed.ok) throw new Error('template niet in te lezen');
  const base = { ...parsed.bundle.base, version: 0 } as GamePackage;
  const sudoku: PuzzleRow = { ...intl, name: 'Sudoku', title: { nl: 'Sudoku', en: 'Sudoku' } };
  const out = applyPuzzles(base, { 'puzzel-tangram': ID }, [sudoku]);
  const message = (g: GamePackage, id: string) => {
    const a = g.rules.find((r) => r.id === id)!.then.find((x) => x.kind === 'message');
    return a && a.kind === 'message' ? a.text.nl! : '';
  };

  it('zet de nieuwe naam in het tijdlijnbericht van die plek', () => {
    expect(message(out, 'tijdlijn-10')).toContain('het antwoord op de Sudoku-puzzel invoeren');
    expect(message(out, 'tijdlijn-10')).not.toMatch(/tangram/i);
  });

  it('past de uitleg aan die de eerste puzzel noemt', () => {
    const intro = out.tasks.find((t) => t.body?.nl?.includes('eerste puzzel die vrijgegeven'))!;
    expect(intro.body!.nl).toContain('is de Sudoku puzzel');
  });

  it('laat de berichten van andere plekken staan', () => {
    expect(message(out, 'tijdlijn-20')).toBe(message(base, 'tijdlijn-20'));
  });

  it('verandert niets zonder keuze', () => {
    expect(applyPuzzles(base, {}, [sudoku])).toEqual(base);
  });
});

describe('foto\'s bij puzzels', () => {
  const slots = puzzleSlots(game);

  it('neemt de foto\'s van de hints en de opdracht mee uit het template', () => {
    const task = { ...slots[0]!, image: 'https://x/p.jpg', hints: [{ cost: 25, text: {}, image: 'https://x/h1.jpg' }] };
    const p = puzzleFromTask(task, 'Tangram')!;
    expect(p.image).toBe('https://x/p.jpg');
    expect(p.hints[0]!.image).toBe('https://x/h1.jpg');
  });

  it('zet de foto van de puzzel op de plek; leeg = die van de plek', () => {
    const slot = { ...slots[1]!, image: 'https://x/plek.jpg' };
    const g = { ...game, tasks: game.tasks.map((t) => (t.id === slot.id ? slot : t)) };
    expect(applyPuzzles(g, { [slot.id]: ID }, [{ ...intl, image: 'https://x/nieuw.jpg' }]).tasks.find((t) => t.id === slot.id)!.image).toBe('https://x/nieuw.jpg');
    expect(applyPuzzles(g, { [slot.id]: ID }, [intl]).tasks.find((t) => t.id === slot.id)!.image).toBe('https://x/plek.jpg');
  });
});
