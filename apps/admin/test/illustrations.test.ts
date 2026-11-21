import { describe, expect, it } from 'vitest';
import type { GamePackage } from '@hunt/engine';
import { INFOGRAPHICS, INFOGRAPHIC_LANGUAGES, applyIllustrations, illustrationPath, illustrationSource, isIllustration } from '../src/lib/illustrations.js';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { formToTask, taskToForm } from '../src/lib/task-form.js';
import { taskSettings } from '../src/lib/game-model.js';
import template from '../src/templates/escape-game-the-hunt-v1.json';

const pkg = {
  tasks: [
    { id: 'uitleg-06', title: {}, body: {}, answer: { type: 'info' }, points: 0, tags: [], hints: [], image: 'https://x/vlag.png', illustration: 'extractiepunt' },
    { id: 'uitleg-07', title: {}, body: {}, answer: { type: 'info' }, points: 0, tags: [], hints: [], image: 'https://x/hunters.jpg' },
  ],
} as unknown as GamePackage;

describe('vaste illustraties', () => {
  it('kent alleen de tekeningen die er zijn', () => {
    expect(isIllustration('extractiepunt')).toBe(true);
    expect(isIllustration('iets-anders')).toBe(false);
  });

  it('zet de tekening alleen bij de opdrachten die erom vragen', () => {
    const out = applyIllustrations(pkg, { extractiepunt: { '': 'https://media/x.png' } });
    expect(out.tasks.map((t) => t.image)).toEqual(['https://media/x.png', 'https://x/hunters.jpg']);
    expect(applyIllustrations(pkg, {}).tasks[0]!.image).toBe('https://x/vlag.png');
  });

  it('geeft een infographic per taal, met Nederlands als de taal ontbreekt', () => {
    const lang = {
      ...pkg,
      languages: ['nl', 'en', 'xx'],
      defaultLanguage: 'nl',
      tasks: [{ ...pkg.tasks[0]!, illustration: 'uitleg-speelveld' }],
    } as unknown as GamePackage;
    const out = applyIllustrations(lang, { 'uitleg-speelveld': { nl: 'https://m/nl.png', en: 'https://m/en.png' } });
    expect(out.tasks[0]!.image).toBe('https://m/nl.png');
    expect(out.tasks[0]!.images).toEqual({ nl: 'https://m/nl.png', en: 'https://m/en.png' });
    expect(illustrationSource('uitleg-speelveld', 'xx')).toBe('/illustraties/uitleg-speelveld/nl.png');
    expect(illustrationSource('uitleg-speelveld', 'de')).toBe('/illustraties/uitleg-speelveld/de.png');
  });

  it('heeft elke infographic in elke taal', () => {
    for (const name of INFOGRAPHICS)
      for (const lang of INFOGRAPHIC_LANGUAGES)
        expect(existsSync(join(__dirname, '..', 'public', illustrationSource(name, lang))), `${name}/${lang}`).toBe(true);
  });

  it('bewaart het bestand per spel', () => {
    expect(illustrationPath('abc', 'extractiepunt')).toMatch(/^abc\/illustratie-extractiepunt-v\d+\.png$/);
    expect(illustrationPath('abc', 'uitleg-start', 'fr')).toMatch(/^abc\/illustratie-uitleg-start-fr-v\d+\.png$/);
  });

  it('blijft bewaard via het formulier en de instellingen', () => {
    const task = pkg.tasks[0]!;
    const back = formToTask(task.id, taskToForm(task));
    expect(back.task.illustration).toBe('extractiepunt');
    expect(taskSettings(task)).toMatchObject({ illustration: 'extractiepunt' });
  });

  it('staat aan bij alle uitlegschermen in de template, met Batterij leeg? vóór de start', () => {
    const base = (template as unknown as { base: { tasks: { id: string; illustration?: string }[]; sequences: { id: string; tasks: string[] }[] } }).base;
    const intro = base.sequences.find((q) => q.id === 'intro')!.tasks;
    expect(intro.slice(-2)).toEqual(['uitleg-13', 'uitleg-12']);
    expect(intro.map((id) => base.tasks.find((t) => t.id === id)?.illustration)).toEqual([
      ...INFOGRAPHICS.slice(0, 11),
      'uitleg-batterij',
      'uitleg-start',
    ]);
  });
});
