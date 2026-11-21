'use client';
import { useEffect, useState } from 'react';
import { useLanguage } from '@/lib/language';
import { MAX_TEAMS_LIMIT, teamsLabel, validMaxTeams } from '@/lib/sessions';
import { supabase } from '@/lib/supabase';

/**
 * Maximaal aantal teams van een ticket: "Onbeperkt" aangevinkt, of een aantal.
 * Bijvoorbeeld 4 voor een groep van 20 die via de webshop 4 teams kocht.
 */
export function MaxTeamsField({
  id,
  value,
  onChange,
  disabled,
}: {
  id: string;
  value: number | null;
  onChange: (value: number | null) => void;
  disabled?: boolean;
}) {
  const { t } = useLanguage();
  // Het laatst gekozen aantal, zodat "Onbeperkt" uit- en aanvinken het niet kwijtraakt.
  const [last, setLast] = useState(value ?? 4);
  const [text, setText] = useState(value == null ? '' : String(value));
  useEffect(() => {
    if (value != null && value > 0) setLast(value);
    if (value == null) setText('');
    else if (Number(text) !== value) setText(String(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <div>
      <label htmlFor={id}>{t('Maximaal aantal teams')}</label>
      <div className="row" style={{ alignItems: 'center' }}>
        <input
          id={id}
          type="number"
          min={1}
          max={MAX_TEAMS_LIMIT}
          value={text}
          placeholder={t('Onbeperkt')}
          disabled={disabled || value == null}
          onChange={(e) => {
            setText(e.target.value);
            // Leeg of ongeldig: 0, dat de controle bij opslaan afkeurt.
            onChange(e.target.value === '' ? 0 : Number(e.target.value));
          }}
          style={{ maxWidth: 120 }}
        />
        <label className="check" style={{ margin: 0 }}>
          <input type="checkbox" checked={value == null} disabled={disabled} onChange={(e) => {
              if (!e.target.checked) setText(String(last));
              onChange(e.target.checked ? null : last);
            }}
          />
          {t('Onbeperkt')}
        </label>
      </div>
      <p className="help">
        {t('Zoveel teams kunnen met de ticketcode inloggen. Het volgende team krijgt in de app de melding dat het ticket vol is. Spelleiders tellen niet mee.')}
      </p>
    </div>
  );
}

/** Op de ticketpagina: hoeveel teams er zijn en mogen, en het maximum aanpassen. */
export function MaxTeams({
  sessionId,
  maxTeams,
  teamCount,
  canEdit,
  onChange,
}: {
  sessionId: string;
  maxTeams: number | null;
  teamCount: number;
  canEdit: boolean;
  onChange: () => void;
}) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState<number | null>(maxTeams);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setValue(maxTeams), [maxTeams]);

  const save = async () => {
    if (!validMaxTeams(value)) {
      setError(t('Maximaal aantal teams moet tussen 1 en 500 liggen, of onbeperkt.'));
      return;
    }
    setBusy(true);
    setError(null);
    const { error: e } = await supabase().from('sessions').update({ max_teams: value }).eq('id', sessionId);
    setBusy(false);
    if (e) setError(e.message);
    else {
      setOpen(false);
      onChange();
    }
  };

  const label = `${t('Teams')}: ${maxTeams == null ? t('onbeperkt') : teamsLabel(teamCount, maxTeams)}`;
  const full = maxTeams != null && teamCount >= maxTeams;

  if (!open) {
    return (
      <button className="secondary" onClick={() => setOpen(true)} title={full ? t('Het ticket is vol: nieuwe teams kunnen niet meer inloggen.') : undefined}>
        {label}
        {full ? ` · ${t('vol')}` : ''}
      </button>
    );
  }
  return (
    <div className="card" style={{ flexBasis: '100%' }}>
      <div className="row" style={{ alignItems: 'center' }}>
        <h2 style={{ margin: 0, flex: '1 1 auto' }}>{label}</h2>
        <button className="link" onClick={() => setOpen(false)}>
          {t('Sluiten')}
        </button>
      </div>
      {canEdit ? (
        <>
          <MaxTeamsField id="max-teams-live" value={value} onChange={setValue} disabled={busy} />
          {value != null && value < teamCount ? (
            <p className="small muted">
              {t('Er doen al {n} teams mee. Die spelen gewoon verder; er kan alleen geen nieuw team meer bij.', { n: teamCount })}
            </p>
          ) : null}
          <div className="actions">
            <button disabled={busy || value === maxTeams} onClick={() => void save()}>
              {t('Opslaan')}
            </button>
          </div>
        </>
      ) : (
        <p className="small muted">{maxTeams == null ? t('Onbeperkt') : t('Maximaal {n} teams', { n: maxTeams })}</p>
      )}
      {error ? <p className="error">{error}</p> : null}
    </div>
  );
}
