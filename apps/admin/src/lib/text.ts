import { t, type Text } from '@hunt/engine';

/** Tekst uit een spelpakket in het Nederlands, of de eerste beschikbare taal. */
export function tx(value: unknown): string {
  if (typeof value === 'string') return value;
  if (!value || typeof value !== 'object') return '';
  const text = value as Text;
  return t(text, 'nl', Object.keys(text)[0] ?? 'nl');
}
