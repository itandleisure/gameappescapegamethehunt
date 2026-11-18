/**
 * Namen van spellen. Een basisspel heeft een naam per taal die spelers in de
 * app zien (in translations). Een stad of klant heeft een eigen naam voor de
 * beheeromgeving (in settings.name), zoals "Leeuwarden" of "Parteon".
 */
import type { GameRow, LayerRows, TranslationRow } from './game-model';
import { tx } from './text';

export type NameByLang = Record<string, string>;

/** Naam in de app van een basisspel, per taal. */
export function baseName(rows: LayerRows): NameByLang {
  const out: NameByLang = {};
  for (const r of rows.translations) if (r.entity === 'game' && r.entity_id === '' && r.field === 'name') out[r.lang] = r.text;
  return out;
}

/** Naam van een stad of klant, per taal (een oude naam zonder taal geldt voor alle talen). */
export function variantName(game: Pick<GameRow, 'settings' | 'languages'>): NameByLang {
  const value = game.settings.name;
  if (typeof value === 'string') return Object.fromEntries(game.languages.map((l) => [l, value]));
  if (value && typeof value === 'object') return { ...(value as NameByLang) };
  return {};
}

/** Naam om te tonen in de beheeromgeving, anders de sleutel (slug). */
export function displayName(game: Pick<GameRow, 'layer' | 'slug' | 'settings'>, translations?: TranslationRow[]): string {
  if (game.layer === 'base' && translations) {
    const text = Object.fromEntries(
      translations.filter((r) => r.entity === 'game' && r.entity_id === '' && r.field === 'name').map((r) => [r.lang, r.text]),
    );
    if (Object.keys(text).length) return tx(text);
  }
  return tx(game.settings.name) || game.slug;
}

/** Ingevulde namen, zonder spaties eromheen en zonder lege talen. */
export function cleanName(name: NameByLang, languages: string[]): NameByLang {
  const out: NameByLang = {};
  for (const lang of languages) {
    const text = name[lang]?.trim();
    if (text) out[lang] = text;
  }
  return out;
}

/**
 * Een stad op een vastgezette versie van het basisspel krijgt toch de huidige
 * naam van het basisspel. De naam hoort niet bij de spelinhoud, dus een nieuwe
 * naam hoeft niet te wachten op een nieuwe versie.
 */
export function withCurrentName(snapshot: LayerRows, current: LayerRows): LayerRows {
  const isName = (r: TranslationRow) => r.entity === 'game' && r.entity_id === '' && r.field === 'name';
  const live = current.translations.filter(isName);
  if (live.length === 0) return snapshot;
  return { ...snapshot, translations: [...snapshot.translations.filter((r) => !isName(r)), ...live] };
}
