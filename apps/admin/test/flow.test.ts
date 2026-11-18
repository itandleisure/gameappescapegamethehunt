import { describe, expect, it } from 'vitest';
import file from '../src/templates/escape-game-the-hunt-v1.json';
import { parseGameFile } from '../src/lib/game-import.js';
import { actionLine, conditionText, extraConditions, labelWithoutTime, namesFor, newRuleKey, timeline } from '../src/lib/flow.js';

const parsed = parseGameFile(JSON.stringify(file));
if (!parsed.ok) throw new Error('template niet in te lezen');
const base = parsed.bundle.base;
const names = namesFor(base);

describe('spelverloop', () => {
  it('zet de tijdregels op volgorde van tijd, de rest apart', () => {
    const { moments, other } = timeline(base.rules);
    expect(moments.map((m) => m.seconds / 60)).toEqual([0, 10, 20, 30, 35, 40, 50, 60, 75, 90]);
    expect(moments.find((m) => m.seconds === 75 * 60)!.rules.map((r) => r.id)).toEqual(['finale-alles-goed', 'finale-niet-alles-goed']);
    expect(other.map((r) => r.id)).toContain('track-bonus');
    expect(other.some((r) => r.id.startsWith('tijdlijn'))).toBe(false);
  });

  it('beschrijft in gewone taal, met namen van opdrachten', () => {
    const puzzel1 = base.rules.find((r) => r.id === 'tijdlijn-10')!;
    const lines = puzzel1.then.map((a) => actionLine(a, names));
    expect(lines[0]!.text).toBe('Bericht aan het team');
    expect(lines[0]!.detail).toMatch(/^Er zijn 10 minuten verstreken/);
    expect(lines[1]!.text).toMatch(/^‘.+’ verschijnt in de opdrachtenlijst$/);
    expect(lines[1]!.text).not.toContain('puzzel-tangram');

    const finale = base.rules.find((r) => r.id === 'finale-alles-goed')!;
    expect(extraConditions(finale).map((c) => conditionText(c, names))).toEqual([
      expect.stringMatching(/^de \d+ opdrachten met label ‘oplossing’ goed$/),
    ]);
  });

  it('haalt de minuten vooraan weg en maakt nieuwe sleutels', () => {
    expect(labelWithoutTime('10 - Puzzel 1 vrijgeven')).toBe('Puzzel 1 vrijgeven');
    expect(labelWithoutTime('10:30 - Puzzel 1')).toBe('Puzzel 1');
    expect(labelWithoutTime('Na 10 minuten: x')).toBe('Na 10 minuten: x');
    expect(newRuleKey([{ id: 'moment-80', when: { kind: 'elapsed', minutes: 80 }, then: [] }], 'moment-80')).toBe('moment-80-2');
  });
});
