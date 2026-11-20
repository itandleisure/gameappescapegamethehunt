// De foto die een webpagina zelf als voorbeeld opgeeft (og:image), om bij de
// spellen in het fotoboek automatisch een plaatje te zetten. Zonder netwerk,
// zodat het met gewone tests te controleren is.

const META_KEYS = ['og:image:secure_url', 'og:image', 'og:image:url', 'twitter:image', 'twitter:image:src'];

function attrs(tag: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const m of tag.matchAll(/([a-zA-Z_:-]+)\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+))/g)) {
    out.set(m[1]!.toLowerCase(), m[3] ?? m[4] ?? m[5] ?? '');
  }
  return out;
}

function decode(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&#x2F;/gi, '/')
    .trim();
}

function absolute(src: string, base: string): string | null {
  try {
    const u = new URL(decode(src), base);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.toString() : null;
  } catch {
    return null;
  }
}

/**
 * Zoekt in de HTML van een pagina de voorbeeldfoto: eerst og:image en
 * twitter:image, dan link rel="image_src", en anders de eerste gewone foto
 * (geen logo of icoon). Geeft een volledige link terug, of null.
 */
export function findPageImage(html: string, pageUrl: string): string | null {
  const metas = [...html.matchAll(/<meta\b[^>]*>/gi)].map((m) => attrs(m[0]));
  for (const key of META_KEYS) {
    for (const a of metas) {
      if ((a.get('property') ?? a.get('name') ?? '').toLowerCase() === key && a.get('content')) {
        const url = absolute(a.get('content')!, pageUrl);
        if (url) return url;
      }
    }
  }
  for (const m of html.matchAll(/<link\b[^>]*>/gi)) {
    const a = attrs(m[0]);
    if ((a.get('rel') ?? '').toLowerCase() === 'image_src' && a.get('href')) {
      const url = absolute(a.get('href')!, pageUrl);
      if (url) return url;
    }
  }
  for (const m of html.matchAll(/<img\b[^>]*>/gi)) {
    const a = attrs(m[0]);
    const src = a.get('src') ?? a.get('data-src');
    if (!src || src.startsWith('data:') || /\.svg(\?|$)/i.test(src) || /logo|icon|favicon|sprite/i.test(src)) continue;
    const url = absolute(src, pageUrl);
    if (url) return url;
  }
  return null;
}

/**
 * Mag de server deze link ophalen? Alleen http(s) naar een gewone website,
 * niet naar de server zelf of een intern netwerk.
 */
export function isPublicUrl(value: string): boolean {
  let u: URL;
  try {
    u = new URL(value);
  } catch {
    return false;
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return false;
  if (u.username || u.password) return false;
  if (u.port && u.port !== '80' && u.port !== '443') return false;
  return isPublicHost(u.hostname);
}

/** Een hostnaam of IP-adres buiten localhost en de interne netwerken. */
export function isPublicHost(host: string): boolean {
  const h = host.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
  if (!h || h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal')) return false;
  const v4 = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
    if (a === 169 && b === 254) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && b === 168) return false;
    if (a === 100 && b >= 64 && b <= 127) return false;
    return true;
  }
  if (h.includes(':')) {
    if (h === '::' || h === '::1') return false;
    if (/^(fc|fd|fe8|fe9|fea|feb)/.test(h)) return false;
    const mapped = h.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPublicHost(mapped[1]!);
    return true;
  }
  // Zonder punt is het geen gewone website (bijvoorbeeld een naam in het interne netwerk).
  return h.includes('.');
}
