/**
 * Opgemaakte tekst (vet, cursief, onderstreept, kleur, links, lijsten, uitlijning).
 *
 * Teksten worden opgeslagen als gewone tekst zolang er geen opmaak in zit. Met opmaak
 * worden ze een klein, vast stukje HTML. Deze module leest beide vormen, zodat de
 * beheerapp (editor) en de speler-app (weergave) dezelfde regels gebruiken.
 */

export type RichAlign = 'left' | 'center' | 'right' | 'justify';

export interface RichSpan {
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  color?: string;
  href?: string;
}

export interface RichBlock {
  /** Gewone alinea of lijstregel. */
  list?: 'ul' | 'ol';
  align?: RichAlign;
  spans: RichSpan[];
}

const TAG = /<(p|div|br|b|strong|i|em|u|a|ul|ol|li|span|font|h[1-6])\b[^>]*>/i;

/** Zit er opmaak (HTML) in deze tekst? Anders is het gewone tekst met regeleinden. */
export function isRich(value: string): boolean {
  return TAG.test(value);
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

function decode(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

function escape(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/ /g, '&nbsp;');
}

function attr(attrs: string, name: string): string | undefined {
  const m = attrs.match(new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'));
  return m ? decode(m[2] ?? m[3] ?? m[4] ?? '') : undefined;
}

function styleProp(attrs: string, prop: string): string | undefined {
  const style = attr(attrs, 'style');
  if (!style) return undefined;
  const m = style.match(new RegExp(`(?:^|;)\\s*${prop}\\s*:\\s*([^;]+)`, 'i'));
  return m ? m[1]!.trim() : undefined;
}

/** Alleen eenvoudige, veilige kleurwaarden, genormaliseerd naar #rrggbb. */
export function normalizeColor(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const v = value.trim().toLowerCase();
  let m = v.match(/^#([0-9a-f]{3})$/);
  if (m) return '#' + [...m[1]!].map((c) => c + c).join('');
  m = v.match(/^#([0-9a-f]{6})$/);
  if (m) return v;
  m = v.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if (m) return '#' + [m[1], m[2], m[3]].map((n) => Math.min(255, Number(n)).toString(16).padStart(2, '0')).join('');
  return undefined;
}

/** Alleen http(s)-, mailto- en tel-links. */
export function safeHref(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const v = value.trim();
  return /^(https?:\/\/|mailto:|tel:)\S+$/i.test(v) ? v : undefined;
}

function alignOf(attrs: string): RichAlign | undefined {
  const a = (styleProp(attrs, 'text-align') ?? attr(attrs, 'align') ?? '').toLowerCase();
  return a === 'center' || a === 'right' || a === 'justify' ? a : undefined;
}

type Style = Omit<RichSpan, 'text'>;

/** Tekst → alinea's met opgemaakte stukjes. Gewone tekst: elke regel een alinea. */
export function parseRich(value: string | undefined): RichBlock[] {
  if (!value) return [];
  if (!isRich(value)) return value.split('\n').map((line) => ({ spans: line ? [{ text: line }] : [] }));

  const blocks: RichBlock[] = [];
  let block: RichBlock | null = null;
  const styles: { tag: string; style: Style }[] = [];
  const lists: ('ul' | 'ol')[] = [];
  const aligns: { tag: string; align: RichAlign | undefined }[] = [];

  const current = (): Style => Object.assign({}, ...styles.map((s) => s.style)) as Style;
  const curAlign = () => [...aligns].reverse().find((a) => a.align)?.align;
  const open = (list?: 'ul' | 'ol') => {
    block = { spans: [] };
    if (list) block.list = list;
    const align = curAlign();
    if (align) block.align = align;
    blocks.push(block);
  };
  const close = () => {
    block = null;
  };
  const push = (text: string) => {
    if (!block) {
      if (!text.trim()) return; // witruimte tussen blokken
      open();
    }
    const style = current();
    const spans = block!.spans;
    const last = spans[spans.length - 1];
    const same = last && JSON.stringify({ ...last, text: '' }) === JSON.stringify({ ...style, text: '' });
    if (same) last.text += text;
    else spans.push({ ...style, text } as RichSpan);
  };

  const re = /<!--[\s\S]*?-->|<(\/?)([a-z][a-z0-9]*)\b([^>]*)>|([^<]+)|</gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(value))) {
    if (m[4] !== undefined || m[0] === '<') {
      push(decode((m[4] ?? '<').replace(/\s*\n\s*/g, ' ')));
      continue;
    }
    if (!m[2]) continue; // commentaar
    const closing = m[1] === '/';
    const tag = m[2].toLowerCase();
    const attrs = m[3] ?? '';
    if (tag === 'style' || tag === 'script') {
      if (closing) continue;
      // Inhoud overslaan.
      const end = value.toLowerCase().indexOf(`</${tag}`, re.lastIndex);
      re.lastIndex = end < 0 ? value.length : end;
      continue;
    }
    if (tag === 'br') {
      if (!block) open();
      // Een <br> als enige inhoud van een alinea is een lege regel (zo maken browsers die).
      push('\n');
      continue;
    }
    if (tag === 'ul' || tag === 'ol') {
      if (closing) lists.pop();
      else lists.push(tag);
      close();
      continue;
    }
    if (tag === 'p' || tag === 'div' || tag === 'li' || /^h[1-6]$/.test(tag)) {
      if (closing) {
        const i = aligns.map((a) => a.tag).lastIndexOf(tag);
        if (i >= 0) aligns.splice(i, 1);
        const s = styles.map((x) => x.tag).lastIndexOf(tag);
        if (s >= 0) styles.splice(s, 1);
        close();
      } else {
        aligns.push({ tag, align: alignOf(attrs) });
        if (tag[0] === 'h') styles.push({ tag, style: { bold: true } });
        open(tag === 'li' ? (lists[lists.length - 1] ?? 'ul') : undefined);
      }
      continue;
    }
    const style: Style = {};
    if (tag === 'b' || tag === 'strong') style.bold = true;
    else if (tag === 'i' || tag === 'em') style.italic = true;
    else if (tag === 'u') style.underline = true;
    else if (tag === 'a') {
      const href = safeHref(attr(attrs, 'href'));
      if (href) style.href = href;
    } else if (tag !== 'span' && tag !== 'font') continue; // onbekende tag: alleen de tekst houden
    if (tag === 'span' || tag === 'font') {
      const weight = (styleProp(attrs, 'font-weight') ?? '').toLowerCase();
      if (weight === 'bold' || Number(weight) >= 600) style.bold = true;
      if ((styleProp(attrs, 'font-style') ?? '').toLowerCase() === 'italic') style.italic = true;
      if (/underline/i.test(styleProp(attrs, 'text-decoration') ?? styleProp(attrs, 'text-decoration-line') ?? '')) style.underline = true;
    }
    const color = normalizeColor(styleProp(attrs, 'color') ?? (tag === 'font' ? attr(attrs, 'color') : undefined));
    if (color) style.color = color;
    if (closing) {
      const i = styles.map((x) => x.tag).lastIndexOf(tag);
      if (i >= 0) styles.splice(i, 1);
    } else styles.push({ tag, style });
  }

  // Opschonen: een alinea die alleen een <br> bevat is leeg; een <br> aan het eind telt niet.
  for (const b of blocks) {
    const last = b.spans[b.spans.length - 1];
    if (last && last.text.endsWith('\n')) {
      last.text = last.text.slice(0, -1);
      if (!last.text) b.spans.pop();
    }
    b.spans = b.spans.filter((s) => s.text !== '');
  }
  while (blocks.length && blocks[blocks.length - 1]!.spans.length === 0 && !blocks[blocks.length - 1]!.list) blocks.pop();
  while (blocks.length && blocks[0]!.spans.length === 0 && !blocks[0]!.list) blocks.shift();
  return blocks;
}

const plainSpan = (s: RichSpan) => !s.bold && !s.italic && !s.underline && !s.color && !s.href;
const plainBlock = (b: RichBlock) => !b.list && !b.align && b.spans.every(plainSpan);

function spanHtml(s: RichSpan): string {
  let html = escape(s.text).replace(/\n/g, '<br>');
  if (s.color) html = `<span style="color: ${s.color}">${html}</span>`;
  if (s.underline) html = `<u>${html}</u>`;
  if (s.italic) html = `<i>${html}</i>`;
  if (s.bold) html = `<b>${html}</b>`;
  if (s.href) html = `<a href="${escape(s.href).replace(/"/g, '&quot;')}">${html}</a>`;
  return html;
}

/** Alinea's → HTML, altijd (voor de editor). */
export function blocksToHtml(blocks: RichBlock[]): string {
  let out = '';
  let list: 'ul' | 'ol' | undefined;
  for (const b of blocks) {
    if (b.list !== list) {
      if (list) out += `</${list}>`;
      if (b.list) out += `<${b.list}>`;
      list = b.list;
    }
    const tag = b.list ? 'li' : 'p';
    const style = b.align ? ` style="text-align: ${b.align}"` : '';
    const inner = b.spans.map(spanHtml).join('');
    out += `<${tag}${style}>${inner || '<br>'}</${tag}>`;
  }
  if (list) out += `</${list}>`;
  return out;
}

/**
 * Alinea's → op te slaan tekst. Zonder opmaak gewone tekst (regels met \n),
 * anders schone HTML met alleen de toegestane opmaak.
 */
export function serializeRich(blocks: RichBlock[]): string {
  if (blocks.every(plainBlock)) return blocks.map((b) => b.spans.map((s) => s.text).join('')).join('\n').replace(/ /g, ' ').trim();
  return blocksToHtml(blocks);
}

/** HTML uit de editor of van het klembord → schone, op te slaan tekst. */
export function sanitizeRich(value: string): string {
  return serializeRich(parseRich(value));
}

/** Opgemaakte tekst → platte tekst (voor overzichten en zoeken). */
export function richToPlain(value: string | undefined): string {
  if (!value) return '';
  if (!isRich(value)) return value;
  let n = 0;
  let prev: RichBlock['list'];
  return parseRich(value)
    .map((b) => {
      if (b.list !== prev) n = 0;
      prev = b.list;
      const text = b.spans.map((s) => s.text).join('');
      return b.list === 'ol' ? `${++n}. ${text}` : b.list === 'ul' ? `• ${text}` : text;
    })
    .join('\n')
    .replace(/ /g, ' ');
}
