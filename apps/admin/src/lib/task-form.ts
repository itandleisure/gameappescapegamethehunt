/**
 * Formuliergegevens voor één opdracht, en terug naar een engine-opdracht.
 * Puur (zonder database), zodat het te testen is.
 */
import type { AnswerSpec, Hint, Task, TaskLocation, Text } from '@hunt/engine';

export type AnswerType = AnswerSpec['type'];
export type Texts = Record<string, string>;

export interface TaskForm {
  title: Texts;
  body: Texts;
  image: string;
  hasConfirm: boolean;
  confirm: Texts;
  correctComment: Texts;
  wrongComment: Texts;
  answerType: AnswerType;
  options: Texts[];
  correct: number[];
  accepted: string;
  numberValue: string;
  tolerance: string;
  points: string;
  wrongPoints: string;
  tags: string;
  retryUntilCorrect: boolean;
  hints: { cost: string; text: Texts; image: string }[];
  hasLocation: boolean;
  lat: string;
  lng: string;
  radius: string;
}

const texts = (t: Text | undefined): Texts => {
  const out: Texts = {};
  for (const [lang, value] of Object.entries(t ?? {})) if (typeof value === 'string') out[lang] = value;
  return out;
};

export function taskToForm(task: Task): TaskForm {
  const a = task.answer;
  return {
    title: texts(task.title),
    body: texts(task.body),
    image: task.image ?? '',
    hasConfirm: task.confirm !== undefined,
    confirm: texts(task.confirm),
    correctComment: texts(task.correctComment),
    wrongComment: texts(task.wrongComment),
    answerType: a.type,
    options: a.type === 'choice' || a.type === 'multi' ? a.options.map(texts) : [],
    correct: a.type === 'choice' ? [a.correct] : a.type === 'multi' ? [...a.correct] : [],
    accepted: a.type === 'text' ? a.accepted.join('\n') : '',
    numberValue: a.type === 'number' ? String(a.value) : '',
    tolerance: a.type === 'number' && a.tolerance !== undefined ? String(a.tolerance) : '',
    points: String(task.points),
    wrongPoints: String(task.wrongPoints ?? 0),
    tags: task.tags.join(', '),
    retryUntilCorrect: task.retryUntilCorrect ?? false,
    hints: task.hints.map((h) => ({ cost: String(h.cost), text: texts(h.text), image: h.image ?? '' })),
    hasLocation: task.location !== undefined,
    lat: task.location ? String(task.location.lat) : '',
    lng: task.location ? String(task.location.lng) : '',
    radius: task.location ? String(task.location.radius) : '25',
  };
}

/** Lege talen weglaten; een tekst zonder inhoud wordt een leeg object. */
export function cleanText(value: Texts): Text {
  const out: Text = {};
  for (const [lang, text] of Object.entries(value)) if (text.trim() !== '') out[lang] = text.trim();
  return out;
}

const num = (s: string) => (s.trim() === '' ? NaN : Number(s.replace(',', '.')));

export function formAnswer(form: TaskForm, errors: string[]): AnswerSpec {
  switch (form.answerType) {
    case 'choice':
    case 'multi': {
      const options = form.options.map(cleanText);
      if (options.length < 2) errors.push('Geef minstens twee opties.');
      const correct = form.correct.filter((i) => i < options.length);
      if (correct.length === 0) errors.push('Vink aan welke optie goed is.');
      return form.answerType === 'choice'
        ? { type: 'choice', options, correct: correct[0] ?? 0 }
        : { type: 'multi', options, correct: [...correct].sort((a, b) => a - b) };
    }
    case 'text': {
      const accepted = form.accepted
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean);
      if (accepted.length === 0) errors.push('Geef minstens één goed antwoord.');
      return { type: 'text', accepted };
    }
    case 'number': {
      const value = num(form.numberValue);
      if (Number.isNaN(value)) errors.push('Het goede getal ontbreekt.');
      const tolerance = num(form.tolerance);
      return Number.isNaN(tolerance) ? { type: 'number', value } : { type: 'number', value, tolerance };
    }
    default:
      return { type: form.answerType } as AnswerSpec;
  }
}

export function formLocation(form: TaskForm, errors: string[]): TaskLocation | undefined {
  if (!form.hasLocation) return undefined;
  const lat = num(form.lat);
  const lng = num(form.lng);
  const radius = num(form.radius);
  if (!(lat >= -90 && lat <= 90) || !(lng >= -180 && lng <= 180)) errors.push('Breedte- of lengtegraad is ongeldig.');
  if (!(radius > 0)) errors.push('De straal moet groter dan 0 meter zijn.');
  return { lat, lng, radius: Math.round(radius) };
}

/** Formulier → opdracht (alle velden), plus foutmeldingen. */
export function formToTask(key: string, form: TaskForm): { task: Task; errors: string[] } {
  const errors: string[] = [];
  const points = num(form.points);
  const wrongPoints = num(form.wrongPoints || '0');
  if (!Number.isInteger(points)) errors.push('Punten moet een heel getal zijn.');
  if (!Number.isInteger(wrongPoints)) errors.push('Punten bij fout moet een heel getal zijn.');
  const hints = form.hints.map((h, i) => {
    const cost = num(h.cost);
    if (!Number.isInteger(cost) || cost < 0) errors.push(`Hint ${i + 1}: de prijs moet een positief heel getal zijn.`);
    const hint: Hint = { cost, text: cleanText(h.text) };
    const image = h.image.trim();
    if (image) {
      if (!/^https:\/\/\S+$/.test(image)) errors.push(`Hint ${i + 1}: de afbeelding moet een https-adres zijn.`);
      hint.image = image;
    }
    return hint;
  });

  const task: Task = {
    id: key,
    title: cleanText(form.title),
    body: cleanText(form.body),
    answer: formAnswer(form, errors),
    points,
    tags: form.tags
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    hints,
  };
  const image = form.image.trim();
  if (image) {
    if (!/^https:\/\/\S+$/.test(image)) errors.push('De foto moet een https-adres zijn.');
    task.image = image;
  }
  if (wrongPoints !== 0) task.wrongPoints = wrongPoints;
  if (form.hasConfirm) task.confirm = cleanText(form.confirm);
  if (form.retryUntilCorrect) task.retryUntilCorrect = true;
  const correctComment = cleanText(form.correctComment);
  const wrongComment = cleanText(form.wrongComment);
  if (Object.keys(correctComment).length) task.correctComment = correctComment;
  if (Object.keys(wrongComment).length) task.wrongComment = wrongComment;
  const location = formLocation(form, errors);
  if (location) task.location = location;
  return { task, errors };
}
