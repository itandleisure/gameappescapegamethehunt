'use client';
import { t } from './i18n';
import { supabase } from './supabase';
import type { Translations } from './task-translate';

/** Eén aanvraag naar de server (/api/vertalen) voor één doeltaal. */
async function translateOne(token: string, source: string, target: string, texts: Record<string, string>): Promise<Record<string, string>> {
  let res: Response;
  try {
    res = await fetch('/api/vertalen', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ source, targets: [target], texts }),
    });
  } catch {
    throw new Error(t('Geen verbinding met de vertaaldienst.'));
  }
  const raw = await res.text();
  let body: { translations?: Translations; error?: string } = {};
  try {
    body = JSON.parse(raw) as typeof body;
  } catch {
    // Geen JSON: de server zelf viel om of stopte (bijvoorbeeld een time-out bij Vercel).
    if (res.status === 504) throw new Error(t('Het vertalen duurde te lang (time-out op de server). Probeer het opnieuw.'));
    throw new Error(t('De server gaf een fout ({status}). Probeer het opnieuw.', { status: res.status }));
  }
  if (!res.ok || !body.translations) throw new Error(body.error ?? t('De server gaf een fout ({status}). Probeer het opnieuw.', { status: res.status }));
  return body.translations[target] ?? {};
}

/**
 * Vertaalt teksten naar alle doeltalen. Per taal een eigen aanvraag, tegelijk:
 * dat is sneller en blijft ruim binnen de tijdslimiet van de server.
 */
export async function translateTexts(source: string, targets: readonly string[], texts: Record<string, string>): Promise<Translations> {
  const { data } = await supabase().auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error(t('Log opnieuw in om te vertalen.'));
  const results = await Promise.allSettled(targets.map((l) => translateOne(token, source, l, texts)));
  const out: Translations = {};
  const failed: string[] = [];
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') out[targets[i]!] = r.value;
    else failed.push(`${targets[i]!.toUpperCase()}: ${r.reason instanceof Error ? r.reason.message : String(r.reason)}`);
  });
  if (failed.length === targets.length) {
    // Overal dezelfde fout: die één keer tonen.
    const reasons = [...new Set(failed.map((f) => f.replace(/^\w+: /, '')))];
    throw new Error(reasons.length === 1 ? reasons[0]! : failed.join(' · '));
  }
  if (failed.length) throw new PartialTranslation(out, failed);
  return out;
}

/** Een deel van de talen is gelukt; de rest staat in `failed`. */
export class PartialTranslation extends Error {
  constructor(
    readonly translations: Translations,
    readonly failed: string[],
  ) {
    super(t('Niet gelukt voor: {list}', { list: failed.join(' · ') }));
  }
}
