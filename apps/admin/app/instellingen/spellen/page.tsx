'use client';
import { MAP_STYLES } from '@hunt/engine';
import { useMemo, useState } from 'react';
import { countryOptions } from '@/lib/city-rollout';
import { GAME_LANGUAGES, languageName } from '@/lib/game-languages';
import { useLanguage } from '@/lib/language';
import { COUNTRY_DEFAULTS, LIMITS, type CountrySettings, type GameSettings } from '@/lib/org-settings';
import { timezoneOptions } from '@/lib/sessions';
import { SaveBar } from '@/settings/SaveBar';
import { SettingsNav } from '@/settings/SettingsNav';
import { useSettingsForm } from '@/settings/useSettingsForm';

const COUNTRY_ZONES = [...new Set(Object.values(COUNTRY_DEFAULTS).map((c) => c.timezone))];

/** Instellingen › Spellen en landen. */
export default function GameSettingsPage() {
  const { t, locale } = useLanguage();
  const form = useSettingsForm();
  const { org, settings, change, canEdit } = form;
  const countries = useMemo(() => countryOptions(locale), [locale]);
  const [adding, setAdding] = useState('');
  if (!org) return null;
  if (!settings) return form.error ? <p className="error">{form.error}</p> : <p className="muted">{t('Laden…')}</p>;

  const g = settings.games;
  const set = (patch: Partial<GameSettings>) => change((s) => ({ ...s, games: { ...s.games, ...patch } }));
  const setCountry = (i: number, patch: Partial<CountrySettings>) =>
    change((s) => ({ ...s, countries: s.countries.map((c, j) => (j === i ? { ...c, ...patch } : c)) }));
  const used = new Set(settings.countries.map((c) => c.country));
  const countryName = (code: string) => countries.find((c) => c.code === code)?.name ?? code;
  const zones = timezoneOptions(...COUNTRY_ZONES).sort();
  const number = (key: keyof typeof LIMITS & keyof GameSettings, label: string, unit: string, help: string) => (
    <div>
      <label htmlFor={`g-${key}`}>
        {label} ({unit})
      </label>
      <input
        id={`g-${key}`}
        type="number"
        min={LIMITS[key][0]}
        max={LIMITS[key][1]}
        value={g[key]}
        disabled={!canEdit}
        onChange={(e) => set({ [key]: Number(e.target.value) })}
      />
      <p className="help">{help}</p>
    </div>
  );

  return (
    <>
      <h1>{t('Spellen en landen')}</h1>
      <SettingsNav active="spellen" orgName={org.name} />

      <h2>{t('Voor alle spellen')}</h2>
      <p className="muted">
        {t('Een wijziging telt voor een spel zodra je het opnieuw publiceert (bijvoorbeeld via "Publiceren" of bij het overzetten naar een nieuwe templateversie).')}
      </p>
      <div className="card">
        <div className="row">
          {number('max_accuracy', t('GPS-nauwkeurigheid'), t('meter'), t('Metingen die onnauwkeuriger zijn tellen niet mee. Geldt voor elk spel.'))}
          {number('decline_seconds', t('Wachttijd na "Nee"'), t('seconden'), t('Zegt een team "Nee" op "Is dit het juiste extractiepunt?", dan komt de vraag na deze tijd terug. Geldt voor elk spel.'))}
        </div>
      </div>

      <h3>{t('Standaard, als een spel zelf niets kiest')}</h3>
      <div className="card">
        <div className="row">
          {number('meeting_radius', t('Cirkel om het verzamelpunt'), t('meter'), t('Daarbinnen is een team bij het verzamelpunt.'))}
          <div>
            <label htmlFor="g-style">{t('Kaartstijl')}</label>
            <select id="g-style" value={g.map_style} disabled={!canEdit} onChange={(e) => set({ map_style: e.target.value })}>
              {MAP_STYLES.map((s) => (
                <option key={s.id} value={s.id}>
                  {t(s.name)}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="row">
          <div>
            <label htmlFor="g-line">{t('Lijn om het speelveld')}</label>
            <input id="g-line" type="color" value={g.boundary_color} disabled={!canEdit} onChange={(e) => set({ boundary_color: e.target.value })} />
          </div>
          <div>
            <label htmlFor="g-outside">{t('Kleur buiten het speelveld')}</label>
            <input id="g-outside" type="color" value={g.outside_color} disabled={!canEdit} onChange={(e) => set({ outside_color: e.target.value })} />
          </div>
          <div>
            <label htmlFor="g-opacity">
              {t('Dekking buiten het speelveld')} ({Math.round(g.outside_opacity * 100)}%)
            </label>
            <input
              id="g-opacity"
              type="range"
              min={0}
              max={100}
              value={Math.round(g.outside_opacity * 100)}
              disabled={!canEdit}
              onChange={(e) => set({ outside_opacity: Number(e.target.value) / 100 })}
            />
          </div>
        </div>
      </div>

      <h2>{t('Per land')}</h2>
      <p className="muted">
        {t('Rol je een nieuwe stad uit in een van deze landen, dan wordt de taal van het land de hoofdtaal van de stad, als het template die taal al heeft. Heeft het template die taal nog niet, dan zie je dat meteen bij het uitrollen. Een nieuw ticket voor een spel in dat land krijgt de tijdzone van het land.')}
      </p>
      <div className="card">
        {settings.countries.map((c, i) => (
          <div className="country-row" key={c.country}>
            <div>
              <label>{t('Land')}</label>
              <strong>{countryName(c.country)}</strong>
            </div>
            <div>
              <label htmlFor={`c-lang-${c.country}`}>{t('Taal')}</label>
              <select id={`c-lang-${c.country}`} value={c.language} disabled={!canEdit} onChange={(e) => setCountry(i, { language: e.target.value })}>
                {GAME_LANGUAGES.map((l) => (
                  <option key={l} value={l}>
                    {languageName(l)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor={`c-tz-${c.country}`}>{t('Tijdzone')}</label>
              <select id={`c-tz-${c.country}`} value={c.timezone} disabled={!canEdit} onChange={(e) => setCountry(i, { timezone: e.target.value })}>
                {zones.map((z) => (
                  <option key={z}>{z}</option>
                ))}
              </select>
            </div>
            {canEdit ? (
              <button className="link" onClick={() => change((s) => ({ ...s, countries: s.countries.filter((_, j) => j !== i) }))}>
                {t('Weghalen')}
              </button>
            ) : (
              <span />
            )}
          </div>
        ))}
        {settings.countries.length === 0 ? <p className="muted">{t('Nog geen landen.')}</p> : null}
        {canEdit ? (
          <div className="row" style={{ marginTop: 8 }}>
            <div>
              <label htmlFor="c-add">{t('Land toevoegen')}</label>
              <select id="c-add" value={adding} onChange={(e) => setAdding(e.target.value)}>
                <option value="">{t('Kies een land')}</option>
                {countries
                  .filter((c) => !used.has(c.code))
                  .map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.name}
                    </option>
                  ))}
              </select>
            </div>
            <div>
              <button
                className="secondary"
                disabled={!adding}
                onClick={() => {
                  const d = COUNTRY_DEFAULTS[adding];
                  if (!d) return;
                  change((s) => ({ ...s, countries: [...s.countries, { country: adding, ...d }] }));
                  setAdding('');
                }}
              >
                {t('Toevoegen')}
              </button>
            </div>
          </div>
        ) : null}
      </div>

      <SaveBar {...form} onSave={() => void form.save()} />
    </>
  );
}
