import { composeGame, CompositionError, type BaseGame, type GamePackage, type Variant } from '@hunt/engine';
import type { GameBundle } from './game-store';
import { t } from './i18n';

export type ImportResult = { ok: true; bundle: GameBundle; slug: string } | { ok: false; errors: string[] };

const SLUG = /^[a-z0-9][a-z0-9-]{1,62}$/;

/**
 * Leest een importbestand. Twee vormen:
 * - een spelpakket (zoals gepubliceerd): wordt een basisspel zonder varianten;
 * - een bundel `{ base, variants }`: basisspel met aanpasbare velden, steden en klanten.
 *
 * Alles wordt eerst proef-samengesteld met de engine, zodat fouten vóór het
 * opslaan zichtbaar zijn.
 */
export function parseGameFile(text: string): ImportResult {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, errors: [t('Dit is geen geldig JSON-bestand.')] };
  }
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    return { ok: false, errors: [t('Het bestand bevat geen spel.')] };
  }

  const record = data as Record<string, unknown>;
  const isBundle = typeof record.base === 'object' && record.base !== null;
  const base = (isBundle ? record.base : { ...record, overridable: [] }) as Partial<BaseGame> & { version?: number };
  const variants = (isBundle ? (record.variants ?? []) : []) as Variant[];

  const errors = shapeErrors(base);
  if (!Array.isArray(variants)) errors.push(t('variants is geen lijst.'));
  for (const v of Array.isArray(variants) ? variants : []) {
    if (typeof v?.id !== 'string' || !SLUG.test(v.id)) errors.push(`variant met ongeldig id: ${String(v?.id)}`);
    else if (v.layer !== 'city' && v.layer !== 'client') errors.push(`variant ${v.id}: layer moet city of client zijn`);
    else if (!Array.isArray(v.overrides)) errors.push(`variant ${v.id}: overrides ontbreekt`);
  }
  if (errors.length > 0) return { ok: false, errors };

  const { version: _version, ...clean } = base;
  const full = { ...clean, overridable: clean.overridable ?? [] } as BaseGame;
  try {
    composeGame(full, [], { id: full.id, version: 1 });
    // Elke variant samen met de stad ervoor, zoals hij later gepubliceerd wordt.
    let city: Variant | undefined;
    for (const v of variants) {
      composeGame(full, v.layer === 'client' && city ? [city, v] : [v], { id: v.id, version: 1 });
      if (v.layer === 'city') city = v;
    }
  } catch (err) {
    return { ok: false, errors: err instanceof CompositionError ? err.issues : [String(err)] };
  }
  return { ok: true, bundle: { base: full, variants }, slug: full.id };
}

function shapeErrors(game: Partial<GamePackage>): string[] {
  const errors: string[] = [];
  if (typeof game.id !== 'string' || !SLUG.test(game.id)) {
    errors.push(t('id ontbreekt of bevat andere tekens dan kleine letters, cijfers en streepjes.'));
  }
  if (!Array.isArray(game.languages) || game.languages.length === 0) errors.push(t('languages ontbreekt.'));
  else if (typeof game.defaultLanguage !== 'string' || !game.languages.includes(game.defaultLanguage)) {
    errors.push(t('defaultLanguage moet een van de talen uit languages zijn.'));
  }
  for (const key of ['tasks', 'rules', 'sequences', 'endings', 'playgrounds'] as const) {
    if (!Array.isArray(game[key])) errors.push(`${key} ontbreekt of is geen lijst.`);
  }
  if (typeof game.gps?.maxAccuracy !== 'number') errors.push(t('gps.maxAccuracy ontbreekt.'));
  return errors;
}
