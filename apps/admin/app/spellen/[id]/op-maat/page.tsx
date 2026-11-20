'use client';
import { CompositionError, type GamePackage } from '@hunt/engine';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import {
  checkGroup,
  checkLocals,
  checkMorse,
  customName,
  customSlug,
  customSpec,
  draftFrom,
  draftToRows,
  morseAnswerType,
  textsToTranslate,
  type CustomDraft,
  type CustomSpec,
  type LocalAnswer,
} from '@/lib/custom-variant';
import { gameLanguageList } from '@/lib/game-languages';
import type { LayerRows } from '@/lib/game-model';
import { displayName } from '@/lib/game-name';
import { composeChain, createCustomVariant, loadChain, publishVersion } from '@/lib/game-store';
import { tKey } from '@/lib/i18n';
import { useLanguage } from '@/lib/language';
import { supabase } from '@/lib/supabase';
import { translateTexts, PartialTranslation } from '@/lib/translate-client';

type Step = 'group' | 'morse' | 'locals' | 'done';

const STEP_LABEL: Record<Step, string> = {
  group: tKey('Groep'),
  morse: tKey('Morsecode'),
  locals: tKey('Lokale vragen'),
  done: tKey('Klaar'),
};

interface Sibling {
  id: string;
  slug: string;
  layer: 'client';
  settings: Record<string, unknown>;
}

/**
 * Op maat maken: een eigen versie van een stad voor één groep. Stap voor stap
 * de groep, de morsecodepuzzel en de lokale vragen; daarna meteen publiceren,
 * zodat je er een ticket mee kunt maken.
 */
export default function CustomVariantPage() {
  const { id } = useParams<{ id: string }>();
  const { org } = useAuth();
  const { t } = useLanguage();
  const [chain, setChain] = useState<LayerRows[] | null>(null);
  const [city, setCity] = useState<GamePackage | null>(null);
  const [spec, setSpec] = useState<CustomSpec | null>(null);
  const [siblings, setSiblings] = useState<Sibling[]>([]);
  const [copyFrom, setCopyFrom] = useState('');
  const [draft, setDraft] = useState<CustomDraft | null>(null);
  const [step, setStep] = useState<Step>('group');
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [translate, setTranslate] = useState(true);
  const [publish, setPublish] = useState(true);
  const [created, setCreated] = useState<{ id: string; version: number | null; notes: string[] } | null>(null);

  const load = useCallback(async () => {
    try {
      const db = supabase();
      const c = await loadChain(db, id);
      const self = c[c.length - 1]!;
      if (self.game.layer !== 'city') throw new Error(t('Op maat maken kan alleen vanuit een stad.'));
      const s = customSpec(c[0]!);
      const pkg = composeChain(c);
      const k = await db.from('games').select('id, slug, layer, settings').eq('parent_id', id).eq('layer', 'client').order('slug');
      setChain(c);
      setSpec(s);
      setCity(pkg);
      setSiblings((k.data ?? []) as Sibling[]);
      setDraft(draftFrom(pkg, s, self.game.default_language));
    } catch (err) {
      setErrors([err instanceof Error ? err.message : String(err)]);
    }
  }, [id, t]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!chain || !spec || !city || !draft)
    return errors.length ? (
      <ul className="errors">
        {errors.map((e, i) => (
          <li key={i}>{e}</li>
        ))}
      </ul>
    ) : (
      <p className="muted">{t('Laden…')}</p>
    );

  const self = chain[chain.length - 1]!;
  const lang = self.game.default_language;
  const others = self.game.languages.filter((l) => l !== lang);
  const cityName = displayName(self.game);
  const answerType = morseAnswerType(city, spec);
  const steps: Step[] = ['group', ...(draft.morse ? (['morse'] as const) : []), ...(draft.locals.length ? (['locals'] as const) : []), 'done'];
  const at = steps.indexOf(step);

  const startFrom = async (value: string) => {
    setCopyFrom(value);
    setErrors([]);
    try {
      const pkg = value ? composeChain(await loadChain(supabase(), value)) : city;
      setDraft((d) => ({ ...draftFrom(pkg, spec, lang, city), group: d?.group ?? '' }));
    } catch (err) {
      setErrors([err instanceof Error ? err.message : String(err)]);
    }
  };

  const problems = (s: Step) =>
    s === 'group' ? checkGroup(draft) : s === 'morse' ? checkMorse(draft, answerType) : s === 'locals' ? checkLocals(draft) : [];

  const next = () => {
    const p = problems(step);
    setErrors(p);
    if (p.length === 0) setStep(steps[at + 1]!);
  };
  const back = () => {
    setErrors([]);
    setStep(steps[Math.max(0, at - 1)]!);
  };

  const setMorse = (patch: Partial<NonNullable<CustomDraft['morse']>>) =>
    setDraft((d) => (d && d.morse ? { ...d, morse: { ...d.morse, ...patch } } : d));
  const setLocal = (i: number, patch: Partial<CustomDraft['locals'][number]>) =>
    setDraft((d) => (d ? { ...d, locals: d.locals.map((l, j) => (j === i ? { ...l, ...patch } : l)) } : d));
  const setAnswer = (i: number, answer: LocalAnswer) => setLocal(i, { answer });

  const finish = async () => {
    if (!org) return;
    const all = steps.flatMap(problems);
    setErrors(all);
    if (all.length) return;
    setBusy(true);
    const notes: string[] = [];
    try {
      const db = supabase();
      let translated: Record<string, Record<string, string>> = {};
      const texts = textsToTranslate(draft, city, spec, lang);
      if (translate && others.length && Object.keys(texts).length) {
        try {
          translated = await translateTexts(lang, others, texts);
        } catch (err) {
          if (err instanceof PartialTranslation) translated = err.translations;
          notes.push(
            t('Vertalen lukte niet helemaal ({error}). De ontbrekende talen tonen de Nederlandse tekst; je kunt ze later per opdracht aanvullen.', {
              error: err instanceof Error ? err.message : String(err),
            }),
          );
        }
      }
      const rows = draftToRows(draft, spec, city, chain[0]!, lang, translated);
      const slugs = await db.from('games').select('slug').eq('org_id', org.id);
      const newId = await createCustomVariant(db, org.id, {
        cityId: id,
        name: customName(cityName, draft.group),
        group: draft.group.trim(),
        slug: customSlug(self.game.slug, draft.group, ((slugs.data ?? []) as { slug: string }[]).map((s) => s.slug)),
        copyFrom: copyFrom || null,
        rows,
      });
      let version: number | null = null;
      if (publish) {
        try {
          version = (await publishVersion(db, newId)).version;
        } catch (err) {
          notes.push(
            t('Publiceren lukte niet: {error}', {
              error: err instanceof CompositionError ? err.issues.join(' · ') : err instanceof Error ? err.message : String(err),
            }),
          );
        }
      }
      setCreated({ id: newId, version, notes });
      setErrors([]);
    } catch (err) {
      setErrors([err instanceof Error ? err.message : String(err)]);
    } finally {
      setBusy(false);
    }
  };

  if (created)
    return (
      <>
        <h1>{t('Op maat gemaakt: {name}', { name: customName(cityName, draft.group) })}</h1>
        <div className="card">
          <p className="notice" style={{ marginTop: 0 }}>
            {created.version !== null
              ? t('Klaar en gepubliceerd als versie {n}. Je kunt er nu een ticket mee maken.', { n: created.version })
              : t('De op-maat-versie is aangemaakt. Publiceer hem op de spelpagina om er een ticket mee te maken.')}
          </p>
          {created.notes.map((n, i) => (
            <p key={i} className="error">
              {n}
            </p>
          ))}
          <div className="actions">
            {created.version !== null ? (
              <Link href="/sessies" className="button">
                {t('Ticket maken')}
              </Link>
            ) : null}
            <Link href={`/spellen/${created.id}`} className={created.version !== null ? 'button secondary' : 'button'}>
              {t('Naar het spel')}
            </Link>
          </div>
        </div>
      </>
    );

  return (
    <>
      <p className="muted" style={{ marginBottom: 4 }}>
        <Link href={`/spellen/${id}`}>{cityName}</Link>
      </p>
      <h1>{t('Op maat maken: {city}', { city: cityName })}</h1>
      <ol className="wizard-steps">
        {steps.map((s, i) => (
          <li key={s} className={i === at ? 'now' : i < at ? 'done' : ''}>
            <b>
              {i + 1}. {t(STEP_LABEL[s])}
            </b>
            <span>
              {s === 'group'
                ? draft.group.trim() || t('voor wie')
                : s === 'morse'
                  ? t('oplossing en hints')
                  : s === 'locals'
                    ? draft.locals.length === 1
                      ? t('1 vraag')
                      : t('{n} vragen', { n: draft.locals.length })
                    : t('controleren')}
            </span>
          </li>
        ))}
      </ol>

      <div className="card">
        {step === 'group' ? (
          <>
            <label htmlFor="group">{t('Om welke groep gaat het?')}</label>
            <input id="group" value={draft.group} autoFocus onChange={(e) => setDraft({ ...draft, group: e.target.value })} />
            <p className="muted small">
              {t('Zo heet het spel straks in de lijst en bij het maken van een ticket: {name}.', {
                name: customName(cityName, draft.group || t('groep')),
              })}
            </p>
            {siblings.length > 0 ? (
              <>
                <label htmlFor="from">{t('Beginnen vanuit')}</label>
                <select id="from" value={copyFrom} onChange={(e) => void startFrom(e.target.value)}>
                  <option value="">{t('De gewone versie van {city}', { city: cityName })}</option>
                  {siblings.map((s) => (
                    <option key={s.id} value={s.id}>
                      {t('Een kopie van {name}', { name: displayName(s) })}
                    </option>
                  ))}
                </select>
              </>
            ) : null}
          </>
        ) : null}

        {step === 'morse' && draft.morse ? (
          <>
            <p className="muted" style={{ marginTop: 0 }}>
              {t('De morsecode-puzzel zelf ligt op papier bij de groep. Hier vul je in wat de app moet weten: de oplossing en de hints die teams kunnen kopen.')}
            </p>
            {spec.morse?.answer && answerType ? (
              <>
                <label>{t('Is de oplossing hetzelfde als in {city}?', { city: cityName })}</label>
                <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'center' }}>
                  <label className="check" style={{ margin: 0, whiteSpace: 'nowrap' }}>
                    <input type="radio" name="same" checked={draft.morse.sameAnswer} onChange={() => setMorse({ sameAnswer: true })} />
                    {t('Ja, {answer}', { answer: morseAnswer(city, spec.morse.key) })}
                  </label>
                  <label className="check" style={{ margin: 0, whiteSpace: 'nowrap' }}>
                    <input type="radio" name="same" checked={!draft.morse.sameAnswer} onChange={() => setMorse({ sameAnswer: false })} />
                    {t('Nee')}
                  </label>
                </div>
                {!draft.morse.sameAnswer ? (
                  <>
                    <label htmlFor="morse-answer">{answerType === 'number' ? t('Wat is de oplossing? (getal)') : t('Wat is de oplossing?')}</label>
                    <input
                      id="morse-answer"
                      inputMode={answerType === 'number' ? 'numeric' : undefined}
                      value={draft.morse.answer}
                      style={{ maxWidth: 200 }}
                      onChange={(e) => setMorse({ answer: e.target.value })}
                    />
                  </>
                ) : null}
              </>
            ) : null}
            <label>{t('Hints')}</label>
            {draft.morse.hints.map((h, i) => (
              <div key={i} className="wizard-hint">
                <span className="cost">{t('Hint {n} · −{cost}', { n: i + 1, cost: draft.morse!.costs[i] ?? 0 })}</span>
                <textarea
                  rows={2}
                  value={h}
                  onChange={(e) => setMorse({ hints: draft.morse!.hints.map((x, j) => (j === i ? e.target.value : x)) })}
                />
              </div>
            ))}
            <p className="muted small">{t('Leeg laten = de hint van {city} blijft staan.', { city: cityName })}</p>
          </>
        ) : null}

        {step === 'locals' ? (
          <>
            <p className="muted" style={{ marginTop: 0 }}>
              {t('De locaties blijven gelijk aan {city}; alleen de vraag en de antwoorden veranderen.', { city: cityName })}
            </p>
            {draft.locals.map((l, i) => (
              <div key={l.key} style={{ marginBottom: 16 }}>
                <h2 style={{ marginTop: i === 0 ? 0 : 24 }}>{l.title}</h2>
                <label htmlFor={`q-${l.key}`}>{t('Vraag')}</label>
                <textarea id={`q-${l.key}`} rows={2} value={l.question} onChange={(e) => setLocal(i, { question: e.target.value })} />
                {l.answer?.type === 'choice' ? (
                  <>
                    <label>{t('Antwoorden (kies het goede)')}</label>
                    {l.answer.options.map((o, j) => (
                      <div key={j} className="wizard-option">
                        <input
                          type="radio"
                          name={`correct-${l.key}`}
                          aria-label={t('Goed antwoord')}
                          checked={(l.answer as { correct: number }).correct === j}
                          onChange={() => setAnswer(i, { ...(l.answer as Extract<LocalAnswer, { type: 'choice' }>), correct: j })}
                        />
                        <input
                          value={o}
                          onChange={(e) => {
                            const a = l.answer as Extract<LocalAnswer, { type: 'choice' }>;
                            setAnswer(i, { ...a, options: a.options.map((x, k) => (k === j ? e.target.value : x)) });
                          }}
                        />
                      </div>
                    ))}
                    <button
                      type="button"
                      className="link"
                      onClick={() => {
                        const a = l.answer as Extract<LocalAnswer, { type: 'choice' }>;
                        setAnswer(i, { ...a, options: [...a.options, ''] });
                      }}
                    >
                      {t('Antwoord toevoegen')}
                    </button>
                  </>
                ) : l.answer?.type === 'text' ? (
                  <>
                    <label>{t('Goede antwoorden (gescheiden door komma’s)')}</label>
                    <input value={l.answer.accepted} onChange={(e) => setAnswer(i, { type: 'text', accepted: e.target.value })} />
                  </>
                ) : l.answer?.type === 'number' ? (
                  <>
                    <label>{t('Goed antwoord (getal)')}</label>
                    <input value={l.answer.value} style={{ maxWidth: 200 }} onChange={(e) => setAnswer(i, { type: 'number', value: e.target.value })} />
                  </>
                ) : null}
              </div>
            ))}
          </>
        ) : null}

        {step === 'done' ? (
          <>
            <dl className="wizard-summary">
              <dt>{t('Spel')}</dt>
              <dd>
                {customName(cityName, draft.group)}{' '}
                <span className="muted small">
                  {copyFrom
                    ? t('(kopie van {name})', { name: displayName(siblings.find((s) => s.id === copyFrom) ?? { layer: 'client', slug: '', settings: {} }) })
                    : t('(gebaseerd op {city})', { city: cityName })}
                </span>
              </dd>
              {draft.morse ? (
                <>
                  <dt>{t('Morsecode')}</dt>
                  <dd>
                    {draft.morse.sameAnswer
                      ? t('Oplossing zoals in {city}', { city: cityName })
                      : t('Nieuwe oplossing: {answer}', { answer: draft.morse.answer.trim() })}
                    {' · '}
                    {draft.morse.hints.filter((h) => h.trim()).length === 1
                      ? t('1 hint')
                      : t('{n} hints', { n: draft.morse.hints.filter((h) => h.trim()).length })}
                  </dd>
                </>
              ) : null}
              {draft.locals.map((l) => (
                <div key={l.key}>
                  <dt>{l.title}</dt>
                  <dd>
                    {l.question}{' '}
                    {l.answer?.type === 'choice' ? (
                      <span className="muted small">{t('goed: {answer}', { answer: l.answer.options[l.answer.correct] ?? '' })}</span>
                    ) : l.answer?.type === 'text' ? (
                      <span className="muted small">{t('goed: {answer}', { answer: l.answer.accepted })}</span>
                    ) : l.answer?.type === 'number' ? (
                      <span className="muted small">{t('goed: {answer}', { answer: l.answer.value })}</span>
                    ) : null}
                  </dd>
                </div>
              ))}
            </dl>
            {others.length ? (
              <label className="check" style={{ marginTop: 16 }}>
                <input type="checkbox" checked={translate} onChange={(e) => setTranslate(e.target.checked)} />
                {t('De nieuwe teksten meteen vertalen naar {langs}', { langs: gameLanguageList(others) })}
              </label>
            ) : null}
            <label className="check" style={{ marginTop: 8 }}>
              <input type="checkbox" checked={publish} onChange={(e) => setPublish(e.target.checked)} />
              {t('Meteen publiceren, zodat ik er een ticket mee kan maken')}
            </label>
          </>
        ) : null}

        {errors.length > 0 ? (
          <ul className="errors">
            {errors.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        ) : null}

        <div className="actions">
          {step === 'done' ? (
            <button type="button" disabled={busy} onClick={() => void finish()}>
              {busy ? t('Bezig…') : t('Op-maat-versie maken')}
            </button>
          ) : (
            <button type="button" onClick={next}>
              {t('Volgende')}
            </button>
          )}
          {at > 0 ? (
            <button type="button" className="secondary" disabled={busy} onClick={back}>
              {t('Terug')}
            </button>
          ) : (
            <Link href="/spellen" className="button secondary">
              {t('Annuleren')}
            </Link>
          )}
        </div>
      </div>
    </>
  );
}

function morseAnswer(pkg: GamePackage, key: string): string {
  const a = pkg.tasks.find((t) => t.id === key)?.answer;
  return a?.type === 'number' ? String(a.value) : a?.type === 'text' ? a.accepted.join(', ') : '';
}
