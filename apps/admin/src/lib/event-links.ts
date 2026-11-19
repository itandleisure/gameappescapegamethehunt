/**
 * Vaste links per spel en event, zoals bij Loquiz:
 *
 *   spellink:      https://<spel-domein>/<game-ID>:<spelcode>
 *   resultaten:    https://<beheer-domein>/resultaten/<game-ID>:<spelcode>
 *
 * Het game-ID is leesbaar en uniek per spel (bijv. "the-hunt-leeuwarden"), de
 * spelcode is de code van het event (bijv. "ABC12"). De spelcode alleen is al
 * genoeg om het event te vinden; het game-ID maakt de link leesbaar.
 *
 * Het spel-domein (bijv. escapegamethehunt.badassgames.nl) hoort alleen bij Escape Game
 * The Hunt; andere spellen krijgen een eigen domein (zie docs/spellinks.md).
 *
 * De spellink opent de app als die er is (universal link / app link) en
 * anders een webpagina met de knoppen naar de App Store en Google Play.
 */

/** Pakketnaam van de app in Google Play en de App Store (zie apps/player/app.config.ts). */
export const APP_PACKAGE = 'com.thebadassgroup.thehunt';
/** Eigen adres van de app (custom scheme), voor de knop "Open de app". */
export const APP_SCHEME = 'thehunt';

export interface EventLink {
  gameId: string;
  code: string;
}

/** Spelcode zoals in de database: hoofdletters en cijfers. */
export function normalizeCode(code: string): string {
  return code.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/** Game-ID zoals in de database: kleine letters, cijfers en streepjes. */
export function normalizeGameId(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/, '');
}

export function isValidGameId(id: string): boolean {
  return /^[a-z0-9]+(-[a-z0-9]+)*$/.test(id) && id.length >= 2 && id.length <= 40;
}

/**
 * Leest "<game-ID>:<spelcode>" uit een stuk van een adres. Werkt ook met een
 * gecodeerde dubbele punt (%3A) en met alleen een spelcode.
 */
export function parseEventLink(segment: string): EventLink | null {
  let text = segment;
  try {
    text = decodeURIComponent(segment);
  } catch {
    // laat staan zoals het is
  }
  text = text.trim().replace(/^\/+|\/+$/g, '');
  const colon = text.lastIndexOf(':');
  const gameId = colon >= 0 ? normalizeGameId(text.slice(0, colon)) : '';
  const code = normalizeCode(colon >= 0 ? text.slice(colon + 1) : text);
  if (code.length < 4 || code.length > 12) return null;
  return { gameId, code };
}

export function eventPath({ gameId, code }: EventLink): string {
  return gameId ? `/${gameId}:${code}` : `/${code}`;
}

/** Zonder slash aan het eind, met https:// ervoor. */
export function cleanOrigin(origin: string): string {
  const o = origin.trim().replace(/\/+$/, '');
  return /^https?:\/\//.test(o) ? o : `https://${o}`;
}

/**
 * Domein van de spellinks. Ingesteld met NEXT_PUBLIC_SPEL_DOMEIN (bijv.
 * https://escapegamethehunt.badassgames.nl); anders het adres van de beheeromgeving zelf.
 */
export function playOrigin(): string {
  const configured = process.env.NEXT_PUBLIC_SPEL_DOMEIN;
  if (configured) return cleanOrigin(configured);
  return typeof window === 'undefined' ? '' : window.location.origin;
}

/** Link voor op het ticket en in de QR-code. */
export function playUrl(link: EventLink, origin = playOrigin()): string {
  return `${origin}${eventPath(link)}`;
}

/** Link naar de resultatenpagina in de beheeromgeving (inloggen nodig). */
export function resultsUrl(link: EventLink, origin = typeof window === 'undefined' ? '' : window.location.origin): string {
  return `${origin}/resultaten${eventPath(link)}`;
}

/** Opent de app direct met de spelcode ingevuld (als de app er al is). */
export function appSchemeUrl({ gameId, code }: EventLink): string {
  const params = new URLSearchParams({ code });
  if (gameId) params.set('game', gameId);
  return `${APP_SCHEME}:///?${params.toString()}`;
}

/** App Store: NEXT_PUBLIC_APP_STORE_URL, bijv. https://apps.apple.com/app/id1234567890. */
export function appStoreUrl(): string | null {
  return process.env.NEXT_PUBLIC_APP_STORE_URL || null;
}

/** Google Play: NEXT_PUBLIC_PLAY_STORE_URL, anders de vaste pagina van de app. */
export function playStoreUrl(): string {
  return process.env.NEXT_PUBLIC_PLAY_STORE_URL || `https://play.google.com/store/apps/details?id=${APP_PACKAGE}`;
}

/** Is dit pad een spellink ("/<game-ID>:<spelcode>")? Die pagina werkt zonder inloggen. */
export function isEventLinkPath(path: string): boolean {
  const parts = path.split('/').filter(Boolean);
  if (parts.length !== 1) return false;
  let first = parts[0]!;
  try {
    first = decodeURIComponent(first);
  } catch {
    return false;
  }
  return first.includes(':') && parseEventLink(first) !== null;
}

/** Inhoud van /.well-known/apple-app-site-association: welke links de iPhone-app opent. */
export function appleAppSiteAssociation(teamId: string | undefined) {
  const appIDs = teamId ? [`${teamId.trim()}.${APP_PACKAGE}`] : [];
  return {
    applinks: {
      details: [
        {
          appIDs,
          components: [
            // De resultatenpagina is voor de spelleiding, niet voor de app.
            { '/': '/resultaten/*', exclude: true },
            { '/': '/*:*', comment: 'Spellink: /<game-ID>:<spelcode>' },
          ],
        },
      ],
    },
  };
}

/** Inhoud van /.well-known/assetlinks.json: welke links de Android-app opent. */
export function androidAssetLinks(fingerprints: string | undefined) {
  const list = (fingerprints ?? '')
    .split(/[\s,]+/)
    .map((f) => f.trim().toUpperCase())
    .filter(Boolean);
  if (list.length === 0) return [];
  return [
    {
      relation: ['delegate_permission/common.handle_all_urls'],
      target: { namespace: 'android_app', package_name: APP_PACKAGE, sha256_cert_fingerprints: list },
    },
  ];
}
