'use client';
import { useCallback, useEffect, useState } from 'react';
import { displayName } from '@/lib/game-name';
import { useLanguage } from '@/lib/language';
import { useAuth } from '@/lib/auth';
import { SUPABASE_URL } from '@/lib/supabase-config';
import { supabase } from '@/lib/supabase';
import { SettingsNav } from '@/settings/SettingsNav';

interface KeyRow {
  created_at: string;
  last_used_at: string | null;
}

interface GameRow {
  public_id: string;
  layer: 'base' | 'city' | 'client';
  slug: string;
  settings: Record<string, unknown>;
}

/** Adres waar de webshop een bestelling heen stuurt. */
const WEBSHOP_ENDPOINT = `${SUPABASE_URL.replace(/\/+$/, '')}/functions/v1/webshop-ticket`;

/**
 * Instellingen › Webshop: de sleutel waarmee de webshop zelf tickets aanmaakt,
 * het adres, een voorbeeld en de game-ID's van de spellen.
 */
export default function WebshopSettingsPage() {
  const { org } = useAuth();
  const { t, locale } = useLanguage();
  const [key, setKey] = useState<KeyRow | null | undefined>(undefined);
  const [games, setGames] = useState<GameRow[]>([]);
  const [fresh, setFresh] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canEdit = org?.role === 'owner' || org?.role === 'admin';

  const load = useCallback(async () => {
    if (!org) return;
    const db = supabase();
    const [k, g] = await Promise.all([
      db.from('webshop_keys').select('created_at, last_used_at').eq('org_id', org.id).maybeSingle(),
      db.from('games').select('public_id, layer, slug, settings').eq('org_id', org.id).neq('layer', 'base').order('public_id'),
    ]);
    if (k.error) setError(k.error.message);
    setKey((k.data as KeyRow | null) ?? null);
    setGames((g.data ?? []) as GameRow[]);
  }, [org]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!org) return null;

  const when = (iso: string) => new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso));

  const makeKey = async () => {
    if (key && !window.confirm(t('Nieuwe webshopsleutel maken? De oude sleutel werkt daarna niet meer; zet de nieuwe meteen in de webshop.'))) return;
    setBusy(true);
    setError(null);
    const { data, error: e } = await supabase().rpc('new_webshop_key', { p_org: org.id });
    setBusy(false);
    if (e) setError(e.message);
    else {
      setFresh(data as string);
      void load();
    }
  };

  const removeKey = async () => {
    if (!window.confirm(t('Webshopsleutel verwijderen? De webshop kan dan geen tickets meer aanmaken.'))) return;
    const { error: e } = await supabase().from('webshop_keys').delete().eq('org_id', org.id);
    if (e) setError(e.message);
    else {
      setFresh(null);
      void load();
    }
  };

  const example = `curl -X POST ${WEBSHOP_ENDPOINT} \\
  -H "Authorization: Bearer ${fresh ?? '<webshopsleutel>'}" \\
  -H "Content-Type: application/json" \\
  -d '{"game": "${games[0]?.public_id ?? 'the-hunt-leeuwarden'}", "teams": 4, "order": "WS-1001", "name": "Jansen, 20 personen"}'`;

  return (
    <>
      <h1>{t('Webshop')}</h1>
      <SettingsNav active="webshop" orgName={org.name} />
      <p className="muted">
        {t('Bij een bestelling stuurt de webshop een bericht met het spel, het aantal teams en het bestelnummer. Er komt dan meteen een open ticket waarmee precies dat aantal teams kan inloggen. De webshop krijgt de spelcode en de spellink terug voor in de bevestigingsmail. Dezelfde bestelling nog eens geeft hetzelfde ticket.')}
      </p>

      <div className="card">
        <h2>{t('Webshopsleutel')}</h2>
        {key === undefined ? (
          <p className="muted">{t('Laden…')}</p>
        ) : key ? (
          <p className="small">
            {t('Aangemaakt op {date}.', { date: when(key.created_at) })}{' '}
            {key.last_used_at ? t('Laatst gebruikt op {date}.', { date: when(key.last_used_at) }) : t('Nog niet gebruikt.')}
          </p>
        ) : (
          <p className="muted small">{t('Er is nog geen webshopsleutel.')}</p>
        )}
        {fresh ? (
          <>
            <p className="small">{t('Kopieer de sleutel nu en zet hem in de webshop. Hij is hierna niet meer te zien.')}</p>
            <p>
              <code className="bigcode" style={{ wordBreak: 'break-all' }}>{fresh}</code>
            </p>
          </>
        ) : null}
        {canEdit ? (
          <div className="actions">
            <button disabled={busy} onClick={() => void makeKey()}>
              {key ? t('Nieuwe sleutel maken') : t('Sleutel maken')}
            </button>
            {key ? (
              <button className="secondary" onClick={() => void removeKey()}>
                {t('Sleutel verwijderen')}
              </button>
            ) : null}
          </div>
        ) : (
          <p className="muted small">{t('Alleen een eigenaar of beheerder kan de webshopsleutel maken.')}</p>
        )}
        {error ? <p className="error">{error}</p> : null}
      </div>

      <div className="card">
        <h2>{t('Voor de webshopbouwer')}</h2>
        <p className="small">
          {t('Adres')}: <code style={{ wordBreak: 'break-all' }}>{WEBSHOP_ENDPOINT}</code>
        </p>
        <pre className="small" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{example}</pre>
        <p className="small muted">
          {t('Velden: game (game-ID hieronder), teams (1 tot 500), order (bestelnummer), en optioneel name (naam van het ticket) en starts_at (startmoment). Antwoord: code, link, max_teams en ticket_id.')}
        </p>
      </div>

      <div className="card">
        <h2>{t("Game-ID's")}</h2>
        {games.length === 0 ? (
          <p className="muted small">{t('Nog geen spellen.')}</p>
        ) : (
          <ul className="teamlist">
            {games.map((g) => (
              <li key={g.public_id}>
                <code>{g.public_id}</code> <span className="muted">{displayName(g)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
