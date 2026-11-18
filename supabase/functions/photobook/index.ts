// Edge function: het fotoboek van een hunt ophalen via de geheime link.
//
//   GET /functions/v1/photobook?token=<share_token> → JSON
//
// Voor de fotoboekpagina die de klant krijgt. Geeft titel, introtekst,
// ranglijst en de gekozen foto's in volgorde, met tijdelijke links (7 dagen)
// naar de foto's en de PDF. Werkt alleen als "delen met de klant" aan staat.
// Alleen foto's van de eigen sessie komen mee (dat bewaakt shared_photobook).
import { createClient } from 'jsr:@supabase/supabase-js@2';

const LINK_SECONDS = 7 * 24 * 60 * 60;
const CORS = { 'access-control-allow-origin': '*' };

interface Item {
  source: 'game' | 'own';
  path: string;
  caption?: string;
  large?: boolean;
  url?: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: { ...CORS, 'access-control-allow-headers': 'authorization, apikey, content-type' } });
  }
  if (req.method !== 'GET') return new Response('Alleen GET', { status: 405, headers: CORS });
  const token = new URL(req.url).searchParams.get('token') ?? '';
  if (token.length < 24) return new Response('Ontbrekende of ongeldige token', { status: 400, headers: CORS });

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  });
  const { data, error } = await supabase.rpc('shared_photobook', { p_token: token });
  if (error || !data) return new Response('Fotoboek niet gevonden of niet gedeeld', { status: 404, headers: CORS });
  const book = data as { items: Item[]; pdf_path: string | null; pdf_url?: string | null };

  const sign = async (bucket: string, paths: string[]) => {
    if (paths.length === 0) return new Map<string, string>();
    const { data: rows } = await supabase.storage.from(bucket).createSignedUrls(paths, LINK_SECONDS);
    return new Map((rows ?? []).filter((r) => r.path && r.signedUrl).map((r) => [r.path!, r.signedUrl]));
  };
  const game = await sign('photos', book.items.filter((i) => i.source === 'game').map((i) => i.path));
  const own = await sign('photobooks', [
    ...book.items.filter((i) => i.source === 'own').map((i) => i.path),
    ...(book.pdf_path ? [book.pdf_path] : []),
  ]);
  for (const item of book.items) item.url = (item.source === 'game' ? game : own).get(item.path);
  book.items = book.items.filter((i) => i.url);
  book.pdf_url = book.pdf_path ? (own.get(book.pdf_path) ?? null) : null;

  return Response.json(book, { headers: { ...CORS, 'cache-control': 'no-store' } });
});
