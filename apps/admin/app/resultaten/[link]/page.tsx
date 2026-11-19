'use client';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { parseEventLink } from '@/lib/event-links';
import { useLanguage } from '@/lib/language';
import { supabase } from '@/lib/supabase';

/**
 * Resultatenlink: /resultaten/<game-ID>:<spelcode>. Zoekt het event bij de
 * spelcode en opent de resultatenpagina (/sessies/<id>). Alleen voor wie het
 * event mag zien; wie niet is ingelogd, logt eerst in en komt dan hier terug.
 */
export default function ResultsLinkPage() {
  const { link: raw } = useParams<{ link: string }>();
  const { t } = useLanguage();
  const { user, org } = useAuth();
  const router = useRouter();
  const parsed = parseEventLink(raw);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    if (!user || !org || !parsed) return;
    let alive = true;
    void supabase()
      .from('sessions')
      .select('id')
      .eq('join_code', parsed.code)
      .maybeSingle()
      .then(({ data }) => {
        if (!alive) return;
        if (data) router.replace(`/sessies/${(data as { id: string }).id}`);
        else setMissing(true);
      });
    return () => {
      alive = false;
    };
    // parsed is afgeleid van raw
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [raw, user, org, router]);

  if (!parsed || missing) {
    return (
      <>
        <h1>{t('Resultaten niet gevonden')}</h1>
        <p>{t('Er is geen ticket met deze spelcode, of je hebt geen toegang tot dit ticket.')}</p>
        <p>
          <Link href="/sessies">{t('Naar het overzicht')}</Link>
        </p>
      </>
    );
  }
  return <p className="muted">{t('Laden…')}</p>;
}
