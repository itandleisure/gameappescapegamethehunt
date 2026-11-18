'use client';
// PDF van het fotoboek, in de stijl van Escape Game The Hunt: een donkere
// voorkant met logo en titel, de ranglijst, de foto's (groot of met 2 tot 4
// op een pagina) en een bedankpagina. Wordt in de browser gemaakt met pdf-lib.
import type { PDFFont, PDFImage, PDFPage, RGB } from 'pdf-lib';
import { bookText, fit, paginate, slots, wrapText, type BookItem, type Rect } from './photobook';

export interface PdfInput {
  title: string;
  subtitle: string;
  intro: string;
  language: string;
  /** Foto's in volgorde, met een link om ze op te halen. */
  items: (BookItem & { url: string })[];
  ranking: { rank: number; name: string; score: number; duration: string }[];
  /** Voortgang: aantal verwerkte foto's van het totaal. */
  onProgress?: (done: number, total: number) => void;
}

// A4 liggend, in punten.
const W = 842;
const H = 595;
const M = 36;

export interface LoadedImage {
  bytes: Uint8Array;
  width: number;
  height: number;
}

/**
 * Laadt een foto en zet hem om naar JPEG van hooguit maxSide pixels, met de
 * juiste kant boven. Zo blijft de PDF klein en werkt ook een foto van een
 * iPhone (HEIC) of een PNG.
 */
export async function loadAsJpeg(source: string | Blob, maxSide: number, quality = 0.85): Promise<LoadedImage> {
  const blob = typeof source === 'string' ? await (await fetch(source)).blob() : source;
  const bitmap = await createImageBitmap(blob, { imageOrientation: 'from-image' });
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const out = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Foto omzetten mislukt'))), 'image/jpeg', quality),
  );
  return { bytes: new Uint8Array(await out.arrayBuffer()), width, height };
}

export async function buildPhotobookPdf(input: PdfInput): Promise<Uint8Array> {
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');
  const C = {
    dark: rgb(0.11, 0.106, 0.098),
    paper: rgb(0.965, 0.961, 0.949),
    white: rgb(1, 1, 1),
    text: rgb(0.11, 0.106, 0.098),
    muted: rgb(0.42, 0.404, 0.373),
    light: rgb(0.85, 0.83, 0.8),
    accent: rgb(0.761, 0.255, 0.047),
    line: rgb(0.886, 0.875, 0.847),
  };
  const lang = input.language;
  const doc = await PDFDocument.create();
  doc.setTitle(input.title);
  doc.setAuthor('Escape Game The Hunt');
  doc.setCreator('Escape Game The Hunt');
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  // Standaardletters kennen niet elk teken (bijvoorbeeld emoji): die vallen weg.
  const safe = (f: PDFFont, text: string) =>
    Array.from(text)
      .filter((ch) => {
        try {
          f.encodeText(ch);
          return true;
        } catch {
          return false;
        }
      })
      .join('');
  const draw = (page: PDFPage, text: string, x: number, y: number, size: number, f: PDFFont, color: RGB, maxWidth?: number) => {
    let s = safe(f, text);
    if (maxWidth && f.widthOfTextAtSize(s, size) > maxWidth) {
      while (s.length > 1 && f.widthOfTextAtSize(`${s}…`, size) > maxWidth) s = s.slice(0, -1);
      s = `${s.trimEnd()}…`;
    }
    page.drawText(s, { x, y, size, font: f, color });
  };
  const lines = (text: string, f: PDFFont, size: number, maxWidth: number) =>
    wrapText(text, maxWidth, (s) => f.widthOfTextAtSize(safe(f, s), size)).map((l) => safe(f, l));

  const logoLight = await doc.embedPng(await (await fetch('/logo-full-light.png')).arrayBuffer());
  const logoSmall = await doc.embedPng(await (await fetch('/logo-dark.png')).arrayBuffer());

  // Foto's ophalen; grote foto's met meer pixels.
  const images = new Map<string, PDFImage>();
  let done = 0;
  input.onProgress?.(0, input.items.length);
  for (const item of input.items) {
    try {
      const img = await loadAsJpeg(item.url, item.large ? 2200 : 1400);
      images.set(item.path, await doc.embedJpg(img.bytes));
    } catch {
      // Een foto die niet laadt, slaat het fotoboek over.
    }
    input.onProgress?.(++done, input.items.length);
  }
  const usable = input.items.filter((i) => images.has(i.path));

  const photoFrame = (page: PDFPage, image: PDFImage, box: Rect, border: number) => {
    const r = fit(image.width, image.height, { x: box.x + border, y: box.y + border, w: box.w - 2 * border, h: box.h - 2 * border });
    page.drawRectangle({ x: r.x - border, y: r.y - border, width: r.w + 2 * border, height: r.h + 2 * border, color: C.white, borderColor: C.line, borderWidth: 0.5 });
    page.drawImage(image, { x: r.x, y: r.y, width: r.w, height: r.h });
    return r;
  };

  // --- Voorkant ---------------------------------------------------------------
  {
    const page = doc.addPage([W, H]);
    page.drawRectangle({ x: 0, y: 0, width: W, height: H, color: C.dark });
    const cover = usable[0];
    const leftW = cover ? 330 : W - 2 * M;
    const logoH = 120;
    const logoW = (logoLight.width / logoLight.height) * logoH;
    page.drawImage(logoLight, { x: M + 4, y: H - M - logoH, width: logoW, height: logoH });
    let y = H - M - logoH - 48;
    for (const l of lines(input.title, bold, 30, leftW).slice(0, 4)) {
      draw(page, l, M + 4, y, 30, bold, C.white);
      y -= 36;
    }
    page.drawRectangle({ x: M + 4, y: y + 14, width: 56, height: 4, color: C.accent });
    y -= 16;
    if (input.subtitle) {
      draw(page, input.subtitle, M + 4, y, 13, font, C.light, leftW);
      y -= 30;
    }
    for (const l of lines(input.intro, font, 11, leftW)) {
      if (y < M + 12) break;
      draw(page, l, M + 4, y, 11, font, C.light);
      y -= 16;
    }
    if (cover) photoFrame(page, images.get(cover.path)!, { x: M + leftW + 30, y: M, w: W - 2 * M - leftW - 30, h: H - 2 * M }, 8);
  }

  // Kop en voet van de gewone pagina's.
  let pageNo = 1;
  const paperPage = (heading: string) => {
    const page = doc.addPage([W, H]);
    pageNo += 1;
    page.drawRectangle({ x: 0, y: 0, width: W, height: H, color: C.paper });
    const lh = 22;
    page.drawImage(logoSmall, { x: M, y: H - M - lh + 4, width: (logoSmall.width / logoSmall.height) * lh, height: lh });
    draw(page, heading, M + 34, H - M - 12, 12, bold, C.text, W - 2 * M - 120);
    page.drawRectangle({ x: M, y: H - M - 26, width: W - 2 * M, height: 1.5, color: C.accent });
    const label = bookText(lang, 'page', { n: pageNo });
    draw(page, label, W - M - font.widthOfTextAtSize(safe(font, label), 9), M - 18, 9, font, C.muted);
    draw(page, 'Escape Game The Hunt', M, M - 18, 9, font, C.muted);
    return page;
  };
  const content: Rect = { x: M, y: M, w: W - 2 * M, h: H - 2 * M - 40 };

  // --- Ranglijst ----------------------------------------------------------------
  if (input.ranking.length) {
    const cols = [
      { label: bookText(lang, 'place'), x: M + 10 },
      { label: bookText(lang, 'team'), x: M + 80 },
      { label: bookText(lang, 'points'), x: W - M - 250 },
      { label: bookText(lang, 'time'), x: W - M - 120 },
    ];
    const rowH = 24;
    const perPage = Math.floor((content.h - 50) / rowH);
    for (let start = 0; start < input.ranking.length; start += perPage) {
      const page = paperPage(bookText(lang, 'ranking'));
      let y = content.y + content.h - 30;
      for (const c of cols) draw(page, c.label.toUpperCase(), c.x, y, 9, bold, C.muted);
      y -= 10;
      input.ranking.slice(start, start + perPage).forEach((r, i) => {
        y -= rowH;
        if (i % 2 === 0) page.drawRectangle({ x: M, y: y - 8, width: W - 2 * M, height: rowH, color: C.white });
        const top3 = r.rank <= 3;
        draw(page, String(r.rank), cols[0]!.x, y, 12, bold, top3 ? C.accent : C.text);
        draw(page, r.name, cols[1]!.x, y, 12, top3 ? bold : font, C.text, cols[2]!.x - cols[1]!.x - 16);
        draw(page, String(r.score), cols[2]!.x, y, 12, font, C.text);
        draw(page, r.duration, cols[3]!.x, y, 12, font, C.text);
      });
    }
  }

  // --- Foto's -------------------------------------------------------------------
  const captionH = 18;
  for (const group of paginate(usable)) {
    const page = paperPage(input.title);
    const gap = group.length === 1 ? 0 : 14;
    slots(group.length, content, gap).forEach((box, i) => {
      const item = group[i]!;
      const area = { x: box.x, y: box.y + captionH, w: box.w, h: box.h - captionH };
      const r = photoFrame(page, images.get(item.path)!, area, group.length === 1 ? 8 : 5);
      if (item.caption) {
        const size = group.length === 1 ? 11 : 9;
        const text = safe(font, item.caption);
        const width = Math.min(font.widthOfTextAtSize(text, size), box.w);
        draw(page, text, Math.max(box.x, r.x + r.w / 2 - width / 2), r.y - 8 - size - 2, size, font, C.text, box.w);
      }
    });
  }

  // --- Bedankt ------------------------------------------------------------------
  {
    const page = doc.addPage([W, H]);
    page.drawRectangle({ x: 0, y: 0, width: W, height: H, color: C.dark });
    const logoH = 150;
    const logoW = (logoLight.width / logoLight.height) * logoH;
    page.drawImage(logoLight, { x: (W - logoW) / 2, y: H / 2 - 10, width: logoW, height: logoH });
    const center = (text: string, y: number, size: number, f: PDFFont, color: RGB) => {
      const s = safe(f, text);
      page.drawText(s, { x: (W - f.widthOfTextAtSize(s, size)) / 2, y, size, font: f, color });
    };
    center(bookText(lang, 'thanks'), H / 2 - 50, 24, bold, C.white);
    let y = H / 2 - 80;
    for (const l of lines(bookText(lang, 'thanksText'), font, 12, 460)) {
      center(l, y, 12, font, C.light);
      y -= 18;
    }
  }

  return doc.save();
}
