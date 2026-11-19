import { describe, expect, it } from 'vitest';
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
    expect(p?.hints).toEqual(slots[0]!.hints);
  });
});
