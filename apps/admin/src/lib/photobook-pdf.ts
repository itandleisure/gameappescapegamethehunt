'use client';
// PDF van het fotoboek in de huisstijl van Escape Game The Hunt (donkerblauw
// met oranje, staand A4), opgebouwd zoals het fotoboek dat jullie nu sturen:
//   1. voorkant met grote foto: "Bedankt voor het spelen van The Hunt in <stad>"
//   2. Jullie Hunt in cijfers (afstand, stappen, kcal, CO2) en de video
//   3. de foto's: groot (eigen pagina) of met 2 tot 4 op een pagina
//   4. review (met QR-code naar Google) en vacature
//   5. bedankt voor het spelen, met de andere spellen van Badass Games en de
//      contactgegevens
// Wordt in de browser gemaakt met pdf-lib.
import type { PDFDocument, PDFFont, PDFImage, PDFPage, RGB } from 'pdf-lib';
import qrcode from 'qrcode-generator';
import {
  bookText,
  DEFAULT_GAMES_URL,
  footerText as makeFooter,
  coverCrop,
  displayUrl,
  formatNumber,
  href,
  paginate,
  slots,
  wrapText,
  type BookGame,
  type BookItem,
  type BookLinks,
  type BookTextKey,
  type HuntStats,
  type Rect,
} from './photobook';

export interface PdfInput {
  /** Titel van het document (metadata). */
  title: string;
  city: string;
  intro: string;
  language: string;
  /** Foto's in volgorde, met een link om ze op te halen. */
  items: (BookItem & { url: string })[];
  /** Omslagfoto (ook bij de video); zonder omslagfoto de eerste foto. */
  coverUrl: string | null;
  /** Foto's voor de review- en vacaturepagina (vaste foto's). */
  extraUrls: string[];
  stats: HuntStats | null;
  links: BookLinks;
  /** Andere spellen voor de slotpagina, met een link naar hun foto. */
  games: (BookGame & { imageUrl?: string | null })[];
  /** Voortgang: aantal verwerkte foto's van het totaal. */
  onProgress?: (done: number, total: number) => void;
}

// A4 staand, in punten.
const W = 595;
const H = 842;
const M = 44;

export interface LoadedImage {
  bytes: Uint8Array;
  width: number;
  height: number;
}

const blobs = new Map<string, Promise<Blob>>();
function getBlob(source: string | Blob): Promise<Blob> {
  if (typeof source !== 'string') return Promise.resolve(source);
  let p = blobs.get(source);
  if (!p) {
    p = fetch(source).then((r) => {
      if (!r.ok) throw new Error(`Foto laden mislukt (${r.status})`);
      return r.blob();
    });
    blobs.set(source, p);
  }
  return p;
}

/**
 * Laadt een foto en zet hem om naar JPEG van hooguit maxSide pixels, met de
 * juiste kant boven. Met box wordt hij bijgesneden om dat vak te vullen. Zo
 * blijft de PDF klein en werkt ook een foto van een iPhone (HEIC) of een PNG.
 */
export async function loadAsJpeg(
  source: string | Blob,
  maxSide: number,
  quality = 0.85,
  box?: { w: number; h: number },
): Promise<LoadedImage> {
  const bitmap = await createImageBitmap(await getBlob(source), { imageOrientation: 'from-image' });
  const crop = box ? coverCrop(bitmap.width, bitmap.height, box.w, box.h) : { sx: 0, sy: 0, sw: bitmap.width, sh: bitmap.height };
  const scale = Math.min(1, maxSide / Math.max(crop.sw, crop.sh));
  const width = Math.max(1, Math.round(crop.sw * scale));
  const height = Math.max(1, Math.round(crop.sh * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(bitmap, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, width, height);
  bitmap.close();
  const out = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Foto omzetten mislukt'))), 'image/jpeg', quality),
  );
  return { bytes: new Uint8Array(await out.arrayBuffer()), width, height };
}

async function fontBytes(path: string): Promise<ArrayBuffer> {
  const r = await fetch(path);
  if (!r.ok) throw new Error(`Lettertype ${path} niet gevonden`);
  return r.arrayBuffer();
}

export async function buildPhotobookPdf(input: PdfInput): Promise<Uint8Array> {
  const { PDFDocument, PDFString, rgb } = await import('pdf-lib');
  const fontkit = (await import('@pdf-lib/fontkit')).default;
  const hex = (h: string) => rgb(parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255);
  const C = {
    navy: hex('#141e29'),
    navy2: hex('#1f2b3a'),
    orange: hex('#f29222'),
    white: hex('#ffffff'),
    text: hex('#141e29'),
    muted: hex('#6b7280'),
    light: hex('#c9ced6'),
    card: hex('#f2f3f5'),
    line: hex('#d9dce1'),
  };
  const lang = input.language;
  const T = (key: BookTextKey, vars?: Record<string, string | number>) => bookText(lang, key, vars);
  const num = (v: number, d = 0) => formatNumber(lang, v, d);

  const doc: PDFDocument = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  doc.setTitle(input.title);
  doc.setAuthor('Escape Game The Hunt');
  doc.setCreator('Escape Game The Hunt');
  doc.setLanguage(lang);
  const [regular, bold, mono] = await Promise.all([
    fontBytes('/fonts/Lato-Regular.ttf').then((b) => doc.embedFont(b, { subset: true })),
    fontBytes('/fonts/Lato-Bold.ttf').then((b) => doc.embedFont(b, { subset: true })),
    fontBytes('/fonts/JetBrainsMono-Bold.ttf').then((b) => doc.embedFont(b, { subset: true })),
  ]);
  const logo = await doc.embedPng(await fontBytes('/logo-full-light.png'));

  // Tekens die een lettertype niet kent (bijvoorbeeld emoji) vallen weg.
  const safe = (f: PDFFont, text: string) => {
    const chars = f.getCharacterSet();
    return Array.from(text)
      .filter((ch) => chars.includes(ch.codePointAt(0)!))
      .join('');
  };
  const width = (f: PDFFont, text: string, size: number, spacing = 0) =>
    f.widthOfTextAtSize(safe(f, text), size) + spacing * Math.max(0, Array.from(safe(f, text)).length - 1);
  const draw = (
    page: PDFPage,
    text: string,
    x: number,
    y: number,
    size: number,
    f: PDFFont,
    color: RGB,
    opts: { maxWidth?: number; spacing?: number; align?: 'left' | 'right' | 'center' } = {},
  ) => {
    let s = safe(f, text);
    const sp = opts.spacing ?? 0;
    if (opts.maxWidth && width(f, s, size, sp) > opts.maxWidth) {
      while (s.length > 1 && width(f, `${s}…`, size, sp) > opts.maxWidth) s = s.slice(0, -1);
      s = `${s.trimEnd()}…`;
    }
    const w = width(f, s, size, sp);
    let left = opts.align === 'right' ? x - w : opts.align === 'center' ? x - w / 2 : x;
    if (!sp) page.drawText(s, { x: left, y, size, font: f, color });
    else
      for (const ch of Array.from(s)) {
        page.drawText(ch, { x: left, y, size, font: f, color });
        left += f.widthOfTextAtSize(ch, size) + sp;
      }
    return w;
  };
  const lines = (text: string, f: PDFFont, size: number, maxWidth: number) =>
    wrapText(text, maxWidth, (s) => width(f, s, size)).map((l) => safe(f, l));
  const paragraph = (page: PDFPage, text: string, x: number, y: number, size: number, f: PDFFont, color: RGB, maxWidth: number, leading = 1.45) => {
    for (const l of lines(text, f, size, maxWidth)) {
      draw(page, l, x, y, size, f, color);
      y -= size * leading;
    }
    return y;
  };
  const label = (page: PDFPage, text: string, x: number, y: number, color = C.orange) =>
    draw(page, text.toUpperCase(), x, y, 6.5, mono, color, { spacing: 0.8 });
  const link = (page: PDFPage, r: Rect, url: string) => {
    const annot = doc.context.obj({
      Type: 'Annot',
      Subtype: 'Link',
      Rect: [r.x, r.y, r.x + r.w, r.y + r.h],
      Border: [0, 0, 0],
      A: { Type: 'Action', S: 'URI', URI: PDFString.of(url) },
    });
    page.node.addAnnot(doc.context.register(annot));
  };
  const button = (page: PDFPage, text: string, x: number, y: number, url: string, style: 'orange' | 'outline' | 'dark' | 'outline-dark') => {
    const size = 7.5;
    const w = width(bold, text, size) + 32;
    const h = 22;
    const fill = style === 'orange' ? C.orange : style === 'dark' ? C.navy : undefined;
    const border = style === 'outline' ? C.white : style === 'outline-dark' ? C.navy : undefined;
    const r = h / 2;
    page.drawSvgPath(`M ${r} 0 L ${w - r} 0 A ${r} ${r} 0 0 1 ${w - r} ${h} L ${r} ${h} A ${r} ${r} 0 0 1 ${r} 0 Z`, {
      x,
      y: y + h,
      ...(fill ? { color: fill } : {}),
      ...(border ? { borderColor: border, borderWidth: 1 } : {}),
    });
    const color = style === 'orange' || style === 'outline-dark' ? C.navy : C.white;
    draw(page, text, x + 16, y + 7.5, size, bold, style === 'dark' || style === 'outline' ? C.white : color);
    link(page, { x, y, w, h }, url);
    return w;
  };

  /** QR-code (donker op wit) met linksonder op (x, y). */
  const qr = (page: PDFPage, url: string, x: number, y: number, size: number) => {
    const code = qrcode(0, 'M');
    code.addData(url);
    code.make();
    const n = code.getModuleCount();
    const quiet = 2;
    const cell = size / (n + 2 * quiet);
    page.drawRectangle({ x, y, width: size, height: size, color: C.white });
    for (let r = 0; r < n; r++)
      for (let c = 0; c < n; c++)
        if (code.isDark(r, c))
          page.drawRectangle({ x: x + (quiet + c) * cell, y: y + size - (quiet + r + 1) * cell, width: cell + 0.05, height: cell + 0.05, color: C.navy });
  };

  // Foto's: per gebruik op maat bijgesneden en verkleind.
  const total = input.items.length;
  let done = 0;
  input.onProgress?.(0, total);
  const image = async (url: string, box: { w: number; h: number }, maxSide = 1600): Promise<PDFImage | null> => {
    try {
      const img = await loadAsJpeg(url, maxSide, 0.85, box);
      return await doc.embedJpg(img.bytes);
    } catch {
      return null;
    }
  };

  // Kop en voet van de gewone pagina's.
  let pageNo = 0;
  const footerText = makeFooter(input.city);
  const newPage = (dark = false) => {
    const page = doc.addPage([W, H]);
    pageNo += 1;
    page.drawRectangle({ x: 0, y: 0, width: W, height: H, color: dark ? C.navy : C.white });
    if (pageNo > 1) {
      page.drawLine({ start: { x: M, y: 50 }, end: { x: W - M, y: 50 }, thickness: 0.5, color: dark ? C.navy2 : C.line });
      label(page, footerText, M, 38, dark ? C.light : C.muted);
      draw(page, String(pageNo).padStart(2, '0'), W - M, 38, 6.5, mono, dark ? C.light : C.muted, { align: 'right' });
    }
    return page;
  };
  const heading = (page: PDFPage, labelText: string, title: string | null, dark = false) => {
    label(page, labelText, M, H - 50);
    if (title) draw(page, title, M, H - 78, 18, bold, dark ? C.white : C.text, { maxWidth: W - 2 * M });
    return title ? H - 96 : H - 64;
  };
  const coverUrl = input.coverUrl ?? input.items[0]?.url ?? null;

  // --- 1. Voorkant -------------------------------------------------------------
  {
    const page = newPage(true);
    const panelH = 300;
    if (coverUrl) {
      const img = await image(coverUrl, { w: W, h: H - panelH }, 2200);
      if (img) page.drawImage(img, { x: 0, y: panelH, width: W, height: H - panelH });
    }
    // Logo linksboven in een donker blok.
    const lw = 46;
    const lh = (logo.height / logo.width) * lw;
    page.drawRectangle({ x: 0, y: H - lh - 28, width: lw + 32, height: lh + 28, color: C.navy });
    page.drawImage(logo, { x: 16, y: H - lh - 14, width: lw, height: lh });
    // Tekst onderin.
    let y = panelH - 64;
    label(page, T('missionDone'), M, y);
    y -= 34;
    draw(page, T('thanksFor'), M, y, 24, bold, C.white, { maxWidth: W - 2 * M });
    y -= 30;
    if (input.city) {
      const pre = `${T('huntIn')} `;
      if (width(bold, pre + input.city, 24) <= W - 2 * M) {
        const pw = draw(page, pre, M, y, 24, bold, C.white);
        draw(page, input.city, M + pw, y, 24, bold, C.orange);
      } else {
        draw(page, pre.trim(), M, y, 24, bold, C.white, { maxWidth: W - 2 * M });
        y -= 30;
        draw(page, input.city, M, y, 24, bold, C.orange, { maxWidth: W - 2 * M });
      }
    } else draw(page, 'Escape Game The Hunt', M, y, 24, bold, C.orange);
    y -= 30;
    if (input.intro) paragraph(page, input.intro, M, y, 9, regular, C.light, W - 2 * M - 40);
    page.drawRectangle({ x: W - 200, y: 0, width: 200, height: 8, color: C.orange });
  }

  // --- 2. Jullie Hunt in cijfers -----------------------------------------------
  const stats = input.stats && input.stats.teams.length ? input.stats : null;
  if (stats || input.links.video) {
    const page = newPage();
    let y = heading(page, T('missionDone'), T('statsTitle'));
    if (stats) {
      y = paragraph(page, T('statsIntro'), M, y - 4, 8, regular, C.muted, W - 2 * M - 60) - 12;
      // Vier kaarten.
      const gap = 8;
      const cw = (W - 2 * M - 3 * gap) / 4;
      const ch = 62;
      const cards: [string, string][] = [
        [`${num(stats.avgKm, 1)} km`, T('avgKm')],
        [num(stats.avgStepsPP), T('stepsPP')],
        [`${num(stats.totalKm, 1)} km`, T('totalKm', { n: stats.teams.length })],
        [`${num(stats.totalCo2Kg, 1)} kg`, T('co2Saved')],
      ];
      cards.forEach(([value, text], i) => {
        const x = M + i * (cw + gap);
        const dark = i === 3;
        page.drawRectangle({ x, y: y - ch, width: cw, height: ch, color: dark ? C.navy : C.card });
        draw(page, value, x + 10, y - 24, 15, bold, dark ? C.orange : C.text, { maxWidth: cw - 20 });
        let ty = y - 38;
        for (const l of lines(text, regular, 6.5, cw - 20).slice(0, 3)) {
          draw(page, l, x + 10, ty, 6.5, regular, dark ? C.light : C.muted);
          ty -= 8.5;
        }
      });
      y -= ch + 26;
      // Tabel.
      const cols = [
        { key: 'team' as const, x: M, align: 'left' as const },
        { key: 'km' as const, x: M + 240, align: 'right' as const },
        { key: 'steps' as const, x: M + 320, align: 'right' as const },
        { key: 'kcal' as const, x: M + 400, align: 'right' as const },
        { key: 'co2' as const, x: W - M, align: 'right' as const },
      ];
      for (const c of cols) draw(page, T(c.key).toUpperCase(), c.x, y, 6, mono, C.muted, { align: c.align, spacing: 0.5 });
      y -= 6;
      page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.8, color: C.text });
      const rowH = 17;
      const maxRows = Math.max(3, Math.floor((y - 260) / rowH));
      for (const t of stats.teams.slice(0, maxRows)) {
        y -= rowH;
        draw(page, t.name, cols[0]!.x, y + 5, 8, regular, C.text, { maxWidth: 220 });
        draw(page, num(t.km, 1), cols[1]!.x, y + 5, 8, regular, C.text, { align: 'right' });
        draw(page, num(t.stepsPP), cols[2]!.x, y + 5, 8, regular, C.text, { align: 'right' });
        draw(page, num(t.kcalPP), cols[3]!.x, y + 5, 8, regular, C.text, { align: 'right' });
        draw(page, num(t.co2Kg, 2), cols[4]!.x, y + 5, 8, regular, C.text, { align: 'right' });
        page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.4, color: C.line });
      }
      y -= rowH;
      draw(page, T('together'), cols[0]!.x, y + 5, 8, bold, C.text);
      draw(page, num(stats.totalKm, 1), cols[1]!.x, y + 5, 8, bold, C.text, { align: 'right' });
      draw(page, num(stats.totalCo2Kg, 1), cols[4]!.x, y + 5, 8, bold, C.text, { align: 'right' });
      y -= 16;
      paragraph(page, T('footnote'), M, y, 6, regular, C.muted, W - 2 * M);
    }
    // Video onderaan.
    if (input.links.video) {
      const vy = 70;
      const vh = 210;
      const vw = W - 2 * M;
      page.drawRectangle({ x: M, y: vy, width: vw, height: vh, color: C.card });
      const imgH = vh - 50;
      if (coverUrl) {
        const img = await image(coverUrl, { w: vw - 16, h: imgH - 8 }, 1400);
        if (img) page.drawImage(img, { x: M + 8, y: vy + 42, width: vw - 16, height: imgH - 8 });
      }
      page.drawCircle({ x: M + vw / 2, y: vy + 42 + (imgH - 8) / 2, size: 18, color: C.orange });
      const cx = M + vw / 2 + 2;
      const cy = vy + 42 + (imgH - 8) / 2;
      page.drawSvgPath(`M ${cx - 6} ${-(cy + 8)} L ${cx + 8} ${-cy} L ${cx - 6} ${-(cy - 8)} Z`, { x: 0, y: 0, color: C.navy });
      const tw = draw(page, T('videoTitle'), M + 12, vy + 16, 11, bold, C.text);
      draw(page, T('videoText'), M + 12 + tw + 12, vy + 16, 7, regular, C.muted);
      draw(page, T('videoLink'), W - M - 12 - width(mono, ' →', 8), vy + 16, 8, bold, C.orange, { align: 'right' });
      draw(page, ' →', W - M - 12, vy + 16, 8, mono, C.orange, { align: 'right' });
      link(page, { x: M, y: vy, w: vw, h: vh }, href('url', input.links.video));
    }
  }

  // --- 3. Foto's ------------------------------------------------------------------
  const pages = paginate(input.items);
  let firstGrid = true;
  for (const group of pages) {
    const page = newPage();
    let top: number;
    if (group.length === 1 && group[0]!.large) {
      top = heading(page, T('missionDone'), group[0]!.caption || T('groupPhoto'));
    } else if (firstGrid) {
      top = heading(page, T('missionDone'), T('yourPhotos'));
      firstGrid = false;
    } else {
      top = heading(page, T('yourPhotos'), null);
    }
    const captionH = group.length === 1 && group[0]!.large ? 0 : 16;
    const area: Rect = { x: M, y: 70, w: W - 2 * M, h: top - 8 - 70 };
    const boxes = slots(group.length, area, 14);
    for (const [i, box] of boxes.entries()) {
      const item = group[i]!;
      const photo = { x: box.x, y: box.y + captionH, w: box.w, h: box.h - captionH };
      const img = await image(item.url, { w: photo.w, h: photo.h }, item.large ? 2200 : 1400);
      if (img) page.drawImage(img, { x: photo.x, y: photo.y, width: photo.w, height: photo.h });
      else page.drawRectangle({ x: photo.x, y: photo.y, width: photo.w, height: photo.h, color: C.card });
      if (captionH && item.caption) label(page, item.caption, box.x, box.y + 4, C.muted);
      input.onProgress?.(++done, total);
    }
  }

  // --- 4. Review en vacature ------------------------------------------------------
  const { google_review, website_review, vacancy } = input.links;
  if (google_review || website_review || vacancy) {
    const page = newPage(true);
    let y = heading(page, T('missionDone'), google_review || website_review ? T('reviewTitle') : T('vacancyLabel'), true);
    if (google_review || website_review) {
      const imgUrl = input.extraUrls[0] ?? coverUrl;
      const ih = 170;
      if (imgUrl) {
        const img = await image(imgUrl, { w: W - 2 * M, h: ih }, 1600);
        if (img) {
          page.drawImage(img, { x: M, y: y - ih, width: W - 2 * M, height: ih });
          y -= ih + 22;
        }
      }
      const qrSize = google_review ? 74 : 0;
      const textW = W - 2 * M - (qrSize ? qrSize + 24 : 60);
      const top = y;
      y = paragraph(page, T('reviewText'), M, y, 8.5, regular, C.light, textW) - 14;
      let bx = M;
      if (google_review) bx += button(page, T('googleReview'), bx, y - 22, href('url', google_review), 'orange') + 10;
      if (website_review) button(page, T('websiteReview'), bx, y - 22, href('url', website_review), 'outline');
      y -= 36;
      if (google_review) {
        const qx = W - M - qrSize;
        const qy = top - qrSize + 6;
        qr(page, href('url', google_review), qx, qy, qrSize);
        link(page, { x: qx, y: qy, w: qrSize, h: qrSize }, href('url', google_review));
        draw(page, T('scanReview'), W - M, qy - 11, 6, mono, C.light, { align: 'right' });
        y = Math.min(y, qy - 24);
      }
      y -= 24;
    }
    if (vacancy) {
      const bh = 230;
      const bw = W - 2 * M;
      const by = Math.max(70, y - bh);
      page.drawRectangle({ x: M, y: by, width: bw, height: bh, color: C.orange });
      const imgUrl = input.extraUrls[1] ?? input.extraUrls[0] ?? null;
      let tx = M + 18;
      if (imgUrl) {
        const iw = bw * 0.36;
        const img = await image(imgUrl, { w: iw, h: bh }, 1200);
        if (img) {
          page.drawImage(img, { x: M, y: by, width: iw, height: bh });
          tx = M + iw + 16;
        }
      }
      const tw = M + bw - 16 - tx;
      let ty = by + bh - 24;
      label(page, T('vacancyLabel'), tx, ty, C.navy);
      ty -= 18;
      for (const l of lines(T('vacancyTitle'), bold, 12, tw)) {
        draw(page, l, tx, ty, 12, bold, C.navy);
        ty -= 15;
      }
      ty = paragraph(page, T('vacancyText'), tx, ty - 2, 7.5, regular, C.navy, tw) - 4;
      ty = paragraph(page, T('vacancyAsk'), tx, ty, 7.5, bold, C.navy, tw) - 10;
      button(page, T('vacancyLink'), tx, ty - 22, href('url', vacancy), 'dark');
      button(page, displayUrl(vacancy), tx, ty - 52, href('url', vacancy), 'outline-dark');
    }
  }

  // --- 5. Bedankt voor het spelen, met de andere spellen ------------------------
  {
    const page = newPage(true);
    const games = input.games.slice(0, 4);
    let y = heading(page, T('missionDone'), T('thanks'), true);
    y = paragraph(page, T('thanksText'), M, y - 2, 9, regular, C.light, W - 2 * M - 60) - 18;
    if (games.length) {
      label(page, 'Badass Games', M, y);
      y -= 22;
      draw(page, T('moreGames'), M, y, 15, bold, C.white, { maxWidth: W - 2 * M });
      y = paragraph(page, T('moreGamesText'), M, y - 16, 8, regular, C.light, W - 2 * M) - 8;
      // Blokken van twee naast elkaar: foto, naam, tekst en link.
      const gap = 12;
      const cw = (W - 2 * M - gap) / 2;
      const rows = Math.ceil(games.length / 2);
      const bottom = 175;
      const ch = Math.min(215, (y - bottom - (rows - 1) * gap) / rows);
      const imgH = Math.min(ch * 0.5, cw * 0.53);
      for (const [i, g] of games.entries()) {
        const x = M + (i % 2) * (cw + gap);
        const top = y - Math.floor(i / 2) * (ch + gap);
        page.drawRectangle({ x, y: top - ch, width: cw, height: ch, color: C.navy2 });
        page.drawRectangle({ x, y: top - 2, width: cw, height: 2, color: C.orange });
        let ty = top - 2;
        if (g.imageUrl) {
          const img = await image(g.imageUrl, { w: cw, h: imgH }, 900);
          if (img) {
            page.drawImage(img, { x, y: top - 2 - imgH, width: cw, height: imgH });
            ty -= imgH;
          }
        }
        ty -= 20;
        draw(page, g.name, x + 12, ty, 11, bold, C.white, { maxWidth: cw - 24 });
        ty -= 14;
        const textLines = lines(g.text, regular, 7.5, cw - 24);
        const room = Math.max(1, Math.floor((ty - (top - ch + 28)) / 10.5));
        for (const l of textLines.slice(0, room)) {
          draw(page, l, x + 12, ty, 7.5, regular, C.light);
          ty -= 10.5;
        }
        if (g.url) {
          const u = displayUrl(g.url);
          const uw = draw(page, u, x + 12, top - ch + 14, 7.5, bold, C.orange, { maxWidth: cw - 40 });
          draw(page, ' →', x + 12 + uw, top - ch + 14, 7.5, mono, C.orange);
          link(page, { x, y: top - ch, w: cw, h: ch }, href('url', g.url));
        }
      }
      y -= rows * ch + (rows - 1) * gap + 18;
      const all = input.links.games || DEFAULT_GAMES_URL;
      button(page, `${T('allGames')}: ${displayUrl(all)}`, M, y - 22, href('url', all), 'orange');
    }
    // Logo en contactgegevens onderaan.
    const lw = 54;
    const lh = (logo.height / logo.width) * lw;
    page.drawImage(logo, { x: M, y: 64, width: lw, height: lh });
    const contact: [string, string][] = [];
    if (input.links.website) contact.push([displayUrl(input.links.website), href('url', input.links.website)]);
    if (input.links.email) contact.push([input.links.email, href('email', input.links.email)]);
    if (input.links.phone) contact.push([input.links.phone, href('phone', input.links.phone)]);
    let cy = 70 + (contact.length - 1) * 12;
    for (const [text, url] of contact) {
      const w = draw(page, text, W - M, cy, 8, regular, C.white, { align: 'right' });
      link(page, { x: W - M - w, y: cy - 2, w, h: 11 }, url);
      cy -= 12;
    }
  }

  return doc.save();
}
