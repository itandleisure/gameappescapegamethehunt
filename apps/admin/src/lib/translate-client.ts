'use client';
import { t } from './i18n';
import { supabase } from './supabase';
import type { Translations } from './task-translate';

/** Vraagt de server (/api/vertalen) om teksten te vertalen. */
export async function translateTexts(source: string, targets: readonly string[], texts: Record<string, string>): Promise<Translations> {
  const { data } = await supabase().auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error(t('Log opnieuw in om te vertalen.'));
  let res: Response;
  try {
    res = await fetch('/api/vertalen', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ source, targets, texts }),
    });
  } catch {
    throw new Error(t('Geen verbinding met de vertaaldienst.'));
  }
  const body = (await res.json().catch(() => ({}))) as { translations?: Translations; error?: string };
  if (!res.ok || !body.translations) throw new Error(body.error ? t(body.error) : t('Vertalen is mislukt. Probeer het opnieuw.'));
  return body.translations;
}
