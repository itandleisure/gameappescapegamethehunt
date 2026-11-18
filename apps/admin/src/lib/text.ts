import { t, type Lang, type Text } from '@hunt/engine';
import { currentLanguage } from './i18n';

/** Tekst uit een spelpakket in de taal van de beheerder, anders Nederlands, anders de eerste beschikbare taal. */
export function tx(value: unknown): string {
  if (typeof value === 'string') return value;
  if (!value || typeof value !== 'object') return '';
  const text = value as Text;
  const own = currentLanguage() as Lang;
  if (text[own]) return text[own]!;
  return t(text, 'nl', Object.keys(text)[0] ?? 'nl');
}
