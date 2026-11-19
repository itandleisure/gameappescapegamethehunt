import { describe, expect, it } from 'vitest';
import type { GamePackage, PlayBoundary } from '@hunt/engine';
import { theHuntBase } from '../../../packages/engine/test/fixtures/the-hunt.js';
import { applyPlayfieldImage, needsPlayfieldImage, playfieldPath, playfieldStyle } from '../src/lib/playfield-image.js';
import { formToTask, taskToForm } from '../src/lib/task-form.js';
import { taskSettings } from '../src/lib/game-model.js';

const square: PlayBoundary = {
  points: [
    { lat: 53.2, lng: 5.79 },
    { lat: 53.21, lng: 5.79 },
    { lat: 53.21, lng: 5.8 },
  ],
};
const pkg = (boundary?: PlayBoundary): GamePackage =>
  ({
    tasks: [
      { id: 'uitleg-02', title: {}, body: {}, answer: { type: 'info' }, points: 0, tags: [], hints: [], image: 'https://x/oud.jpg', playfieldImage: true },
      { id: 'uitleg-03', title: {}, body: {}, answer: { type: 'info' }, points: 0, tags: [], hints: [], image: 'https://x/rugtas.jpg' },
    ],
    boundary,
  }) as unknown as GamePackage;

describe('kaartje van het speelveld', () => {
  it('alleen nodig met een opdracht die erom vraagt en een grens van minstens 3 punten', () => {
    expect(needsPlayfieldImage(pkg(square))).toBe(true);
    expect(needsPlayfieldImage(pkg())).toBe(false);
    expect(needsPlayfieldImage(pkg({ points: square.points.slice(0, 2) }))).toBe(false);
    const none = pkg(square);
    none.tasks[0]!.playfieldImage = undefined;
    expect(needsPlayfieldImage(none)).toBe(false);
  });

  it('zet het kaartje alleen bij de opdrachten die erom vragen', () => {
    const out = applyPlayfieldImage(pkg(square), 'https://x/speelveld.jpg');
    expect(out.tasks.map((t) => t.image)).toEqual(['https://x/speelveld.jpg', 'https://x/rugtas.jpg']);
  });

  it('zelfde grens en stijl geven hetzelfde bestand; elke wijziging een nieuw', () => {
    const { styleUrl } = playfieldStyle({});
    const a = playfieldPath('g1', square, styleUrl);
    expect(a).toMatch(/^g1\/speelveld-[0-9a-f]{16}\.jpg$/);
    expect(playfieldPath('g1', { ...square }, styleUrl)).toBe(a);
    expect(playfieldPath('g1', { ...square, color: '#000000' }, styleUrl)).not.toBe(a);
    expect(playfieldPath('g1', { ...square, outsideOpacity: 0.2 }, styleUrl)).not.toBe(a);
    expect(playfieldPath('g1', { points: [...square.points.slice(0, 2), { lat: 53.211, lng: 5.8 }] }, styleUrl)).not.toBe(a);
    expect(playfieldPath('g1', square, 'https://andere/stijl.json')).not.toBe(a);
  });

  it('bewaart de instelling in het formulier en in tasks.settings', () => {
    const task = { ...theHuntBase.tasks[0]!, playfieldImage: true };
    const form = taskToForm(task);
    expect(form.playfieldImage).toBe(true);
    expect(formToTask(task.id, form).task.playfieldImage).toBe(true);
    expect(formToTask(task.id, { ...form, playfieldImage: false }).task.playfieldImage).toBeUndefined();
    expect(taskSettings(task, { playfieldImage: false, ander: 1 })).toMatchObject({ playfieldImage: true, ander: 1 });
    expect(taskSettings({ ...task, playfieldImage: undefined }, { playfieldImage: true })).not.toHaveProperty('playfieldImage');
  });
});
