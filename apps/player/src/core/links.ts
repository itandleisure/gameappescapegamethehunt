/**
 * Spellinks: https://<spel-domein>/<game-ID>:<spelcode> (op een ticket of in
 * een QR-code). Opent de app zo'n link, dan gaat de speler naar het
 * aanmeldscherm met de spelcode al ingevuld. Ook het eigen adres van de app,
 * thehunt:///?code=<spelcode>, komt daar uit.
 */

export interface JoinLink {
  gameId: string;
  code: string;
}

/** Leest game-ID en spelcode uit een adres of pad; null als het geen spellink is. */
export function parseJoinLink(url: string): JoinLink | null {
  let rest = url.trim();
  const scheme = /^([a-z][a-z0-9+.-]*):\/\//i.exec(rest);
  if (scheme) {
    rest = rest.slice(scheme[0].length);
    // Bij http(s) staat het domein ervoor; bij thehunt:// meestal niet.
    if (/^https?$/i.test(scheme[1]!)) rest = rest.replace(/^[^/?#]*/, '');
  }
  const [pathAndQuery] = rest.split('#');
  const [path = '', query = ''] = pathAndQuery!.split('?');
  const params = new URLSearchParams(query);
  const fromQuery = params.get('code');
  if (fromQuery) {
    const code = normalizeCode(fromQuery);
    return code ? { gameId: params.get('game') ?? '', code } : null;
  }
  const parts = path.split('/').filter(Boolean);
  if (parts.length !== 1) return null;
  let segment = parts[0]!;
  try {
    segment = decodeURIComponent(segment);
  } catch {
    return null;
  }
  const colon = segment.lastIndexOf(':');
  if (colon < 0) return null;
  const code = normalizeCode(segment.slice(colon + 1));
  return code ? { gameId: segment.slice(0, colon).toLowerCase(), code } : null;
}

function normalizeCode(text: string): string | null {
  const code = text.toUpperCase().replace(/[^A-Z0-9]/g, '');
  return code.length >= 4 && code.length <= 12 ? code : null;
}

/** Route in de app voor een spellink: het aanmeldscherm met de code erin. */
export function joinRoute(link: JoinLink): string {
  const params = new URLSearchParams({ code: link.code });
  if (link.gameId) params.set('game', link.gameId);
  return `/?${params.toString()}`;
}
