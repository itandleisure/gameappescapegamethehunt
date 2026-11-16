import type { Lang, Text } from './types.js';

/** Kiest de tekst in de gevraagde taal, met terugval op de standaardtaal. */
export function t(text: Text | undefined, lang: Lang, fallback?: Lang): string {
  if (!text) return '';
  return text[lang] ?? (fallback ? text[fallback] : undefined) ?? Object.values(text).find((v) => v) ?? '';
}

/** Vervangt variabelen zoals `${TEAM}` in een tekst. */
export function interpolate(input: string, vars: Record<string, string>): string {
  return input.replace(/\$\{([A-Z_]+)\}/g, (match, key: string) => vars[key] ?? match);
}
