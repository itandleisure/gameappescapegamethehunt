/**
 * POST /api/pagina-foto: haalt de voorbeeldfoto (og:image) van een webpagina
 * op, voor de blokken "Meer spellen" in het fotoboek.
 *
 * Een browser mag een andere website niet zomaar uitlezen, daarom doet de
 * server dat. Alleen ingelogde partners, beheerders en eigenaren mogen het, en
 * alleen voor gewone websites (niet de server zelf of een intern netwerk).
 *
 * Invoer:  { url: "https://badassgames.nl/the-hundred" }
 * Uitvoer: de foto zelf (image/jpeg, image/png, ...), of { error } als JSON.
 */
import { lookup } from 'node:dns/promises';
import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { findPageImage, isPublicHost, isPublicUrl } from '@/lib/page-image';
import { SUPABASE_ANON_KEY, SUPABASE_URL } from '@/lib/supabase-config';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const MAX_PAGE = 3 * 1024 * 1024;
const MAX_IMAGE = 15 * 1024 * 1024;
const TIMEOUT_MS = 12_000;
const USER_AGENT = 'Mozilla/5.0 (compatible; HuntPhotobook/1.0)';

const json = (status: number, body: unknown) => NextResponse.json(body, { status });

/** Haalt een link op, volgt doorverwijzingen zelf en controleert elke stap. */
async function safeFetch(url: string, accept: string): Promise<Response> {
  let current = url;
  for (let hop = 0; hop < 5; hop++) {
    if (!isPublicUrl(current)) throw new Error('Deze link kan niet worden opgehaald.');
    const { hostname } = new URL(current);
    const addresses = await lookup(hostname, { all: true }).catch(() => []);
    if (addresses.length === 0 || addresses.some((a) => !isPublicHost(a.address))) {
      throw new Error('Deze website is niet bereikbaar.');
    }
    const res = await fetch(current, {
      redirect: 'manual',
      headers: { 'user-agent': USER_AGENT, accept },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const next = res.headers.get('location');
    if (res.status >= 300 && res.status < 400 && next) {
      current = new URL(next, current).toString();
      continue;
    }
    return res;
  }
  throw new Error('Te veel doorverwijzingen.');
}

async function readLimited(res: Response, max: number): Promise<Uint8Array> {
  const reader = res.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel();
      throw new Error('Het bestand is te groot.');
    }
    chunks.push(value);
  }
  const out = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.byteLength;
  }
  return out;
}

export async function POST(request: Request) {
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return json(401, { error: 'Log opnieuw in.' });
  const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: who, error: authError } = await db.auth.getUser(token);
  if (authError || !who.user || who.user.is_anonymous) return json(401, { error: 'Log opnieuw in.' });
  const { data: roles } = await db.from('memberships').select('role').eq('user_id', who.user.id);
  if (!(roles ?? []).some((r: { role: string }) => ['owner', 'admin', 'editor'].includes(r.role))) {
    return json(403, { error: 'Alleen beheerders en partners kunnen dit.' });
  }

  let body: { url?: unknown };
  try {
    body = (await request.json()) as { url?: unknown };
  } catch {
    return json(400, { error: 'Ongeldige aanvraag.' });
  }
  const raw = typeof body.url === 'string' ? body.url.trim() : '';
  const url = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  if (!raw || !isPublicUrl(url)) return json(400, { error: 'Vul een geldige link in.' });

  try {
    const page = await safeFetch(url, 'text/html,application/xhtml+xml');
    if (!page.ok) return json(502, { error: `De pagina gaf een fout (${page.status}).` });
    const type = page.headers.get('content-type') ?? '';
    if (type.startsWith('image/') && !type.includes('svg')) {
      const bytes = await readLimited(page, MAX_IMAGE);
      return new NextResponse(bytes as BodyInit, { headers: { 'content-type': type, 'cache-control': 'no-store' } });
    }
    const html = new TextDecoder().decode(await readLimited(page, MAX_PAGE));
    const imageUrl = findPageImage(html, page.url || url);
    if (!imageUrl) return json(404, { error: 'Op deze pagina staat geen foto die we kunnen gebruiken.' });

    const img = await safeFetch(imageUrl, 'image/avif,image/webp,image/png,image/jpeg,image/*');
    const imgType = img.headers.get('content-type') ?? '';
    if (!img.ok || !imgType.startsWith('image/') || imgType.includes('svg')) {
      return json(502, { error: 'De foto van deze pagina kon niet worden opgehaald.' });
    }
    const bytes = await readLimited(img, MAX_IMAGE);
    return new NextResponse(bytes as BodyInit, { headers: { 'content-type': imgType, 'cache-control': 'no-store' } });
  } catch (err) {
    const message = err instanceof Error && !/fetch failed|aborted|timeout/i.test(err.message) ? err.message : 'De pagina is niet bereikbaar.';
    return json(502, { error: message });
  }
}
