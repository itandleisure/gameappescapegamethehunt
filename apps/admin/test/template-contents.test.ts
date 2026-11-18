import { describe, expect, it } from 'vitest';
import { theHuntBase } from '../../../packages/engine/test/fixtures/the-hunt.js';
import { baseToRows } from '../src/lib/game-model.js';
import { versionContents } from '../src/lib/template-contents.js';

const v1 = baseToRows(theHuntBase, { id: 'base', slug: 'the-hunt' });

describe('inhoud van een templateversie', () => {
  it('somt opdrachten, regels en locaties op', () => {
    const c = versionContents(v1, null);
    expect(c.tasks.length).toBe(v1.tasks.length);
    expect(c.rules).toBe(v1.rules.length);
    expect(c.locations).toBe(v1.locations.length);
    expect(c.compared).toBe(false);
    expect(c.tasks.find((t) => t.key === 'lokaal-1')?.cityFields).toContain('Vraagtekst');
  });

  it('ziet wat nieuw, aangepast en weggehaald is', () => {
    const [first, second, ...rest] = v1.tasks;
    const v2 = {
      ...v1,
      tasks: [{ ...second!, points: second!.points + 5 }, ...rest, { ...first!, id: 'nieuw-id', key: 'puzzel-nieuw' }],
    };
    const c = versionContents(v2, v1);
    expect(c.added).toEqual(['puzzel-nieuw']);
    expect(c.changed).toEqual([second!.key]);
    expect(c.removed).toEqual([first!.key]);
    expect(versionContents(v1, v1).changed).toEqual([]);
  });
});
