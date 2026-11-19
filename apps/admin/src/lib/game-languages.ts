import { currentLanguage } from './i18n';

/**
 * Talen waarin een spel gespeeld kan worden: Nederlands, Engels en de andere
 * Europese talen. Dit staat los van de taal van de beheeromgeving zelf
 * (zie i18n.ts); die is er in minder talen.
 */
export const GAME_LANGUAGES = [
  'nl', 'en', 'de', 'fr', 'es', 'it', 'pt',
  'da', 'sv', 'no', 'fi', 'pl', 'cs', 'sk', 'hu', 'ro', 'bg', 'el', 'hr', 'sl', 'et', 'lv', 'lt', 'ga', 'mt',
] as const;
export type GameLanguage = (typeof GAME_LANGUAGES)[number];

/** Naam van elke taal in die taal zelf, zoals in de taalkeuze van de app. */
export const GAME_LANGUAGE_NAMES: Record<GameLanguage, string> = {
  nl: 'Nederlands',
  en: 'English',
  de: 'Deutsch',
  fr: 'Français',
  es: 'Español',
  it: 'Italiano',
  pt: 'Português',
  da: 'Dansk',
  sv: 'Svenska',
  no: 'Norsk',
  fi: 'Suomi',
  pl: 'Polski',
  cs: 'Čeština',
  sk: 'Slovenčina',
  hu: 'Magyar',
  ro: 'Română',
  bg: 'Български',
  el: 'Ελληνικά',
  hr: 'Hrvatski',
  sl: 'Slovenščina',
  et: 'Eesti',
  lv: 'Latviešu',
  lt: 'Lietuvių',
  ga: 'Gaeilge',
  mt: 'Malti',
};

/** Engelse naam van elke taal, voor de opdracht aan de automatische vertaler. */
export const GAME_LANGUAGE_ENGLISH: Record<GameLanguage, string> = {
  nl: 'Dutch',
  en: 'English',
  de: 'German',
  fr: 'French',
  es: 'Spanish (Spain)',
  it: 'Italian',
  pt: 'Portuguese (Portugal)',
  da: 'Danish',
  sv: 'Swedish',
  no: 'Norwegian (Bokmål)',
  fi: 'Finnish',
  pl: 'Polish',
  cs: 'Czech',
  sk: 'Slovak',
  hu: 'Hungarian',
  ro: 'Romanian',
  bg: 'Bulgarian',
  el: 'Greek',
  hr: 'Croatian',
  sl: 'Slovenian',
  et: 'Estonian',
  lv: 'Latvian',
  lt: 'Lithuanian',
  ga: 'Irish (Gaeilge)',
  mt: 'Maltese',
};

export function isGameLanguage(value: unknown): value is GameLanguage {
  return typeof value === 'string' && (GAME_LANGUAGES as readonly string[]).includes(value);
}

/** Vlag van het land dat bij de taal hoort (Engels: Verenigd Koninkrijk, Iers: Ierland). */
export const GAME_LANGUAGE_FLAGS: Record<GameLanguage, string> = {
  nl: '🇳🇱',
  en: '🇬🇧',
  de: '🇩🇪',
  fr: '🇫🇷',
  es: '🇪🇸',
  it: '🇮🇹',
  pt: '🇵🇹',
  da: '🇩🇰',
  sv: '🇸🇪',
  no: '🇳🇴',
  fi: '🇫🇮',
  pl: '🇵🇱',
  cs: '🇨🇿',
  sk: '🇸🇰',
  hu: '🇭🇺',
  ro: '🇷🇴',
  bg: '🇧🇬',
  el: '🇬🇷',
  hr: '🇭🇷',
  sl: '🇸🇮',
  et: '🇪🇪',
  lv: '🇱🇻',
  lt: '🇱🇹',
  ga: '🇮🇪',
  mt: '🇲🇹',
};

export function languageFlag(code: string): string {
  return isGameLanguage(code) ? GAME_LANGUAGE_FLAGS[code] : '🏳️';
}

/**
 * Naam van de taal in de taal van de beheeromgeving, bijvoorbeeld "Grieks"
 * (of "Greek" als de beheeromgeving in het Engels staat).
 */
export function languageName(code: string, uiLanguage: string = currentLanguage()): string {
  let name: string | undefined;
  try {
    name = new Intl.DisplayNames([uiLanguage], { type: 'language' }).of(code);
  } catch {
    name = undefined;
  }
  if (!name || name === code) return isGameLanguage(code) ? GAME_LANGUAGE_NAMES[code] : code.toUpperCase();
  return name.charAt(0).toLocaleUpperCase(uiLanguage) + name.slice(1);
}

/**
 * Volledige naam voor keuzelijsten en kopjes: vlag, naam in de taal van de
 * beheeromgeving en de eigen naam erachter als die anders is.
 * Bijvoorbeeld "🇬🇷 Grieks (Ελληνικά)".
 */
export function gameLanguageName(code: string, uiLanguage: string = currentLanguage()): string {
  const name = languageName(code, uiLanguage);
  const own = isGameLanguage(code) ? GAME_LANGUAGE_NAMES[code] : name;
  return own.toLocaleLowerCase() === name.toLocaleLowerCase() ? `${languageFlag(code)} ${name}` : `${languageFlag(code)} ${name} (${own})`;
}

/** Korte naam voor knoppen en lijstjes: vlag en naam, bijvoorbeeld "🇬🇷 Grieks". */
export function gameLanguageShort(code: string, uiLanguage: string = currentLanguage()): string {
  return `${languageFlag(code)} ${languageName(code, uiLanguage)}`;
}

/** Kleinste vorm voor smalle plekken (tabbladen, tabellen): vlag en code, bijvoorbeeld "🇬🇷 EL". */
export function gameLanguageTag(code: string): string {
  return `${languageFlag(code)} ${code.toUpperCase()}`;
}

/** Lijst van talen, bijvoorbeeld "🇳🇱 Nederlands, 🇬🇧 Engels". */
export function gameLanguageList(codes: readonly string[], uiLanguage: string = currentLanguage()): string {
  return codes.map((c) => gameLanguageShort(c, uiLanguage)).join(', ');
}
