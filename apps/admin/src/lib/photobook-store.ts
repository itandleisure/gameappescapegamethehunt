'use client';
// Fotoboek opslaan en ophalen (tabellen photobooks en photobook_settings,
// bucket photobooks).
import { isAdminLanguage, t } from './i18n';
import { parseGames, parseItems, parseLinks, type BookItem, type BookLinks, type Photobook, type PhotobookSettings } from './photobook';
import { loadAsJpeg } from './photobook-pdf';
import { supabase } from './supabase';

const COLUMNS =
  'session_id, title, city, intro, items, show_ranking, language, pdf_path, pdf_made_at, share_token, share_password, shared, shared_until';
const BUCKET = 'photobooks';

type Row = Omit<Photobook, 'items' | 'language'> & { items: unknown; language: string };
const fromRow = (row: Row): Photobook => ({
  ...row,
  items: parseItems(row.items),
  language: isAdminLanguage(row.language) ? row.language : 'nl',
});

export async function loadPhotobook(sessionId: string): Promise<Photobook | null> {
  const { data, error } = await supabase().from('photobooks').select(COLUMNS).eq('session_id', sessionId).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? fromRow(data as Row) : null;
}

/** Bewaart stad, titel, tekst en de gekozen foto's. Geeft het opgeslagen fotoboek terug (met link en wachtwoord). */
export async function savePhotobook(
  book: Pick<Photobook, 'session_id' | 'title' | 'city' | 'intro' | 'items' | 'show_ranking' | 'language'> &
    Partial<Pick<Photobook, 'pdf_path' | 'pdf_made_at'>>,
): Promise<Photobook> {
  const db = supabase();
  const { data: auth } = await db.auth.getUser();
  const row = {
    session_id: book.session_id,
    title: book.title,
    city: book.city,
    intro: book.intro,
    items: book.items,
    show_ranking: book.show_ranking,
    language: book.language,
    ...(book.pdf_path === undefined ? {} : { pdf_path: book.pdf_path, pdf_made_at: book.pdf_made_at }),
    updated_at: new Date().toISOString(),
    updated_by: auth.user?.id ?? null,
  };
  const { data, error } = await db.from('photobooks').upsert(row).select(COLUMNS).single();
  if (error) throw new Error(error.message);
  return fromRow(data as Row);
}

/** Delen aan of uit; aanzetten (of verlengen) geeft 28 dagen vanaf nu. Geeft de einddatum terug. */
export async function setShared(sessionId: string, shared: boolean): Promise<string | null> {
  const { data, error } = await supabase().rpc('share_photobook', { p_session: sessionId, p_shared: shared });
  if (error) throw new Error(error.message);
  return (data as string | null) ?? null;
}

/** Nieuwe link en nieuw wachtwoord. */
export async function rotateToken(sessionId: string): Promise<Photobook> {
  const { error } = await supabase().rpc('rotate_photobook_token', { p_session: sessionId });
  if (error) throw new Error(error.message);
  const book = await loadPhotobook(sessionId);
  if (!book) throw new Error('Fotoboek niet gevonden');
  return book;
}

async function uploadJpeg(path: string, file: File | Blob): Promise<string> {
  const img = await loadAsJpeg(file, 2048, 0.88);
  const { error } = await supabase()
    .storage.from(BUCKET)
    .upload(path, new Blob([img.bytes as BlobPart], { type: 'image/jpeg' }), { contentType: 'image/jpeg' });
  if (error) throw new Error(error.message);
  return path;
}

/** Eigen foto: verkleind tot 2048 px (JPEG) en in de map van de sessie gezet. */
export function uploadOwnPhoto(sessionId: string, file: File): Promise<string> {
  return uploadJpeg(`${sessionId}/eigen/${crypto.randomUUID()}.jpg`, file);
}

/** Alle eigen foto's van de sessie, ook die niet (meer) in het fotoboek staan. */
export async function listOwnPhotos(sessionId: string): Promise<string[]> {
  const { data, error } = await supabase()
    .storage.from(BUCKET)
    .list(`${sessionId}/eigen`, { limit: 1000, sortBy: { column: 'created_at', order: 'asc' } });
  if (error) throw new Error(error.message);
  return (data ?? []).filter((f) => f.name && !f.name.startsWith('.')).map((f) => `${sessionId}/eigen/${f.name}`);
}

export async function deleteFile(path: string): Promise<void> {
  const { error } = await supabase().storage.from(BUCKET).remove([path]);
  if (error) throw new Error(error.message);
}

export async function uploadPdf(sessionId: string, bytes: Uint8Array): Promise<string> {
  const path = `${sessionId}/fotoboek.pdf`;
  const { error } = await supabase()
    .storage.from(BUCKET)
    .upload(path, new Blob([bytes as BlobPart], { type: 'application/pdf' }), { contentType: 'application/pdf', upsert: true });
  if (error) throw new Error(error.message);
  return path;
}

/** Tijdelijke links (1 uur) naar foto's, per bron. */
export async function signItems(items: readonly Pick<BookItem, 'source' | 'path'>[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const groups: [string, string[]][] = [
    ['photos', items.filter((i) => i.source === 'game').map((i) => i.path)],
    [BUCKET, items.filter((i) => i.source !== 'game').map((i) => i.path)],
  ];
  for (const [bucket, paths] of groups) {
    if (!paths.length) continue;
    const { data, error } = await supabase().storage.from(bucket).createSignedUrls([...new Set(paths)], 60 * 60);
    if (error) throw new Error(error.message);
    for (const row of data ?? []) if (row.path && row.signedUrl) out.set(row.path, row.signedUrl);
  }
  return out;
}

export async function signPdf(path: string): Promise<string | null> {
  const { data } = await supabase().storage.from(BUCKET).createSignedUrl(path, 60 * 60);
  return data?.signedUrl ?? null;
}

/** Link voor de klant: de fotoboekpagina van de beheerapp, met wachtwoord. */
export function shareLink(token: string): string {
  return `${window.location.origin}/fotoboek/${token}`;
}

// -----------------------------------------------------------------------------
// Vaste onderdelen per organisatie
// -----------------------------------------------------------------------------

export async function loadSettings(orgId: string): Promise<PhotobookSettings> {
  const { data, error } = await supabase()
    .from('photobook_settings')
    .select('org_id, cover_path, stock_paths, links, games')
    .eq('org_id', orgId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const row = data as { org_id: string; cover_path: string | null; stock_paths: unknown; links: unknown; games: unknown } | null;
  return {
    org_id: orgId,
    cover_path: row?.cover_path ?? null,
    stock_paths: Array.isArray(row?.stock_paths) ? (row!.stock_paths as unknown[]).filter((p): p is string => typeof p === 'string') : [],
    links: parseLinks(row?.links),
    games: parseGames(row ? row.games : null),
  };
}

export async function saveSettings(settings: PhotobookSettings): Promise<void> {
  const links: BookLinks = parseLinks(settings.links);
  const { error } = await supabase().from('photobook_settings').upsert({
    org_id: settings.org_id,
    cover_path: settings.cover_path,
    stock_paths: settings.stock_paths,
    links,
    games: settings.games
      .filter((g) => g.name.trim())
      .map((g) => ({ name: g.name.trim(), text: g.text.trim(), url: g.url.trim(), image_path: g.image_path ?? null })),
    updated_at: new Date().toISOString(),
  });
  if (error) throw new Error(error.message);
}

/** Vaste foto van de organisatie, onder huisstijl/<organisatie>/. */
export function uploadStockPhoto(orgId: string, file: File | Blob): Promise<string> {
  return uploadJpeg(`huisstijl/${orgId}/${crypto.randomUUID()}.jpg`, file);
}

/** De organisatie die de sessie draait (de vaste onderdelen komen van haar). */
export async function sessionOrg(sessionId: string): Promise<string | null> {
  const { data } = await supabase().from('sessions').select('org_id').eq('id', sessionId).maybeSingle();
  return (data as { org_id: string } | null)?.org_id ?? null;
}

/**
 * Haalt de voorbeeldfoto van een webpagina op (via de server, want de browser
 * mag een andere website niet uitlezen) en zet hem bij de vaste foto's van de
 * organisatie. Geeft het pad terug.
 */
export async function importPageImage(orgId: string, url: string): Promise<string> {
  const { data } = await supabase().auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error(t('Log opnieuw in.'));
  let res: Response;
  try {
    res = await fetch('/api/pagina-foto', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ url }),
    });
  } catch {
    throw new Error(t('Geen verbinding met de server.'));
  }
  if (!res.ok || !(res.headers.get('content-type') ?? '').startsWith('image/')) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? t('De server gaf een fout ({status}). Probeer het opnieuw.', { status: res.status }));
  }
  return uploadStockPhoto(orgId, await res.blob());
}
