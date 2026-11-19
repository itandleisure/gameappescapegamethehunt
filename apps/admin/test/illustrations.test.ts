import { describe, expect, it } from 'vitest';
import type { GamePackage } from '@hunt/engine';
import { applyIllustrations, illustrationPath, isIllustration } from '../src/lib/illustrations.js';
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
    const out = applyIllustrations(pkg, { extractiepunt: 'https://media/x.png' });
    expect(out.tasks.map((t) => t.image)).toEqual(['https://media/x.png', 'https://x/hunters.jpg']);
    expect(applyIllustrations(pkg, {}).tasks[0]!.image).toBe('https://x/vlag.png');
  });

  it('bewaart het bestand per spel', () => {
    expect(illustrationPath('abc', 'extractiepunt')).toMatch(/^abc\/illustratie-extractiepunt-v\d+\.png$/);
  });

  it('blijft bewaard via het formulier en de instellingen', () => {
    const task = pkg.tasks[0]!;
    const back = formToTask(task.id, taskToForm(task));
    expect(back.task.illustration).toBe('extractiepunt');
    expect(taskSettings(task)).toMatchObject({ illustration: 'extractiepunt' });
  });

  it('staat aan bij de uitleg Extractiepunt in de template', () => {
    const tasks = (template as unknown as { base: { tasks: { id: string; illustration?: string }[] } }).base.tasks;
    expect(tasks.find((t) => t.id === 'uitleg-06')?.illustration).toBe('extractiepunt');
  });
});
