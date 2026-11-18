// Fotoboek voor de klant: welke foto's erin staan, in welke volgorde, en hoe
// ze over de pagina's van de PDF worden verdeeld. Zonder browser of database,
// zodat het met gewone tests te controleren is.
import { tKey, translate, isAdminLanguage, type AdminLanguage } from './i18n';
import type { PhotoRow } from './results';

/** Opdrachtsleutel van de teamfoto (zie Photowall). */
export const TEAM_PHOTO_KEY = '_teamfoto';

export interface BookItem {
  /** 'game': foto uit het spel (bucket photos); 'own': eigen foto van de spelleiding (bucket photobooks). */
  source: 'game' | 'own';
  path: string;
  caption: string;
  /** Groot: de foto krijgt een eigen pagina. */
  large?: boolean;
}

export interface Photobook {
  session_id: string;
  title: string;
  intro: string;
  items: BookItem[];
  show_ranking: boolean;
  language: AdminLanguage;
  pdf_path: string | null;
  pdf_made_at: string | null;
  share_token: string;
  shared: boolean;
}

/** Vaste teksten in de PDF en op de klantpagina; vertaald in de taal van het fotoboek. */
export const BOOK_TEXT = {
  ranking: tKey('Ranglijst'),
  place: tKey('Plaats'),
  team: tKey('Team'),
  points: tKey('Punten'),
  time: tKey('Speeltijd'),
  thanks: tKey('Bedankt voor het spelen!'),
  thanksText: tKey('We hopen dat jullie een geweldige tijd hebben gehad. Graag tot de volgende hunt!'),
  photos: tKey("Foto's"),
  download: tKey('Download het fotoboek (PDF)'),
  page: tKey('Pagina {n}'),
};

export function bookText(lang: string, key: keyof typeof BOOK_TEXT, vars?: Record<string, string | number>): string {
  return translate(isAdminLanguage(lang) ? lang : 'nl', BOOK_TEXT[key], vars);
}

/** Onderschrift van een spelfoto: teamnaam, en bij een opdracht ook de titel. */
export function gameCaption(photo: Pick<PhotoRow, 'task_key'>, teamName: string, taskTitle: string): string {
  if (photo.task_key === TEAM_PHOTO_KEY || !taskTitle) return teamName;
  return `${teamName} · ${taskTitle}`;
}

/**
 * Eerste opzet van het fotoboek: per team (in volgorde van de ranglijst) eerst
 * de teamfoto, dan de opdrachtfoto's op tijd. Teamfoto's komen groot.
 */
export function defaultItems(
  photos: readonly PhotoRow[],
  teamOrder: readonly string[],
  caption: (photo: PhotoRow) => string,
): BookItem[] {
  const order = new Map(teamOrder.map((id, i) => [id, i]));
  const sorted = [...photos].sort(
    (a, b) =>
      (order.get(a.team_id) ?? Infinity) - (order.get(b.team_id) ?? Infinity) ||
      a.team_id.localeCompare(b.team_id) ||
      Number(b.task_key === TEAM_PHOTO_KEY) - Number(a.task_key === TEAM_PHOTO_KEY) ||
      a.created_at.localeCompare(b.created_at),
  );
  return sorted.map((p) => ({
    source: 'game',
    path: p.path,
    caption: caption(p),
    ...(p.task_key === TEAM_PHOTO_KEY ? { large: true } : {}),
  }));
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

/** Leest de items uit de database en laat onbruikbare rijen weg. */
export function parseItems(value: unknown): BookItem[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((v): BookItem[] => {
    if (!v || typeof v !== 'object') return [];
    const o = v as Record<string, unknown>;
    if ((o.source !== 'game' && o.source !== 'own') || typeof o.path !== 'string' || !o.path) return [];
    return [{ source: o.source, path: o.path, caption: typeof o.caption === 'string' ? o.caption : '', ...(o.large === true ? { large: true } : {}) }];
  });
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
 * zoals in een PDF). 1: het hele vlak; 2: naast elkaar; 3: één groot links en
 * twee rechts boven elkaar; 4: twee bij twee. Volgorde: zoals je leest.
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
      return [
        { x, y, w: halfW, h },
        { x: x + halfW + gap, y, w: halfW, h },
      ];
    case 3: {
      const bigW = (w - gap) * 0.6;
      const smallW = w - gap - bigW;
      return [
        { x, y, w: bigW, h },
        { x: x + bigW + gap, y: top, w: smallW, h: halfH },
        { x: x + bigW + gap, y, w: smallW, h: halfH },
      ];
    }
    default:
      return [
        { x, y: top, w: halfW, h: halfH },
        { x: x + halfW + gap, y: top, w: halfW, h: halfH },
        { x, y, w: halfW, h: halfH },
        { x: x + halfW + gap, y, w: halfW, h: halfH },
      ].slice(0, Math.max(0, count));
  }
}

/** Past een foto in een vak zonder bij te snijden, gecentreerd. */
export function fit(imgW: number, imgH: number, box: Rect): Rect {
  const scale = Math.min(box.w / imgW, box.h / imgH);
  const w = imgW * scale;
  const h = imgH * scale;
  return { x: box.x + (box.w - w) / 2, y: box.y + (box.h - h) / 2, w, h };
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

/** Bestandsnaam voor de PDF, bijvoorbeeld "fotoboek-bedrijfsuitje-acme.pdf". */
export function pdfFileName(title: string): string {
  const slug = title
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return `fotoboek${slug ? `-${slug}` : ''}.pdf`;
}

/** Tekst voor de e-mail aan de klant, met de link naar het fotoboek. */
export function mailBody(lang: string, title: string, link: string): { subject: string; body: string } {
  const l = isAdminLanguage(lang) ? lang : 'nl';
  const tr = (nl: string, vars?: Record<string, string>) => translate(l, nl, vars);
  return {
    subject: tr(MAIL.subject, { title }),
    body: [tr(MAIL.hello), tr(MAIL.text), link, `${tr(MAIL.bye)}\nEscape Game The Hunt`].join('\n\n'),
  };
}

const MAIL = {
  subject: tKey('Jullie fotoboek: {title}'),
  hello: tKey('Hallo,'),
  text: tKey("Bedankt voor het spelen van Escape Game The Hunt! Via deze link vinden jullie de foto's van de dag en het fotoboek om te downloaden:"),
  bye: tKey('Met vriendelijke groet,'),
};
