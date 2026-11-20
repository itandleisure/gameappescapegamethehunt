'use client';
import { useLanguage } from '@/lib/language';
import { LIMITS, type TicketSettings } from '@/lib/org-settings';
import { timezoneOptions } from '@/lib/sessions';
import { SaveBar } from '@/settings/SaveBar';
import { SettingsNav } from '@/settings/SettingsNav';
import { useSettingsForm } from '@/settings/useSettingsForm';

/** Instellingen › Nieuwe tickets: wat er bij een nieuw ticket al ingevuld staat. */
export default function TicketSettingsPage() {
  const { t } = useLanguage();
  const form = useSettingsForm();
  const { org, settings, change, canEdit } = form;
  if (!org) return null;
  if (!settings) return form.error ? <p className="error">{form.error}</p> : <p className="muted">{t('Laden…')}</p>;

  const set = (patch: Partial<TicketSettings>) => change((s) => ({ ...s, tickets: { ...s.tickets, ...patch } }));
  const tk = settings.tickets;

  return (
    <>
      <h1>{t('Nieuwe tickets')}</h1>
      <SettingsNav active="tickets" orgName={org.name} />
      <p className="muted">
        {t('Dit staat al ingevuld als je een nieuw ticket maakt. Per ticket kun je het daarna gewoon aanpassen. Bestaande tickets veranderen niet.')}
      </p>
      <div className="card">
        <div className="row">
          <div>
            <label htmlFor="tk-tz">{t('Tijdzone')}</label>
            <select id="tk-tz" value={tk.timezone} disabled={!canEdit} onChange={(e) => set({ timezone: e.target.value })}>
              {timezoneOptions(tk.timezone).map((z) => (
                <option key={z}>{z}</option>
              ))}
            </select>
            <p className="help">{t('Speelt een spel in een land uit de lijst bij Spellen en landen, dan krijgt het ticket de tijdzone van dat land.')}</p>
          </div>
          <div>
            <label htmlFor="tk-tracks">{t('Tracks')}</label>
            <input
              id="tk-tracks"
              type="number"
              min={LIMITS.track_count[0]}
              max={LIMITS.track_count[1]}
              value={tk.track_count}
              disabled={!canEdit}
              onChange={(e) => set({ track_count: Number(e.target.value) })}
            />
          </div>
        </div>
        <label className="check">
          <input type="checkbox" checked={tk.team_chat} disabled={!canEdit} onChange={(e) => set({ team_chat: e.target.checked })} />
          {t('Teamchat standaard aan')}
        </label>
        <label className="check">
          <input type="checkbox" checked={tk.test_mode} disabled={!canEdit} onChange={(e) => set({ test_mode: e.target.checked })} />
          {t('Testmodus standaard aan')}
        </label>
      </div>
      <SaveBar {...form} onSave={() => void form.save()} />
    </>
  );
}
