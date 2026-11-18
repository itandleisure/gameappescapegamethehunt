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

  it('rekent tijden om naar uren, minuten en seconden', async () => {
    const { formatDuration, relabel, settingSeconds, settingValue, splitDuration } = await import('../src/lib/rules.js');
    expect(splitDuration(3930)).toEqual({ h: 1, m: 5, s: 30 });
    expect(formatDuration(3930)).toBe('1 uur 5 minuten 30 seconden');
    expect(formatDuration(60)).toBe('1 minuut');
    expect(formatDuration(0)).toBe('0 minuten');
    const elapsed = { kind: 'elapsed' as const, minutes: 10 };
    expect(settingSeconds(elapsed)).toBe(600);
    expect(settingValue(elapsed, 90)).toBe(1.5);
    expect(settingValue({ kind: 'afterCompleted', task: 'a', seconds: 1 }, 90)).toBe(90);
    expect(relabel('Na 10 minuten: bericht', [elapsed], [60])).toBe('Na 1 minuut: bericht');
    expect(relabel('Alle puzzels goed en minstens 60 minuten: klaar', [{ kind: 'elapsed', minutes: 60 }], [3600])).toBe(
      'Alle puzzels goed en minstens 60 minuten: klaar',
    );
    expect(relabel('Na 75 minuten: einde', [{ kind: 'elapsed', minutes: 75 }], [4530])).toBe('Na 1 uur 15 minuten 30 seconden: einde');
    expect(relabel('Na 100 minuten', [elapsed], [60])).toBe('Na 100 minuten');
    expect(relabel('10 - Puzzel 1 vrijgeven', [elapsed], [900])).toBe('15 - Puzzel 1 vrijgeven');
    expect(relabel('10 - Puzzel 1 vrijgeven', [elapsed], [630])).toBe('10:30 - Puzzel 1 vrijgeven');
    expect(relabel('75 - Extractiepunt tonen', [{ kind: 'elapsed', minutes: 75 }], [4800])).toBe('80 - Extractiepunt tonen');
    expect(relabel('10:30 - Puzzel 1', [{ kind: 'elapsed', minutes: 10.5 }], [600])).toBe('10 - Puzzel 1');
    expect(relabel('20 - Puzzel 2 vrijgeven', [elapsed], [900])).toBe('20 - Puzzel 2 vrijgeven');
  });
});
