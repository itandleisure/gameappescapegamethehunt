import { describe, expect, it } from 'vitest';
import { theHuntBase } from '../../../packages/engine/test/fixtures/the-hunt.js';
import { formToTask, taskToForm } from '../src/lib/task-form.js';

describe('opdrachtformulier', () => {
  it('geeft elke opdracht uit The Hunt ongewijzigd terug', () => {
    for (const task of theHuntBase.tasks) {
      const { trackLocations: _tracks, ...rest } = task;
      const { task: back, errors } = formToTask(task.id, taskToForm(task));
      expect(errors, task.id).toEqual([]);
      expect(JSON.parse(JSON.stringify(back)), task.id).toEqual(JSON.parse(JSON.stringify(rest)));
    }
  });

  it('meldt ontbrekende antwoorden, opties en een ongeldige locatie', () => {
    const form = taskToForm(theHuntBase.tasks[0]!);
    expect(formToTask('x', { ...form, answerType: 'text', accepted: ' \n ' }).errors).toContain('Geef minstens één goed antwoord.');
    expect(formToTask('x', { ...form, answerType: 'choice', options: [{ nl: 'a' }], correct: [] }).errors).toHaveLength(2);
    expect(formToTask('x', { ...form, hasLocation: true, lat: '95', lng: '5', radius: '0' }).errors).toHaveLength(2);
    expect(formToTask('x', { ...form, answerType: 'number', numberValue: '4,5' }).task.answer).toEqual({ type: 'number', value: 4.5 });
  });
});
