// Edge function: de webshop maakt een ticket aan.
//
//   POST /functions/v1/webshop-ticket
//   Authorization: Bearer <webshopsleutel>      (of X-Webshop-Key: <webshopsleutel>)
//   { "game": "the-hunt-leeuwarden", "teams": 4, "order": "WS-1001",
//     "name": "Jansen, 20 personen", "starts_at": "2026-12-05T14:00:00+01:00" }
//
//   201 → { "code": "K7QX2", "link": "https://…/the-hunt-leeuwarden:K7QX2", "max_teams": 4, … }
//   200 → hetzelfde, als deze bestelling al eerder een ticket kreeg ("existing": true)
//
// Het ticket staat meteen open en laat maximaal "teams" teams inloggen. De
// webshopsleutel maakt een beheerder in Instellingen › Webshop. Uitleg voor de
// webshopbouwer: docs/webshop.md.
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { httpError, parseOrder, playLink, readKey } from './request.ts';

const PLAY_ORIGIN = Deno.env.get('SPEL_DOMEIN') ?? 'https://escapegamethehunt.badassgames.nl';

Deno.serve(async (req) => {
  if (req.method !== 'POST') return Response.json({ error: 'Alleen POST.' }, { status: 405 });
  const key = readKey(req.headers);
  if (key.length < 20) return Response.json({ error: 'Webshopsleutel ontbreekt.' }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Stuur een JSON-object.' }, { status: 400 });
  }
  const parsed = parseOrder(body);
  if (!parsed.ok) return Response.json({ error: parsed.error }, { status: 400 });
  const { order } = parsed;

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  });
  const { data, error } = await supabase.rpc('webshop_create_ticket', {
    p_key: key,
    p_game: order.game,
    p_teams: order.teams,
    p_order: order.order,
    p_name: order.name ?? null,
    p_starts_at: order.starts_at ?? null,
  });
  if (error) {
    const e = httpError(error);
    if (e.status === 500) console.error('webshop-ticket', error);
    return Response.json({ error: e.error }, { status: e.status });
  }
  const ticket = data as { code: string; game_id: string; existing: boolean };
  return Response.json(
    { ...ticket, link: playLink(PLAY_ORIGIN, ticket.game_id, ticket.code) },
    { status: ticket.existing ? 200 : 201 },
  );
});
