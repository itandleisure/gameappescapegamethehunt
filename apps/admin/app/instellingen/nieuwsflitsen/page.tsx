'use client';
import { DEFAULT_NEWS_PRESETS, NEWS_BODY_MAX, NEWS_TITLE_MAX, type NewsAuto, type NewsPreset, type Text } from '@hunt/engine';
import { useState } from 'react';
import { GAME_LANGUAGES, gameLanguageName, gameLanguageShort } from '@/lib/game-languages';
import { useLanguage } from '@/lib/language';
import { MAX_NEWS_PRESETS, type OrgSettings } from '@/lib/org-settings';
import { PartialTranslation, translateTexts } from '@/lib/translate-client';
import type { Translations } from '@/lib/task-translate';
import { SaveBar } from '@/settings/SaveBar';
import { SettingsNav } from '@/settings/SettingsNav';
import { useSettingsForm } from '@/settings/useSettingsForm';

/** Teksten van alle knoppen als vlakke lijst voor de vertaaldienst: "0.title", "0.body", … */
function sourceTexts(presets: NewsPreset[], source: string): Record<string, string> {
  const out: Record<string, string> = {};
  presets.forEach((p, i) => {
    const title = p.title[source as keyof Text];
    const body = p.body?.[source as keyof Text];
    if (title) out[`${i}.title`] = title;
    if (body) out[`${i}.body`] = body;
  });
  return out;
}

/** Vertalingen invullen waar die taal nog leeg is; eigen teksten blijven staan. */
function fillMissing(presets: NewsPreset[], translations: Translations): NewsPreset[] {
  return presets.map((p, i) => {
    const title = { ...p.title } as Record<string, string>;
    const body = { ...(p.body ?? {}) } as Record<string, string>;
    for (const [lang, texts] of Object.entries(translations)) {
      if (!title[lang] && texts[`${i}.title`]) title[lang] = texts[`${i}.title`]!;
      if (!body[lang] && texts[`${i}.body`]) body[lang] = texts[`${i}.body`]!;
    }
    const next: NewsPreset = { ...p, title: title as Text };
    if (Object.keys(body).length) next.body = body as Text;
    return next;
  });
}

/** Talen waarin een knop nog een titel of tekst mist. */
function missingLanguages(presets: NewsPreset[]): string[] {
  return GAME_LANGUAGES.filter((l) =>
    presets.some((p) => !p.title[l] || (p.body && Object.keys(p.body).length > 0 && !p.body[l])),
  );
}

/**
 * Instellingen › Nieuwsflitsen: welke automatische flitsen de teams krijgen
 * en de snelknoppen die de spelleiders in de app met één tik versturen.
 */
export default function NewsSettingsPage() {
  const { t } = useLanguage();
  const form = useSettingsForm();
  const { org, settings, change, canEdit } = form;
  const [lang, setLang] = useState<string>('nl');
  const [translating, setTranslating] = useState(false);
  const [translateNote, setTranslateNote] = useState<string | null>(null);
  if (!org) return null;
  if (!settings) return form.error ? <p className="error">{form.error}</p> : <p className="muted">{t('Laden…')}</p>;

  const news = settings.news;
  const presets = news.presets ?? DEFAULT_NEWS_PRESETS;
  const setAuto = (patch: Partial<NewsAuto>) => change((s) => ({ ...s, news: { ...s.news, auto: { ...s.news.auto, ...patch } } }));
  const setPresets = (update: (list: NewsPreset[]) => NewsPreset[]) =>
    change((s: OrgSettings) => ({ ...s, news: { ...s.news, presets: update(s.news.presets ?? DEFAULT_NEWS_PRESETS) } }));
  const setPreset = (i: number, patch: Partial<NewsPreset>) => setPresets((list) => list.map((p, j) => (j === i ? { ...p, ...patch } : p)));
  const setText = (i: number, field: 'title' | 'body', value: string) =>
    setPresets((list) =>
      list.map((p, j) => {
        if (j !== i) return p;
        const cur = { ...(p[field] ?? {}) } as Record<string, string>;
        if (value) cur[lang] = value;
        else delete cur[lang];
        return { ...p, [field]: cur as Text };
      }),
    );
  const move = (i: number, by: -1 | 1) =>
    setPresets((list) => {
      const j = i + by;
      if (j < 0 || j >= list.length) return list;
      const next = [...list];
      [next[i], next[j]] = [next[j]!, next[i]!];
      return next;
    });
  const add = () =>
    setPresets((list) => [...list, { id: `knop-${Date.now().toString(36)}`, icon: '📣', title: {} }]);
  const missing = missingLanguages(presets).filter((l) => l !== lang);

  const translate = async () => {
    const texts = sourceTexts(presets, lang);
    if (!Object.keys(texts).length || !missing.length) return;
    setTranslating(true);
    setTranslateNote(null);
    form.setError(null);
    try {
      const out = await translateTexts(lang, missing, texts);
      setPresets((list) => fillMissing(list, out));
      setTranslateNote(t('Vertaald. Controleer de teksten en sla op.'));
    } catch (e) {
      if (e instanceof PartialTranslation) {
        setPresets((list) => fillMissing(list, e.translations));
        setTranslateNote(e.message);
      } else {
        form.setError(e instanceof Error ? e.message : String(e));
      }
    } finally {
      setTranslating(false);
    }
  };

  return (
    <>
      <h1>{t('Nieuwsflitsen')}</h1>
      <SettingsNav active="nieuwsflitsen" orgName={org.name} />
      <p className="muted">
        {t('Een nieuwsflits verschijnt onderin het kaartscherm van elk team, trilt kort en verdwijnt na een paar seconden of als het team erop tikt. In de app staan ze terug te lezen onder "Nieuws". Wijzigingen gelden meteen, ook voor hunts die al bezig zijn.')}
      </p>

      <h2>{t('Automatisch')}</h2>
      <div className="card">
        <label className="check">
          <input type="checkbox" checked={news.auto.escaped} disabled={!canEdit} onChange={(e) => setAuto({ escaped: e.target.checked })} />
          {t('Een ander team heeft het extractiepunt bereikt')}
        </label>
        <label className="check">
          <input type="checkbox" checked={news.auto.puzzle} disabled={!canEdit} onChange={(e) => setAuto({ puzzle: e.target.checked })} />
          {t('Een ander team heeft een puzzel opgelost')}
        </label>
        <label className="check">
          <input type="checkbox" checked={news.auto.timeLeft} disabled={!canEdit} onChange={(e) => setAuto({ timeLeft: e.target.checked })} />
          {t('"Nog 10 minuten" (bij een spel dat na een vaste tijd eindigt)')}
        </label>
      </div>

      <h2>{t('Snelknoppen voor de spelleiders')}</h2>
      <p className="muted">
        {t('In de spelleider-app staan deze knoppen onder "Flits". Eén tik (en bevestigen) stuurt het bericht naar alle teams van de hunt, in de taal van elk team. Daarnaast kan de spelleider een eigen tekst typen; die wordt automatisch vertaald.')}
      </p>
      {news.presets === null ? <p className="muted">{t('Dit is de startset. Pas hem gerust aan: na opslaan gelden jullie eigen knoppen.')}</p> : null}

      <div className="card">
        <div className="row">
          <div>
            <label htmlFor="news-lang">{t('Taal')}</label>
            <select id="news-lang" value={lang} onChange={(e) => setLang(e.target.value)}>
              {GAME_LANGUAGES.map((l) => (
                <option key={l} value={l}>
                  {gameLanguageName(l)}
                </option>
              ))}
            </select>
          </div>
        </div>

        {presets.map((p, i) => (
          <div className="news-preset" key={p.id}>
            <div className="row">
              <div style={{ maxWidth: 90 }}>
                <label htmlFor={`np-icon-${i}`}>{t('Icoon')}</label>
                <input id={`np-icon-${i}`} value={p.icon} maxLength={16} disabled={!canEdit} onChange={(e) => setPreset(i, { icon: e.target.value })} />
              </div>
              <div style={{ flex: 3 }}>
                <label htmlFor={`np-title-${i}`}>
                  {t('Titel')} ({gameLanguageShort(lang)})
                </label>
                <input
                  id={`np-title-${i}`}
                  value={p.title[lang as keyof Text] ?? ''}
                  maxLength={NEWS_TITLE_MAX}
                  disabled={!canEdit}
                  placeholder={p.title.nl ?? ''}
                  onChange={(e) => setText(i, 'title', e.target.value)}
                />
              </div>
            </div>
            <label htmlFor={`np-body-${i}`}>
              {t('Tekst eronder (mag leeg)')} ({gameLanguageShort(lang)})
            </label>
            <input
              id={`np-body-${i}`}
              value={p.body?.[lang as keyof Text] ?? ''}
              maxLength={NEWS_BODY_MAX}
              disabled={!canEdit}
              placeholder={p.body?.nl ?? ''}
              onChange={(e) => setText(i, 'body', e.target.value)}
            />
            {!p.title[lang as keyof Text] ? <p className="help">{t('Nog geen titel in deze taal: teams in deze taal krijgen de titel in de hoofdtaal van het spel.')}</p> : null}
            {canEdit ? (
              <div className="actions">
                <button className="link" disabled={i === 0} onClick={() => move(i, -1)}>
                  {t('Omhoog')}
                </button>
                <button className="link" disabled={i === presets.length - 1} onClick={() => move(i, 1)}>
                  {t('Omlaag')}
                </button>
                <button className="link" onClick={() => setPresets((list) => list.filter((_, j) => j !== i))}>
                  {t('Weghalen')}
                </button>
              </div>
            ) : null}
          </div>
        ))}
        {presets.length === 0 ? <p className="muted">{t('Geen snelknoppen: de spelleiders kunnen alleen een eigen tekst sturen.')}</p> : null}

        {canEdit ? (
          <div className="actions">
            <button className="secondary" disabled={presets.length >= MAX_NEWS_PRESETS} onClick={add}>
              {t('Knop toevoegen')}
            </button>
            <button className="secondary" disabled={translating || missing.length === 0} onClick={() => void translate()}>
              {translating ? t('Vertalen…') : t('Ontbrekende talen vertalen vanuit {lang}', { lang: gameLanguageShort(lang) })}
            </button>
            {news.presets !== null ? (
              <button className="link" onClick={() => change((s) => ({ ...s, news: { ...s.news, presets: null } }))}>
                {t('Terug naar de startset')}
              </button>
            ) : null}
          </div>
        ) : null}
        {translateNote ? <p className="muted">{translateNote}</p> : null}
      </div>

      <SaveBar {...form} onSave={() => void form.save()} />
    </>
  );
}
