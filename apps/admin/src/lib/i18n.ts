import { de } from '../i18n/de';
import { en } from '../i18n/en';
import { es } from '../i18n/es';
import { it } from '../i18n/it';
import { pt } from '../i18n/pt';

/**
 * Teksten van de beheerapp in meerdere talen. De Nederlandse tekst is zelf de
 * sleutel: `t('Uitloggen')` geeft in het Engels "Log out". Een tekst zonder
 * vertaling blijft Nederlands, dus nieuwe teksten werken altijd meteen.
 * Spelinhoud (opdrachten, briefing) wordt hier niet vertaald; die staat per
 * taal in het spelpakket.
 */
export const ADMIN_LANGUAGES = ['nl', 'en', 'de', 'es', 'pt', 'it'] as const;
export type AdminLanguage = (typeof ADMIN_LANGUAGES)[number];

/** Naam van elke taal in die taal zelf, voor de taalkeuze. */
export const ADMIN_LANGUAGE_NAMES: Record<AdminLanguage, string> = {
  nl: 'Nederlands',
  en: 'English',
  de: 'Deutsch',
  es: 'Español',
  pt: 'Português',
  it: 'Italiano',
};

/** Locale voor datums en getallen per taal. */
export const LOCALES: Record<AdminLanguage, string> = {
  nl: 'nl-NL',
  en: 'en-GB',
  de: 'de-DE',
  es: 'es-ES',
  pt: 'pt-PT',
  it: 'it-IT',
};

export const DICTIONARIES: Record<Exclude<AdminLanguage, 'nl'>, Record<string, string>> = { en, de, es, pt, it };

export type Vars = Record<string, string | number>;

/**
 * Markeert een vaste tekst die later met `t(...)` wordt vertaald (bijvoorbeeld
 * in een lijst met labels). Doet zelf niets; de test vindt zo alle teksten.
 */
export const tKey = <T extends string>(nl: T): T => nl;

/** Namen van de kaartstijlen uit de engine, zodat ze ook vertaald worden. */
export const MAP_STYLE_NAMES = [tKey('Zwart-wit (standaard)'), tKey('Nacht'), tKey('Schatkaart'), tKey('Toner (MapTiler)'), tKey('Gewone kleurenkaart')];

let current: AdminLanguage = 'nl';

/** Huidige taal van de beheerapp (wordt gezet door de LanguageProvider). */
export const currentLanguage = (): AdminLanguage => current;
export const currentLocale = (): string => LOCALES[current];

export function setCurrentLanguage(lang: AdminLanguage): void {
  current = lang;
}

export function isAdminLanguage(value: unknown): value is AdminLanguage {
  return typeof value === 'string' && (ADMIN_LANGUAGES as readonly string[]).includes(value);
}

/** Eerste ondersteunde taal uit een lijst zoals navigator.languages, anders Nederlands. */
export function pickAdminLanguage(tags: readonly string[]): AdminLanguage {
  for (const tag of tags) {
    const code = tag.toLowerCase().split(/[-_]/)[0];
    if (isAdminLanguage(code)) return code;
  }
  return 'nl';
}

/** Vertaalt een Nederlandse tekst naar `lang` en vult {naam}-plekken in. */
export function translate(lang: AdminLanguage, nl: string, vars: Vars = {}): string {
  const text = lang === 'nl' ? nl : (DICTIONARIES[lang][nl] ?? nl);
  return text.replace(/\{(\w+)\}/g, (all, name: string) => (name in vars ? String(vars[name]) : all));
}

/** Vertaalt naar de huidige taal. Gebruik in componenten liever `useT()`, dan wisselt het scherm direct mee. */
export function t(nl: string, vars?: Vars): string {
  return translate(current, nl, vars);
}
