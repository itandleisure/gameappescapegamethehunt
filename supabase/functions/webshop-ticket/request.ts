// Bestelling uit de webshop lezen en controleren, zonder Supabase (los te testen).

export interface WebshopOrder {
  /** Game-ID van het spel, bijv. "the-hunt-leeuwarden". */
  game: string;
  /** Aantal teams (spelcodes) dat gekocht is: zoveel teams mogen inloggen. */
  teams: number;
  /** Bestelnummer van de webshop; dezelfde bestelling nog eens geeft hetzelfde ticket. */
  order: string;
  /** Naam van het ticket in de beheeromgeving, bijv. "Jansen, 20 personen". */
  name?: string;
  /** Startmoment (ISO 8601), optioneel. */
  starts_at?: string;
}

export type Parsed = { ok: true; order: WebshopOrder } | { ok: false; error: string };

/** Webshopsleutel uit "Authorization: Bearer <sleutel>" of "X-Webshop-Key: <sleutel>". */
export function readKey(headers: Headers): string {
  const auth = headers.get('authorization') ?? '';
  const bearer = /^Bearer\s+(.+)$/i.exec(auth.trim());
  return (headers.get('x-webshop-key') ?? bearer?.[1] ?? '').trim();
}

export function parseOrder(body: unknown): Parsed {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { ok: false, error: 'Stuur een JSON-object.' };
  const b = body as Record<string, unknown>;
  const game = typeof b.game === 'string' ? b.game.trim() : '';
  if (!game) return { ok: false, error: 'Veld "game" (game-ID, bijv. the-hunt-leeuwarden) ontbreekt.' };
  const teams = typeof b.teams === 'string' && /^\d+$/.test(b.teams.trim()) ? Number(b.teams) : b.teams;
  if (typeof teams !== 'number' || !Number.isInteger(teams) || teams < 1 || teams > 500) {
    return { ok: false, error: 'Veld "teams" moet een heel getal van 1 tot 500 zijn.' };
  }
  const order = typeof b.order === 'number' ? String(b.order) : typeof b.order === 'string' ? b.order.trim() : '';
  if (!order || order.length > 100) return { ok: false, error: 'Veld "order" (bestelnummer, hooguit 100 tekens) ontbreekt.' };
  const out: WebshopOrder = { game, teams, order };
  if (b.name != null) {
    if (typeof b.name !== 'string') return { ok: false, error: 'Veld "name" moet tekst zijn.' };
    if (b.name.trim()) out.name = b.name.trim().slice(0, 120);
  }
  if (b.starts_at != null && b.starts_at !== '') {
    if (typeof b.starts_at !== 'string' || Number.isNaN(Date.parse(b.starts_at))) {
      return { ok: false, error: 'Veld "starts_at" moet een datum en tijd zijn (ISO 8601), bijv. 2026-12-05T14:00:00+01:00.' };
    }
    out.starts_at = new Date(b.starts_at).toISOString();
  }
  return { ok: true, order: out };
}

/** Spellink zoals op het ticket: https://<spel-domein>/<game-ID>:<spelcode>. */
export function playLink(origin: string, gameId: string, code: string): string {
  const o = origin.trim().replace(/\/+$/, '');
  return `${/^https?:\/\//.test(o) ? o : `https://${o}`}/${gameId}:${code}`;
}

/** Databasefout → HTTP-status en een tekst voor de webshop. */
export function httpError(error: { code?: string; message?: string }): { status: number; error: string } {
  switch (error.code) {
    case '28000':
      return { status: 401, error: 'Ongeldige webshopsleutel.' };
    case 'P0002':
      return { status: 404, error: error.message ?? 'Spel niet gevonden.' };
    case '22023':
      return { status: 400, error: error.message ?? 'Ongeldige bestelling.' };
    default:
      return { status: 500, error: 'Er ging iets mis bij het maken van het ticket.' };
  }
}
