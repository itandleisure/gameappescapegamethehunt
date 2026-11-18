import { describe, expect, it } from 'vitest';
import { theHuntBase } from '../../../packages/engine/test/fixtures/the-hunt.js';
import { describeRule, parseRule } from '../src/lib/rules.js';

describe('regels', () => {
  it('beschrijft elke regel van het testspel zonder ruwe JSON', () => {
    for (const rule of theHuntBase.rules) {
      const text = describeRule(rule);
      expect(text.startsWith('Als ')).toBe(true);
      expect(text).not.toContain('{"');
    }
  });

  it('leest een regel uit de editor en meldt fouten', () => {
    expect(parseRule('r', ' Start ', '{"kind":"elapsed","minutes":10}', '[{"kind":"award","points":5}]').rule).toEqual({
      id: 'r',
      label: 'Start',
      when: { kind: 'elapsed', minutes: 10 },
      then: [{ kind: 'award', points: 5 }],
    });
    expect(parseRule('r', '', '{', '[]').error).toContain('voorwaarde');
    expect(parseRule('r', '', '{"kind":"elapsed"}', '{}').error).toContain('acties');
  });
});

describe('tijden in regels', () => {
  it('leest en wijzigt tijden, ook in samengestelde voorwaarden', async () => {
    const { timeSettings, withTimes } = await import('../src/lib/rules.js');
    const c = { kind: 'and' as const, conditions: [{ kind: 'elapsed' as const, minutes: 10 }, { kind: 'not' as const, condition: { kind: 'afterCompleted' as const, task: 'a', seconds: 30 } }] };
    expect(timeSettings(c)).toEqual([{ kind: 'elapsed', minutes: 10 }, { kind: 'afterCompleted', task: 'a', seconds: 30 }]);
    expect(timeSettings(withTimes(c, [2, 5]))).toEqual([{ kind: 'elapsed', minutes: 2 }, { kind: 'afterCompleted', task: 'a', seconds: 5 }]);
  });
});
