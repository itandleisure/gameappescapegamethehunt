// Fotoboek voor de klant: welke foto's erin staan, in welke volgorde, hoe ze
// over de pagina's van de PDF worden verdeeld en de cijfers van de hunt.
// Zonder browser of database, zodat het met gewone tests te controleren is.
import { tKey, translate, isAdminLanguage, LOCALES, type AdminLanguage } from './i18n';
import type { PhotoRow } from './results';

/** Opdrachtsleutel van de teamfoto (zie Photowall). */
export const TEAM_PHOTO_KEY = '_teamfoto';

/** Hoe lang de klant het fotoboek kan bekijken na het delen. */
export const SHARE_DAYS = 28;

export type BookSource = 'game' | 'own' | 'stock';

export interface BookItem {
  /**
   * 'game': foto uit het spel (bucket photos); 'own': eigen foto van de
   * spelleiding bij deze hunt; 'stock': vaste algemene foto van de organisatie
   * (beide in bucket photobooks).
   */
  source: BookSource;
  path: string;
  caption: string;
  /** Groot: de foto krijgt een eigen pagina. */
  large?: boolean;
}

export interface Photobook {
  session_id: string;
  title: string;
  city: string;
  intro: string;
  items: BookItem[];
  /** Pagina "Jullie Hunt in cijfers" in het fotoboek. */
  show_ranking: boolean;
  language: AdminLanguage;
  pdf_path: string | null;
  pdf_made_at: string | null;
  share_token: string;
  share_password: string;
  shared: boolean;
  shared_until: string | null;
}

export interface BookLinks {
  video?: string;
  google_review?: string;
  website_review?: string;
  vacancy?: string;
  website?: string;
  email?: string;
  phone?: string;
  /** Website met alle spellen van Badass Games (knop op de slotpagina). */
  games?: string;
}

export const LINK_KEYS = ['video', 'google_review', 'website_review', 'vacancy', 'website', 'email', 'phone', 'games'] as const;

/** Zonder eigen link gaat de knop "Bekijk alle spellen" hierheen. */
export const DEFAULT_GAMES_URL = 'https://badassgames.nl';

/** Een ander spel van Badass Games, als blok op de slotpagina. */
export interface BookGame {
  name: string;
  text: string;
  url: string;
  /** Foto in de bucket photobooks, onder huisstijl/<organisatie>/. */
  image_path?: string | null;
}

/** De spellen zoals in het huidige fotoboek; aan te passen bij de vaste onderdelen. */
export const DEFAULT_GAMES: readonly BookGame[] = [
  {
    name: 'The Hundred',
    text: 'Verzamel als team precies 100 munten in 90 minuten. Te veel of te weinig is verliezen: strategie onder tijdsdruk.',
    url: 'https://badassgames.nl/the-hundred',
  },
  {
    name: 'Escapeboxen',
    text: 'Een complete escape-ervaring in een kist, met echte sloten, puzzels en onze GameApp. Speel hem overal: thuis, op kantoor of op locatie.',
    url: 'https://badassgames.nl/escapeboxen',
  },
  {
    name: 'Detective Game',
    text: 'Los als rechercheursteam drie mysteries op. Verzamel aanwijzingen, ondervraag vier verdachten en ontdek wie de waarheid spreekt.',
    url: 'https://badassgames.nl/detective-game',
  },
  {
    name: 'Boeven & Speurneuzen',
    text: 'Speurtocht voor kinderen: los als onderzoeksteam een inbraak in het gemeentehuis op en ontmasker de échte boef.',
    url: 'https://badassgames.nl/boeven-en-speurneuzen',
  },
];

/** Hooguit zoveel spellen op de slotpagina. */
export const MAX_GAMES = 4;

/** Vaste onderdelen van elk fotoboek, per organisatie. */
export interface PhotobookSettings {
  org_id: string;
  cover_path: string | null;
  stock_paths: string[];
  links: BookLinks;
  /** De andere spellen op de slotpagina. */
  games: BookGame[];
}

/**
 * Leest de spellen uit de database. Nog nooit ingesteld (null): de spellen van
 * het huidige fotoboek. Een lege lijst: geen blokken met spellen.
 */
export function parseGames(value: unknown): BookGame[] {
  if (value === null || value === undefined) return DEFAULT_GAMES.map((g) => ({ ...g }));
  if (!Array.isArray(value)) return [];
  return value
    .flatMap((v): BookGame[] => {
      if (!v || typeof v !== 'object') return [];
      const o = v as Record<string, unknown>;
      const name = typeof o.name === 'string' ? o.name.trim() : '';
      if (!name) return [];
      return [
        {
          name,
          text: typeof o.text === 'string' ? o.text.trim() : '',
          url: typeof o.url === 'string' ? o.url.trim() : '',
          image_path: typeof o.image_path === 'string' && o.image_path ? o.image_path : null,
        },
      ];
    })
    .slice(0, MAX_GAMES);
}

/** Vaste teksten in de PDF en op de klantpagina; vertaald in de taal van het fotoboek. */
export const BOOK_TEXT = {
  missionDone: tKey('Missie volbracht'),
  thanksFor: tKey('Bedankt voor het spelen van'),
  huntIn: tKey('Escape Game The Hunt in'),
  statsTitle: tKey('Jullie Hunt in cijfers'),
  statsIntro: tKey(
    'Alle teams zijn de stad door gerend, op de vlucht voor de Hunters. Zo ver zijn jullie gekomen, helemaal te voet: goed voor de conditie en goed voor de lucht in de stad.',
  ),
  avgKm: tKey('gemiddeld gelopen per team'),
  stepsPP: tKey('stappen per persoon, gemiddeld'),
  totalKm: tKey('samen gelopen door {n} teams'),
  co2Saved: tKey('CO2 bespaard ten opzichte van de auto'),
  team: tKey('Team'),
  km: tKey('Km'),
  steps: tKey('Stappen p.p.'),
  kcal: tKey('Kcal p.p.'),
  co2: tKey('Kg CO2 bespaard'),
  together: tKey('Samen'),
  footnote: tKey('Indicatief: 1.350 stappen en 55 kcal per km per persoon, 0,18 kg CO2 per autokilometer, één auto per team.'),
  videoTitle: tKey('Beleef het nog een keer'),
  videoText: tKey('Bekijk de video van Escape Game The Hunt.'),
  videoLink: tKey('Bekijk de video'),
  groupPhoto: tKey('Groepsfoto'),
  yourPhotos: tKey("Jullie foto's"),
  reviewTitle: tKey('Laat een review achter'),
  reviewText: tKey(
    'Vonden jullie het een topdag? Laat dan een review achter, dat helpt ons enorm. Op Google of via onze website: het kost je een minuutje.',
  ),
  googleReview: tKey('Google-review'),
  scanReview: tKey('Scan voor een Google-review'),
  websiteReview: tKey('Review via onze website'),
  vacancyLabel: tKey('Gezocht: Hunters'),
  vacancyTitle: tKey('Wij zijn op jacht naar nieuwe Hunters!'),
  vacancyText: tKey(
    'We zoeken spelleiders in heel Nederland: groepen ontvangen, het spel uitleggen en daarna als Hunter de jacht openen. Een bijbaan vol actie, in de eigen stad.',
  ),
  vacancyAsk: tKey('Ken jij iemand die dit op het lijf geschreven is? Stuur de vacature door!'),
  vacancyLink: tKey('Stuur de vacature door'),
  thanks: tKey('Bedankt voor het spelen!'),
  thanksText: tKey('We hopen dat jullie een geweldige tijd hebben gehad. Graag tot de volgende hunt!'),
  moreGames: tKey('Meer spellen van Badass Games'),
  moreGamesText: tKey('Zin in meer? Badass Games maakt nog meer spellen voor groepen, teams en families.'),
  allGames: tKey('Bekijk alle spellen'),
  download: tKey('Download het fotoboek (PDF)'),
  downloadZip: tKey("Download alle foto's (zip)"),
  zipping: tKey("Foto's verzamelen… {n} van {total}"),
  password: tKey('Wachtwoord'),
  open: tKey('Openen'),
  passwordAsk: tKey('Vul het wachtwoord in dat jullie bij de link hebben gekregen.'),
  wrongPassword: tKey('Dit wachtwoord klopt niet.'),
  notFound: tKey('Dit fotoboek is niet (meer) gedeeld. Vraag de organisatie om een nieuwe link.'),
  expired: tKey('Dit fotoboek is niet meer beschikbaar. Vraag de organisatie om het opnieuw te delen.'),
  availableUntil: tKey('Te bekijken en te downloaden tot {date}.'),
};

export type BookTextKey = keyof typeof BOOK_TEXT;

export function bookText(lang: string, key: BookTextKey, vars?: Record<string, string | number>): string {
  return translate(isAdminLanguage(lang) ? lang : 'nl', BOOK_TEXT[key], vars);
}

/** Onderschrift van een spelfoto: teamnaam, en bij een opdracht ook de titel. */
export function gameCaption(photo: Pick<PhotoRow, 'task_key'>, teamName: string, taskTitle: string): string {
  if (photo.task_key === TEAM_PHOTO_KEY || !taskTitle) return teamName;
  return `${teamName} · ${taskTitle}`;
}

/** Merk voor de voettekst en de voorkant. */
export const BRAND = 'Escape Game The Hunt';

/** Voettekst van de pagina's: "ESCAPE GAME THE HUNT · AMSTERDAM". */
export function footerText(city: string): string {
  const c = city.trim();
  return `${BRAND}${c ? ` · ${c}` : ''}`.toUpperCase();
}

/** Hebben de spelers minder foto's dan dit, dan vullen de vaste foto's aan tot dit aantal. */
export const MIN_PHOTOS = 8;

/**
 * Eerste opzet van het fotoboek: eerst de groepsfoto (de teamfoto van het
 * beste team, groot op een eigen pagina; een andere kies je in de
 * beheerapp), dan de andere teamfoto's (in volgorde van de ranglijst) en de
 * opdrachtfoto's per team op tijd. Hebben de spelers weinig foto's, dan vullen
 * de vaste foto's van de organisatie aan tot MIN_PHOTOS.
 */
export function defaultItems(
  photos: readonly PhotoRow[],
  teamOrder: readonly string[],
  caption: (photo: PhotoRow) => string,
  stockPaths: readonly string[] = [],
): BookItem[] {
  const order = new Map(teamOrder.map((id, i) => [id, i]));
  const sorted = [...photos].sort(
    (a, b) =>
      Number(b.task_key === TEAM_PHOTO_KEY) - Number(a.task_key === TEAM_PHOTO_KEY) ||
      (order.get(a.team_id) ?? Infinity) - (order.get(b.team_id) ?? Infinity) ||
      a.team_id.localeCompare(b.team_id) ||
      a.created_at.localeCompare(b.created_at),
  );
  const game = sorted.map((p, i): BookItem => ({
    source: 'game',
    path: p.path,
    caption: caption(p),
    ...(i === 0 && p.task_key === TEAM_PHOTO_KEY ? { large: true } : {}),
  }));
  const fill = Math.max(0, MIN_PHOTOS - game.length);
  return [...game, ...stockPaths.slice(0, fill).map((path): BookItem => ({ source: 'stock', path, caption: '' }))];
}

/** De groepsfoto: de eerste foto, als die groot is. */
export function groupPhotoIndex(items: readonly BookItem[]): number {
  return items[0]?.large ? 0 : -1;
}

/**
 * Maakt een foto de groepsfoto: vooraan en groot. De vorige groepsfoto blijft
 * in het fotoboek, als gewone foto op de plek waar de nieuwe stond.
 */
export function setGroupPhoto(items: readonly BookItem[], index: number): BookItem[] {
  if (index < 0 || index >= items.length) return [...items];
  const next = items.map((it) => ({ ...it }));
  const chosen = { ...next[index]!, large: true };
  if (index === 0) {
    next[0] = chosen;
    return next;
  }
  if (next[0]!.large) delete next[0]!.large;
  next.splice(index, 1);
  return [chosen, ...next];
}

/** Spelfoto's die (nog) niet in het fotoboek staan, bijvoorbeeld foto's die later binnenkwamen. */
export function unusedGamePhotos(items: readonly BookItem[], photos: readonly PhotoRow[]): PhotoRow[] {
  const used = new Set(items.filter((i) => i.source === 'game').map((i) => i.path));
  return photos.filter((p) => !used.has(p.path));
}

/** Verplaatst een foto naar een andere plek in de volgorde. */
export function moveItem<T>(list: readonly T[], from: number, to: number): T[] {
  if (from === to || from < 0 || from >= list.length) return [...list];
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(Math.max(0, Math.min(to, next.length)), 0, item!);
  return next;
}

const SOURCES: readonly string[] = ['game', 'own', 'stock'];

/** Leest de items uit de database en laat onbruikbare rijen weg. */
export function parseItems(value: unknown): BookItem[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((v): BookItem[] => {
    if (!v || typeof v !== 'object') return [];
    const o = v as Record<string, unknown>;
    if (!SOURCES.includes(o.source as string) || typeof o.path !== 'string' || !o.path) return [];
    return [
      {
        source: o.source as BookSource,
        path: o.path,
        caption: typeof o.caption === 'string' ? o.caption : '',
        ...(o.large === true ? { large: true } : {}),
      },
    ];
  });
}

/** Leest de links uit de database: alleen bekende sleutels met tekst. */
export function parseLinks(value: unknown): BookLinks {
  const out: BookLinks = {};
  if (!value || typeof value !== 'object') return out;
  for (const key of LINK_KEYS) {
    const v = (value as Record<string, unknown>)[key];
    if (typeof v === 'string' && v.trim()) out[key] = v.trim();
  }
  return out;
}

/** Maakt van "www.site.nl" een klikbare link; e-mail en telefoon worden mailto: en tel:. */
export function href(kind: 'url' | 'email' | 'phone', value: string): string {
  const v = value.trim();
  if (kind === 'email') return `mailto:${v}`;
  if (kind === 'phone') return `tel:${v.replace(/[^\d+]/g, '')}`;
  return /^https?:\/\//i.test(v) ? v : `https://${v}`;
}

/** Link zonder https:// en www., zoals hij in de PDF staat. */
export function displayUrl(value: string): string {
  return value.trim().replace(/^https?:\/\//i, '').replace(/^www\./i, '').replace(/\/$/, '');
}

// -----------------------------------------------------------------------------
// Jullie Hunt in cijfers
// -----------------------------------------------------------------------------

/** Zelfde vuistregels als in het huidige fotoboek. */
export const STEPS_PER_KM = 1350;
export const KCAL_PER_KM = 55;
export const CO2_KG_PER_CAR_KM = 0.18;

export interface TeamStat {
  name: string;
  km: number;
  stepsPP: number;
  kcalPP: number;
  co2Kg: number;
}

export interface HuntStats {
  teams: TeamStat[];
  totalKm: number;
  avgKm: number;
  avgStepsPP: number;
  totalCo2Kg: number;
}

/**
 * Cijfers per team uit de gelopen afstand: stappen en kcal per persoon,
 * en CO2 die een auto per team over dezelfde afstand had uitgestoten.
 * Teams zonder gelopen afstand tellen niet mee. Meeste kilometers eerst.
 */
export function huntStats(teams: readonly { name: string; distanceM: number | null }[]): HuntStats {
  const list = teams
    .filter((t) => (t.distanceM ?? 0) > 0)
    .map((t): TeamStat => {
      const km = (t.distanceM ?? 0) / 1000;
      return {
        name: t.name,
        km,
        stepsPP: Math.round(km * STEPS_PER_KM),
        kcalPP: Math.round(km * KCAL_PER_KM),
        co2Kg: km * CO2_KG_PER_CAR_KM,
      };
    })
    .sort((a, b) => b.km - a.km || a.name.localeCompare(b.name));
  const totalKm = list.reduce((s, t) => s + t.km, 0);
  const n = list.length;
  return {
    teams: list,
    totalKm,
    avgKm: n ? totalKm / n : 0,
    avgStepsPP: n ? Math.round(list.reduce((s, t) => s + t.stepsPP, 0) / n) : 0,
    totalCo2Kg: list.reduce((s, t) => s + t.co2Kg, 0),
  };
}

/** Getal in de taal van het fotoboek: 3941 → "3.941", 2.94 → "2,9". */
export function formatNumber(lang: string, value: number, decimals = 0): string {
  const locale = LOCALES[isAdminLanguage(lang) ? lang : 'nl'];
  return value.toLocaleString(locale, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

// -----------------------------------------------------------------------------
// Opmaak van de fotopagina's
// -----------------------------------------------------------------------------

/** Hooguit zoveel gewone foto's op één pagina. */
export const PER_PAGE = 4;

/**
 * Verdeelt de foto's over pagina's, in de gekozen volgorde: een grote foto
 * krijgt een eigen pagina, gewone foto's komen met hooguit vier op een pagina.
 * Komen er bij het einde 1 of 2 te veel, dan verdeelt de laatste pagina's
 * zich gelijkmatiger (5 → 3 + 2 in plaats van 4 + 1).
 */
export function paginate<T extends { large?: boolean }>(items: readonly T[]): T[][] {
  const pages: T[][] = [];
  let run: T[] = [];
  const flush = () => {
    let rest = run;
    while (rest.length > 0) {
      const take = rest.length === 5 ? 3 : Math.min(PER_PAGE, rest.length);
      pages.push(rest.slice(0, take));
      rest = rest.slice(take);
    }
    run = [];
  };
  for (const item of items) {
    if (item.large) {
      flush();
      pages.push([item]);
    } else run.push(item);
  }
  flush();
  return pages;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Vakken voor 1 tot 4 foto's binnen een gebied (coördinaten met y omhoog,
 * zoals in een PDF). 1: het hele vlak; 2: boven elkaar (staand vlak) of naast
 * elkaar (liggend vlak); 3: één breed boven en twee eronder; 4: twee bij twee.
 * Volgorde: zoals je leest.
 */
export function slots(count: number, area: Rect, gap: number): Rect[] {
  const { x, y, w, h } = area;
  const halfW = (w - gap) / 2;
  const halfH = (h - gap) / 2;
  const top = y + halfH + gap;
  switch (count) {
    case 1:
      return [{ ...area }];
    case 2:
      return h > w
        ? [
            { x, y: top, w, h: halfH },
            { x, y, w, h: halfH },
          ]
        : [
            { x, y, w: halfW, h },
            { x: x + halfW + gap, y, w: halfW, h },
          ];
    case 3:
      return [
        { x, y: top, w, h: halfH },
        { x, y, w: halfW, h: halfH },
        { x: x + halfW + gap, y, w: halfW, h: halfH },
      ];
    default:
      return [
        { x, y: top, w: halfW, h: halfH },
        { x: x + halfW + gap, y: top, w: halfW, h: halfH },
        { x, y, w: halfW, h: halfH },
        { x: x + halfW + gap, y, w: halfW, h: halfH },
      ].slice(0, Math.max(0, count));
  }
}

/**
 * Uitsnede van een foto om een vak helemaal te vullen (zoals object-fit:
 * cover), in pixels van de foto. Iets boven het midden, zodat hoofden op
 * groepsfoto's er minder snel af vallen.
 */
export function coverCrop(imgW: number, imgH: number, boxW: number, boxH: number): { sx: number; sy: number; sw: number; sh: number } {
  const target = boxW / boxH;
  if (imgW / imgH > target) {
    const sw = imgH * target;
    return { sx: (imgW - sw) / 2, sy: 0, sw, sh: imgH };
  }
  const sh = imgW / target;
  return { sx: 0, sy: (imgH - sh) * 0.35, sw: imgW, sh };
}

/** Knipt tekst op in regels die binnen maxWidth passen (breedte via measure). */
export function wrapText(text: string, maxWidth: number, measure: (s: string) => number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split(/\r?\n/)) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      lines.push('');
      continue;
    }
    let line = '';
    for (const word of words) {
      const next = line ? `${line} ${word}` : word;
      if (measure(next) <= maxWidth || !line) line = next;
      else {
        lines.push(line);
        line = word;
      }
    }
    lines.push(line);
  }
  return lines;
}

function slug(text: string, max = 60): string {
  return text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, max);
}

/** Bestandsnaam voor de PDF, bijvoorbeeld "fotoboek-bedrijfsuitje-acme.pdf". */
export function pdfFileName(title: string): string {
  const s = slug(title);
  return `fotoboek${s ? `-${s}` : ''}.pdf`;
}

/** Bestandsnaam voor de zip met alle foto's. */
export function zipFileName(title: string): string {
  const s = slug(title);
  return `fotos${s ? `-${s}` : ''}.zip`;
}

/** Namen van de foto's in de zip, op volgorde en uniek: "01-vossen.jpg". */
export function zipEntryNames(items: readonly Pick<BookItem, 'caption'>[]): string[] {
  const width = Math.max(2, String(items.length).length);
  return items.map((item, i) => {
    const s = slug(item.caption, 40);
    return `${String(i + 1).padStart(width, '0')}${s ? `-${s}` : ''}.jpg`;
  });
}

/** Tekst voor de e-mail aan de klant, met link, wachtwoord en hoe lang het fotoboek te zien is. */
export function mailBody(
  lang: string,
  title: string,
  link: string,
  password: string,
  until: string | null,
): { subject: string; body: string } {
  const l = isAdminLanguage(lang) ? lang : 'nl';
  const tr = (nl: string, vars?: Record<string, string>) => translate(l, nl, vars);
  const date = until ? new Intl.DateTimeFormat(LOCALES[l], { dateStyle: 'long' }).format(new Date(until)) : '';
  return {
    subject: tr(MAIL.subject, { title }),
    body: [
      tr(MAIL.hello),
      tr(MAIL.text),
      `${link}\n${tr(MAIL.password, { password })}`,
      ...(date ? [tr(MAIL.until, { date })] : []),
      `${tr(MAIL.bye)}\nEscape Game The Hunt`,
    ].join('\n\n'),
  };
}

const MAIL = {
  subject: tKey('Jullie fotoboek: {title}'),
  hello: tKey('Hallo,'),
  text: tKey("Bedankt voor het spelen van Escape Game The Hunt! Via deze link vinden jullie de foto's van de dag en het fotoboek om te downloaden:"),
  password: tKey('Wachtwoord: {password}'),
  until: tKey("Het fotoboek en de foto's zijn te bekijken en te downloaden tot {date}."),
  bye: tKey('Met vriendelijke groet,'),
};
