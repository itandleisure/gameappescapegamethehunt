// Algemene instellingen van een organisatie (menu Instellingen): bedrijf en
// logo, standaard voor nieuwe tickets, standaard voor de spellen, per land de
// taal en tijdzone, en het fotoboek. Ze gelden voor alles van de organisatie.
// Zonder browser of database, zodat het met gewone tests te controleren is.
import {
  DEFAULT_BOUNDARY_COLOR,
  DEFAULT_HUNTER_ALERT_RADIUS,
  DEFAULT_MAP_SOURCE,
  DEFAULT_MEETING_RADIUS,
  DEFAULT_OUTSIDE_COLOR,
  DEFAULT_OUTSIDE_OPACITY,
  MAP_STYLES,
  MAX_HUNTER_ALERT_RADIUS,
  type GamePackage,
  type MapSource,
} from '@hunt/engine';
import { GAME_LANGUAGES } from './game-languages';
import { ADMIN_LANGUAGES, type AdminLanguage } from './i18n';
import { EDITABLE_BOOK_TEXTS, type BookBrand, type BookLinks, type BookTextKey } from './photobook';

export interface CompanySettings {
  /** Naam van het spel/merk, zoals op het fotoboek: "Escape Game The Hunt". */
  name: string;
  /** Naam van de groep met de andere spellen: "Badass Games". */
  group: string;
  /** Logo (licht, voor een donkere achtergrond) in de bucket photobooks, onder huisstijl/<organisatie>/. */
  logo_path: string | null;
  website: string;
  email: string;
  phone: string;
}

export interface TicketSettings {
  timezone: string;
  track_count: number;
  team_chat: boolean;
  test_mode: boolean;
}

export interface GameSettings {
  /** GPS-metingen die onnauwkeuriger zijn dan dit (meters) tellen niet mee. */
  max_accuracy: number;
  /** Seconden na "Nee" op een bevestigingsvraag voordat de vraag terugkomt. */
  decline_seconds: number;
  /** Cirkel om het verzamelpunt (meters), als het spel zelf niets kiest. */
  meeting_radius: number;
  /** Teams waarschuwen als een Hunter binnen zoveel meter is (0 = uit), als het spel zelf niets kiest. */
  hunter_alert_radius: number;
  /** Kaartstijl (id uit MAP_STYLES), als het spel zelf niets kiest. */
  map_style: string;
  boundary_color: string;
  outside_color: string;
  /** 0 tot 1. */
  outside_opacity: number;
}

export interface CountrySettings {
  /** Landcode, bijvoorbeeld ES. */
  country: string;
  /** Taal van de spellen in dat land (code uit GAME_LANGUAGES). */
  language: string;
  timezone: string;
}

export type BookTexts = Partial<Record<AdminLanguage, Partial<Record<BookTextKey, string>>>>;

export interface PhotobookExtraSettings {
  /** Hoe lang de klant het fotoboek kan bekijken na het delen. */
  share_days: number;
  /** Hebben de spelers minder foto's, dan vullen de vaste foto's aan tot dit aantal. */
  min_photos: number;
  /** Eigen teksten per taal; leeg = de standaardtekst. */
  texts: BookTexts;
}

export interface OrgSettings {
  company: CompanySettings;
  tickets: TicketSettings;
  games: GameSettings;
  /** Landen met hun taal en tijdzone, in de volgorde van de lijst. */
  countries: CountrySettings[];
  photobook: PhotobookExtraSettings;
}

export const DEFAULT_COMPANY: CompanySettings = {
  name: 'Escape Game The Hunt',
  group: 'Badass Games',
  logo_path: null,
  website: '',
  email: '',
  phone: '',
};

export const DEFAULT_SETTINGS: OrgSettings = {
  company: DEFAULT_COMPANY,
  tickets: { timezone: 'Europe/Amsterdam', track_count: 5, team_chat: false, test_mode: false },
  games: {
    max_accuracy: 30,
    decline_seconds: 20,
    meeting_radius: DEFAULT_MEETING_RADIUS,
    hunter_alert_radius: DEFAULT_HUNTER_ALERT_RADIUS,
    map_style: MAP_STYLES[0]!.id,
    boundary_color: DEFAULT_BOUNDARY_COLOR,
    outside_color: DEFAULT_OUTSIDE_COLOR,
    outside_opacity: DEFAULT_OUTSIDE_OPACITY,
  },
  countries: [{ country: 'NL', language: 'nl', timezone: 'Europe/Amsterdam' }],
  photobook: { share_days: 28, min_photos: 8, texts: {} },
};

/** Grenzen van de getallen, ook voor de invoervelden. */
export const LIMITS = {
  track_count: [1, 50],
  max_accuracy: [10, 100],
  decline_seconds: [5, 300],
  meeting_radius: [5, 200],
  hunter_alert_radius: [0, MAX_HUNTER_ALERT_RADIUS],
  share_days: [1, 365],
  min_photos: [0, 40],
} as const satisfies Record<string, readonly [number, number]>;

/** Per land de voor de hand liggende taal en tijdzone (voorstel bij "Land toevoegen"). */
export const COUNTRY_DEFAULTS: Record<string, { language: string; timezone: string }> = {
  AD: { language: 'es', timezone: 'Europe/Andorra' },
  AL: { language: 'en', timezone: 'Europe/Tirane' },
  AT: { language: 'de', timezone: 'Europe/Vienna' },
  BA: { language: 'hr', timezone: 'Europe/Sarajevo' },
  BE: { language: 'nl', timezone: 'Europe/Brussels' },
  BG: { language: 'bg', timezone: 'Europe/Sofia' },
  BY: { language: 'en', timezone: 'Europe/Minsk' },
  CH: { language: 'de', timezone: 'Europe/Zurich' },
  CY: { language: 'el', timezone: 'Asia/Nicosia' },
  CZ: { language: 'cs', timezone: 'Europe/Prague' },
  DE: { language: 'de', timezone: 'Europe/Berlin' },
  DK: { language: 'da', timezone: 'Europe/Copenhagen' },
  EE: { language: 'et', timezone: 'Europe/Tallinn' },
  ES: { language: 'es', timezone: 'Europe/Madrid' },
  FI: { language: 'fi', timezone: 'Europe/Helsinki' },
  FR: { language: 'fr', timezone: 'Europe/Paris' },
  GB: { language: 'en', timezone: 'Europe/London' },
  GR: { language: 'el', timezone: 'Europe/Athens' },
  HR: { language: 'hr', timezone: 'Europe/Zagreb' },
  HU: { language: 'hu', timezone: 'Europe/Budapest' },
  IE: { language: 'en', timezone: 'Europe/Dublin' },
  IS: { language: 'en', timezone: 'Atlantic/Reykjavik' },
  IT: { language: 'it', timezone: 'Europe/Rome' },
  LI: { language: 'de', timezone: 'Europe/Vaduz' },
  LT: { language: 'lt', timezone: 'Europe/Vilnius' },
  LU: { language: 'fr', timezone: 'Europe/Luxembourg' },
  LV: { language: 'lv', timezone: 'Europe/Riga' },
  MC: { language: 'fr', timezone: 'Europe/Monaco' },
  MD: { language: 'ro', timezone: 'Europe/Chisinau' },
  ME: { language: 'hr', timezone: 'Europe/Podgorica' },
  MK: { language: 'en', timezone: 'Europe/Skopje' },
  MT: { language: 'en', timezone: 'Europe/Malta' },
  NL: { language: 'nl', timezone: 'Europe/Amsterdam' },
  NO: { language: 'no', timezone: 'Europe/Oslo' },
  PL: { language: 'pl', timezone: 'Europe/Warsaw' },
  PT: { language: 'pt', timezone: 'Europe/Lisbon' },
  RO: { language: 'ro', timezone: 'Europe/Bucharest' },
  RS: { language: 'en', timezone: 'Europe/Belgrade' },
  RU: { language: 'en', timezone: 'Europe/Moscow' },
  SE: { language: 'sv', timezone: 'Europe/Stockholm' },
  SI: { language: 'sl', timezone: 'Europe/Ljubljana' },
  SK: { language: 'sk', timezone: 'Europe/Bratislava' },
  SM: { language: 'it', timezone: 'Europe/San_Marino' },
  UA: { language: 'en', timezone: 'Europe/Kyiv' },
  VA: { language: 'it', timezone: 'Europe/Vatican' },
  XK: { language: 'en', timezone: 'Europe/Belgrade' },
};

/** Taal en tijdzone voor een land: uit de lijst van de organisatie, anders het voorstel. */
export function countrySettings(settings: OrgSettings, country: string): CountrySettings {
  const own = settings.countries.find((c) => c.country === country);
  if (own) return own;
  const d = COUNTRY_DEFAULTS[country];
  return { country, language: d?.language ?? 'en', timezone: d?.timezone ?? settings.tickets.timezone };
}

// -----------------------------------------------------------------------------
// Inlezen (alles wat ontbreekt of niet klopt wordt de standaard)
// -----------------------------------------------------------------------------

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const str = (v: unknown, fallback: string, max = 300): string => (typeof v === 'string' ? v.trim().slice(0, max) : fallback);
const bool = (v: unknown, fallback: boolean): boolean => (typeof v === 'boolean' ? v : fallback);
const num = (v: unknown, fallback: number, [min, max]: readonly [number, number], whole = true): number => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v) : NaN;
  if (!Number.isFinite(n)) return fallback;
  const c = Math.min(max, Math.max(min, n));
  return whole ? Math.round(c) : c;
};
const color = (v: unknown, fallback: string): string => (typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v.trim()) ? v.trim().toLowerCase() : fallback);

/** Is dit een tijdzone die de browser (en dus de database) kent? */
export function isTimezone(zone: string): boolean {
  try {
    new Intl.DateTimeFormat('en', { timeZone: zone });
    return !!zone;
  } catch {
    return false;
  }
}
const zone = (v: unknown, fallback: string): string => (typeof v === 'string' && isTimezone(v.trim()) ? v.trim() : fallback);

export function parseSettings(value: unknown): OrgSettings {
  const d = DEFAULT_SETTINGS;
  const root = obj(value);
  const c = obj(root.company);
  const tk = obj(root.tickets);
  const g = obj(root.games);
  const pb = obj(root.photobook);
  const languages: readonly string[] = GAME_LANGUAGES;

  const seen = new Set<string>();
  const countries = Array.isArray(root.countries)
    ? root.countries.flatMap((x): CountrySettings[] => {
        const o = obj(x);
        const code = typeof o.country === 'string' ? o.country.trim().toUpperCase() : '';
        if (!COUNTRY_DEFAULTS[code] || seen.has(code)) return [];
        seen.add(code);
        const fallback = COUNTRY_DEFAULTS[code]!;
        return [
          {
            country: code,
            language: typeof o.language === 'string' && languages.includes(o.language) ? o.language : fallback.language,
            timezone: zone(o.timezone, fallback.timezone),
          },
        ];
      })
    : d.countries;

  const texts: BookTexts = {};
  const rawTexts = obj(pb.texts);
  for (const lang of ADMIN_LANGUAGES) {
    const per = obj(rawTexts[lang]);
    const out: Partial<Record<BookTextKey, string>> = {};
    for (const key of EDITABLE_BOOK_TEXTS) {
      const v = per[key];
      if (typeof v === 'string' && v.trim()) out[key] = v.trim().slice(0, 1000);
    }
    if (Object.keys(out).length) texts[lang] = out;
  }

  return {
    company: {
      name: str(c.name, '', 80) || d.company.name,
      group: str(c.group, '', 80) || d.company.group,
      logo_path: typeof c.logo_path === 'string' && c.logo_path ? c.logo_path : null,
      website: str(c.website, ''),
      email: str(c.email, ''),
      phone: str(c.phone, '', 40),
    },
    tickets: {
      timezone: zone(tk.timezone, d.tickets.timezone),
      track_count: num(tk.track_count, d.tickets.track_count, LIMITS.track_count),
      team_chat: bool(tk.team_chat, d.tickets.team_chat),
      test_mode: bool(tk.test_mode, d.tickets.test_mode),
    },
    games: {
      max_accuracy: num(g.max_accuracy, d.games.max_accuracy, LIMITS.max_accuracy),
      decline_seconds: num(g.decline_seconds, d.games.decline_seconds, LIMITS.decline_seconds),
      meeting_radius: num(g.meeting_radius, d.games.meeting_radius, LIMITS.meeting_radius),
      hunter_alert_radius: num(g.hunter_alert_radius, d.games.hunter_alert_radius, LIMITS.hunter_alert_radius),
      map_style: typeof g.map_style === 'string' && MAP_STYLES.some((s) => s.id === g.map_style) ? g.map_style : d.games.map_style,
      boundary_color: color(g.boundary_color, d.games.boundary_color),
      outside_color: color(g.outside_color, d.games.outside_color),
      outside_opacity: num(g.outside_opacity, d.games.outside_opacity, [0, 1], false),
    },
    countries,
    photobook: {
      share_days: num(pb.share_days, d.photobook.share_days, LIMITS.share_days),
      min_photos: num(pb.min_photos, d.photobook.min_photos, LIMITS.min_photos),
      texts,
    },
  };
}

// -----------------------------------------------------------------------------
// Toepassen op een spel bij het publiceren
// -----------------------------------------------------------------------------

/** De kaartstijl die een spel zonder eigen keuze krijgt. */
export function defaultMapSource(games: GameSettings): MapSource {
  return MAP_STYLES.find((s) => s.id === games.map_style)?.source ?? DEFAULT_MAP_SOURCE;
}

/**
 * Zet de algemene spelinstellingen in het spelpakket. GPS-nauwkeurigheid en de
 * wachttijd na "Nee" gelden voor elk spel; kaartstijl, kleuren van het
 * speelveld, de cirkel om het verzamelpunt en de afstand voor "Hunter in de
 * buurt" alleen als het spel daar zelf niets voor gekozen heeft.
 */
export function applyGameSettings(pkg: GamePackage, games: GameSettings): GamePackage {
  const out: GamePackage = {
    ...pkg,
    gps: { ...pkg.gps, maxAccuracy: games.max_accuracy, declineSeconds: games.decline_seconds },
  };
  if (!pkg.map && games.map_style !== DEFAULT_SETTINGS.games.map_style) out.map = defaultMapSource(games);
  if (!pkg.hunterAlert) out.hunterAlert = { radius: games.hunter_alert_radius };
  if (pkg.meetingPoint && pkg.meetingPoint.radius === undefined) out.meetingPoint = { ...pkg.meetingPoint, radius: games.meeting_radius };
  if (pkg.boundary) {
    out.boundary = {
      ...pkg.boundary,
      color: pkg.boundary.color ?? games.boundary_color,
      outsideColor: pkg.boundary.outsideColor ?? games.outside_color,
      outsideOpacity: pkg.boundary.outsideOpacity ?? games.outside_opacity,
    };
  }
  return out;
}

// -----------------------------------------------------------------------------
// Fotoboek
// -----------------------------------------------------------------------------

/** Naam, groep en eigen teksten voor het fotoboek. */
export function bookBrand(settings: OrgSettings): BookBrand {
  return { name: settings.company.name, group: settings.company.group, texts: settings.photobook.texts };
}

/** De links van het fotoboek met de contactgegevens van het bedrijf erbij (die gaan voor). */
export function withContact(links: BookLinks, company: CompanySettings): BookLinks {
  const out: BookLinks = { ...links };
  if (company.website) out.website = company.website;
  if (company.email) out.email = company.email;
  if (company.phone) out.phone = company.phone;
  return out;
}
