import type { AnswerSpec, AnswerValue } from './types.js';

/**
 * Normaliseert een tekstantwoord: zonder hoofdletters, spaties en accenten.
 * "Café  Noord" en "cafenoord" zijn dus gelijk.
 */
export function normalizeText(input: string): string {
  return input
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, '');
}

/**
 * Komt een tekstantwoord overeen met een goedgekeurd antwoord? Een `*` in het
 * goedgekeurde antwoord staat voor willekeurige tekens, zoals in Loquiz:
 * "ver*" keurt alles goed dat met "ver" begint.
 */
export function matchesAccepted(accepted: string, given: string): boolean {
  const want = normalizeText(accepted);
  const got = normalizeText(given);
  if (!want.includes('*')) return want === got;
  const pattern = want
    .split('*')
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
    .join('.*');
  return new RegExp(`^${pattern}$`, 'u').test(got);
}

/** Leest een getal, ook met een komma als decimaalteken ("3,5"). */
export function parseNumber(input: number | string): number | undefined {
  if (typeof input === 'number') return Number.isFinite(input) ? input : undefined;
  const cleaned = input.trim().replace(/\s+/g, '').replace(',', '.');
  if (cleaned === '' || !/^[-+]?\d*\.?\d+$/.test(cleaned)) return undefined;
  return Number(cleaned);
}

export type AnswerCheck = { valid: false; reason: string } | { valid: true; correct: boolean };

/** Controleert een antwoord tegen de specificatie van de opdracht. */
export function checkAnswer(spec: AnswerSpec, answer: AnswerValue): AnswerCheck {
  if (spec.type !== answer.type) {
    return { valid: false, reason: `antwoordtype ${answer.type} past niet bij ${spec.type}` };
  }
  switch (spec.type) {
    case 'info':
      return { valid: true, correct: true };
    case 'photo': {
      const a = answer as Extract<AnswerValue, { type: 'photo' }>;
      if (!a.photoId) return { valid: false, reason: 'foto ontbreekt' };
      return { valid: true, correct: true };
    }
    case 'choice': {
      const a = answer as Extract<AnswerValue, { type: 'choice' }>;
      if (!Number.isInteger(a.option) || a.option < 0 || a.option >= spec.options.length) {
        return { valid: false, reason: 'onbekende optie' };
      }
      return { valid: true, correct: a.option === spec.correct };
    }
    case 'multi': {
      const a = answer as Extract<AnswerValue, { type: 'multi' }>;
      const chosen = new Set(a.options);
      if ([...chosen].some((o) => !Number.isInteger(o) || o < 0 || o >= spec.options.length)) {
        return { valid: false, reason: 'onbekende optie' };
      }
      const expected = new Set(spec.correct);
      const correct = chosen.size === expected.size && [...chosen].every((o) => expected.has(o));
      return { valid: true, correct };
    }
    case 'text': {
      const a = answer as Extract<AnswerValue, { type: 'text' }>;
      const given = normalizeText(a.text ?? '');
      if (given === '') return { valid: false, reason: 'leeg antwoord' };
      return { valid: true, correct: spec.accepted.some((acc) => matchesAccepted(acc, given)) };
    }
    case 'number': {
      const a = answer as Extract<AnswerValue, { type: 'number' }>;
      const value = parseNumber(a.value);
      if (value === undefined) return { valid: false, reason: 'geen geldig getal' };
      return { valid: true, correct: Math.abs(value - spec.value) <= (spec.tolerance ?? 0) };
    }
  }
}
