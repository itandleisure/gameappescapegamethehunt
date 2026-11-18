'use client';
// Fotoboek opslaan en ophalen (tabel photobooks, bucket photobooks).
import { isAdminLanguage, type AdminLanguage } from './i18n';
import { parseItems, type BookItem, type Photobook } from './photobook';
import { loadAsJpeg } from './photobook-pdf';
import { supabase } from './supabase';

const COLUMNS = 'session_id, title, intro, items, show_ranking, language, pdf_path, pdf_made_at, share_token, shared';
const BUCKET = 'photobooks';

export async function loadPhotobook(sessionId: string): Promise<Photobook | null> {
  const { data, error } = await supabase().from('photobooks').select(COLUMNS).eq('session_id', sessionId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const row = data as Omit<Photobook, 'items' | 'language'> & { items: unknown; language: string };
  return { ...row, items: parseItems(row.items), language: isAdminLanguage(row.language) ? row.language : 'nl' };
}

/** Bewaart titel, tekst en de gekozen foto's. Geeft het opgeslagen fotoboek terug (met de geheime link). */
export async function savePhotobook(
  book: Pick<Photobook, 'session_id' | 'title' | 'intro' | 'items' | 'show_ranking' | 'language'> & Partial<Photobook>,
): Promise<Photobook> {
  const db = supabase();
  const { data: auth } = await db.auth.getUser();
  const row = {
    session_id: book.session_id,
    title: book.title,
    intro: book.intro,
    items: book.items,
    show_ranking: book.show_ranking,
    language: book.language,
    ...(book.shared === undefined ? {} : { shared: book.shared }),
    ...(book.pdf_path === undefined ? {} : { pdf_path: book.pdf_path, pdf_made_at: book.pdf_made_at }),
    updated_at: new Date().toISOString(),
    updated_by: auth.user?.id ?? null,
  };
  const { data, error } = await db.from('photobooks').upsert(row).select(COLUMNS).single();
  if (error) throw new Error(error.message);
  const saved = data as Omit<Photobook, 'items' | 'language'> & { items: unknown; language: string };
  return { ...saved, items: parseItems(saved.items), language: isAdminLanguage(saved.language) ? (saved.language as AdminLanguage) : 'nl' };
}

export async function setShared(sessionId: string, shared: boolean): Promise<void> {
  const { error } = await supabase().from('photobooks').update({ shared }).eq('session_id', sessionId);
  if (error) throw new Error(error.message);
}

export async function rotateToken(sessionId: string): Promise<string> {
  const { data, error } = await supabase().rpc('rotate_photobook_token', { p_session: sessionId });
  if (error) throw new Error(error.message);
  return data as string;
}

/** Eigen foto: verkleind tot 2048 px (JPEG) en in de map van de sessie gezet. */
export async function uploadOwnPhoto(sessionId: string, file: File): Promise<string> {
  const img = await loadAsJpeg(file, 2048, 0.88);
  const path = `${sessionId}/eigen/${crypto.randomUUID()}.jpg`;
  const { error } = await supabase()
    .storage.from(BUCKET)
    .upload(path, new Blob([img.bytes as BlobPart], { type: 'image/jpeg' }), { contentType: 'image/jpeg' });
  if (error) throw new Error(error.message);
  return path;
}

/** Alle eigen foto's van de sessie, ook die niet (meer) in het fotoboek staan. */
export async function listOwnPhotos(sessionId: string): Promise<string[]> {
  const { data, error } = await supabase()
    .storage.from(BUCKET)
    .list(`${sessionId}/eigen`, { limit: 1000, sortBy: { column: 'created_at', order: 'asc' } });
  if (error) throw new Error(error.message);
  return (data ?? []).filter((f) => f.name && !f.name.startsWith('.')).map((f) => `${sessionId}/eigen/${f.name}`);
}

export async function deleteOwnPhoto(path: string): Promise<void> {
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
  for (const [source, bucket] of [
    ['game', 'photos'],
    ['own', BUCKET],
  ] as const) {
    const paths = items.filter((i) => i.source === source).map((i) => i.path);
    if (!paths.length) continue;
    const { data, error } = await supabase().storage.from(bucket).createSignedUrls(paths, 60 * 60);
    if (error) throw new Error(error.message);
    for (const row of data ?? []) if (row.path && row.signedUrl) out.set(row.path, row.signedUrl);
  }
  return out;
}

export async function signPdf(path: string): Promise<string | null> {
  const { data } = await supabase().storage.from(BUCKET).createSignedUrl(path, 60 * 60);
  return data?.signedUrl ?? null;
}

/** Link voor de klant: de fotoboekpagina van de beheerapp, zonder inloggen. */
export function shareLink(token: string): string {
  return `${window.location.origin}/fotoboek/${token}`;
}
