// Edge function: het fotoboek van een hunt ophalen met link en wachtwoord.
//
//   POST /functions/v1/photobook   { "token": "…", "password": "XXXX-XXXX-XXXX" } → JSON
//
// Voor de fotoboekpagina die de klant krijgt. Geeft titel, stad, tekst, de
// cijfers per team en de gekozen foto's in volgorde, met tijdelijke links
// (1 dag) naar de foto's, de omslagfoto en de PDF. Werkt alleen als "delen met
// de klant" aan staat en de 28 dagen nog niet voorbij zijn. Alleen foto's van
// de eigen sessie en organisatie komen mee (dat bewaakt shared_photobook).
//
// Antwoorden: 200 fotoboek, 401 verkeerd wachtwoord, 404 onbekend of niet
// gedeeld, 410 verlopen.
import { createClient } from 'jsr:@supabase/supabase-js@2';

const LINK_SECONDS = 24 * 60 * 60;
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, apikey, content-type, x-client-info',
  'access-control-allow-methods': 'POST, OPTIONS',
};

interface Item {
  source: 'game' | 'own' | 'stock';
  path: string;
  caption?: string;
  large?: boolean;
  url?: string;
}

interface Book {
  items: Item[];
  cover_path: string | null;
  cover_url?: string | null;
  pdf_path: string | null;
  pdf_url?: string | null;
}

const fail = (status: number, error: string) => Response.json({ error }, { status, headers: CORS });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (req.method !== 'POST') return fail(405, 'Alleen POST');
  let body: { token?: unknown; password?: unknown };
  try {
    body = await req.json();
  } catch {
    return fail(400, 'Ongeldige aanvraag');
  }
  const token = typeof body.token === 'string' ? body.token : '';
  const password = typeof body.password === 'string' ? body.password : '';
  if (token.length < 24) return fail(404, 'not_found');

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  });
  const { data, error } = await supabase.rpc('shared_photobook', { p_token: token, p_password: password });
  if (error) {
    if (error.code === '28P01') return fail(401, 'wrong_password');
    if (error.code === 'HT410') return fail(410, 'expired');
    return fail(404, 'not_found');
  }
  const book = data as Book;

  const sign = async (bucket: string, paths: string[]) => {
    if (paths.length === 0) return new Map<string, string>();
    const { data: rows } = await supabase.storage.from(bucket).createSignedUrls([...new Set(paths)], LINK_SECONDS);
    return new Map((rows ?? []).filter((r) => r.path && r.signedUrl).map((r) => [r.path!, r.signedUrl]));
  };
  const game = await sign('photos', book.items.filter((i) => i.source === 'game').map((i) => i.path));
  const files = await sign('photobooks', [
    ...book.items.filter((i) => i.source !== 'game').map((i) => i.path),
    ...(book.cover_path ? [book.cover_path] : []),
    ...(book.pdf_path ? [book.pdf_path] : []),
  ]);
  for (const item of book.items) item.url = (item.source === 'game' ? game : files).get(item.path);
  book.items = book.items.filter((i) => i.url);
  book.cover_url = book.cover_path ? (files.get(book.cover_path) ?? null) : null;
  book.pdf_url = book.pdf_path ? (files.get(book.pdf_path) ?? null) : null;

  return Response.json(book, { headers: { ...CORS, 'cache-control': 'no-store' } });
});
