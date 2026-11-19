'use client';
import qrcode from 'qrcode-generator';
import { useEffect, useMemo, useState } from 'react';
import { playUrl, resultsUrl, type EventLink } from '@/lib/event-links';
import { useLanguage } from '@/lib/language';
import { supabase } from '@/lib/supabase';

/** QR-code als SVG-tekst, met witte rand zodat elke scanner hem leest. */
export function qrSvg(text: string): string {
  const qr = qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  return qr.createSvgTag({ cellSize: 8, margin: 4, scalable: true });
}

function CopyRow({ label, url, help }: { label: string; url: string; help: string }) {
  const { t } = useLanguage();
  const [copied, setCopied] = useState(false);
  return (
    <div style={{ marginBottom: 12 }}>
      <label>{label}</label>
      <div className="row" style={{ alignItems: 'center', flexWrap: 'nowrap' }}>
        <input readOnly value={url} onFocus={(e) => e.target.select()} style={{ flex: '1 1 auto', minWidth: 0 }} />
        <button
          className="secondary"
          onClick={() =>
            void navigator.clipboard.writeText(url).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            })
          }
        >
          {copied ? t('Gekopieerd') : t('Kopiëren')}
        </button>
      </div>
      <p className="small muted" style={{ margin: '4px 0 0' }}>
        {help}
      </p>
    </div>
  );
}

/**
 * Vaste links van een event: de spellink (voor het ticket en de QR-code) en de
 * resultatenlink, beide als /<game-ID>:<spelcode>.
 */
export function EventLinks({ joinCode }: { joinCode: string }) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const [link, setLink] = useState<EventLink | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void supabase()
      .rpc('event_link', { p_game: '', p_code: joinCode })
      .then(({ data, error: e }) => {
        if (!alive) return;
        if (e) setError(e.message);
        else if (data) setLink({ gameId: (data as { game_id: string }).game_id, code: joinCode });
      });
    return () => {
      alive = false;
    };
  }, [joinCode]);

  const play = link ? playUrl(link) : '';
  const svg = useMemo(() => (play ? qrSvg(play) : ''), [play]);

  // Nog niet geladen, of de database kent spellinks nog niet: niets tonen.
  if (!link || error) return null;
  if (!open) {
    return (
      <button className="secondary" onClick={() => setOpen(true)}>
        {t('Spellink en QR-code')}
      </button>
    );
  }

  const download = () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
    a.download = `qr-${link.gameId}-${link.code}.svg`.toLowerCase();
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="card" style={{ flexBasis: '100%' }}>
      <div className="row" style={{ alignItems: 'center' }}>
        <h2 style={{ margin: 0, flex: '1 1 auto' }}>{t('Spellink en QR-code')}</h2>
        <button className="link" onClick={() => setOpen(false)}>
          {t('Sluiten')}
        </button>
      </div>
      <p className="small muted">
        {t('Game-ID {game} · spelcode {code}', { game: link.gameId, code: link.code })}
      </p>
      <div className="row" style={{ alignItems: 'flex-start' }}>
        <div style={{ flex: '1 1 320px', minWidth: 0 }}>
          <CopyRow
            label={t('Spellink')}
            url={play}
            help={t('Voor het ticket of de uitnodiging. Op een telefoon met de app gaat de speler meteen naar aanmelden met de spelcode ingevuld; zonder app komt hij op een pagina met de knoppen naar de App Store en Google Play.')}
          />
          <CopyRow
            label={t('Resultatenlink')}
            url={resultsUrl(link)}
            help={t('Voor de spelleiding: opent deze resultatenpagina (inloggen nodig).')}
          />
        </div>
        <div style={{ flex: '0 0 auto', textAlign: 'center' }}>
          <div
            role="img"
            aria-label={t('QR-code van de spellink')}
            style={{ width: 180, height: 180, background: '#fff', borderRadius: 8 }}
            dangerouslySetInnerHTML={{ __html: svg.replace('<svg ', '<svg style="width:100%;height:100%;display:block" ') }}
          />
          <button className="link small" onClick={download}>
            {t('QR-code downloaden')}
          </button>
        </div>
      </div>
    </div>
  );
}
