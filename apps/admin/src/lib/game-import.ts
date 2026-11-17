import { validateGame, type GamePackage } from '@hunt/engine';

export type ImportResult = { ok: true; game: GamePackage; slug: string } | { ok: false; errors: string[] };

const SLUG = /^[a-z0-9][a-z0-9-]{1,62}$/;

/**
 * Controleert een spelpakket (JSON) voordat het als nieuwe versie wordt
 * gepubliceerd. Gebruikt dezelfde controles als de engine.
 */
export function parseGamePackage(text: string): ImportResult {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, errors: ['Dit is geen geldig JSON-bestand.'] };
  }
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    return { ok: false, errors: ['Het bestand bevat geen spelpakket.'] };
  }
  const game = data as Partial<GamePackage>;
  const errors: string[] = [];
  if (typeof game.id !== 'string' || !SLUG.test(game.id)) {
    errors.push('id ontbreekt of bevat andere tekens dan kleine letters, cijfers en streepjes.');
  }
  if (!Array.isArray(game.languages) || game.languages.length === 0) errors.push('languages ontbreekt.');
  else if (typeof game.defaultLanguage !== 'string' || !game.languages.includes(game.defaultLanguage)) {
    errors.push('defaultLanguage moet een van de talen uit languages zijn.');
  }
  for (const key of ['tasks', 'rules', 'sequences', 'endings', 'playgrounds'] as const) {
    if (!Array.isArray(game[key])) errors.push(`${key} ontbreekt of is geen lijst.`);
  }
  if (typeof game.gps?.maxAccuracy !== 'number') errors.push('gps.maxAccuracy ontbreekt.');
  if (errors.length > 0) return { ok: false, errors };

  const full = game as GamePackage;
  const issues = validateGame(full);
  if (issues.length > 0) return { ok: false, errors: issues };
  return { ok: true, game: full, slug: full.id };
}
