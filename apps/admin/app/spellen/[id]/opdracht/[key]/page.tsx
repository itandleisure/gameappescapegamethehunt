'use client';
import { composeGame, richToPlain, type Task, type TaskField } from '@hunt/engine';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState, type ChangeEvent, type ReactNode } from 'react';
import { RichText } from '@/editor/RichText';
import { answerToRow, rowsToBase, taskSettings, rowsToVariant, type GameRow, type LayerRows, type TranslationRow } from '@/lib/game-model';
import { loadChain } from '@/lib/game-store';
import { tKey } from '@/lib/i18n';
import { useT } from '@/lib/language';
import { mediaPath } from '@/lib/map-settings';
import { shrinkImage } from '@/lib/shrink-image';
import { supabase } from '@/lib/supabase';
import { cleanText, formToTask, taskToForm, type AnswerType, type TaskForm, type Texts } from '@/lib/task-form';

const ANSWER_TYPES: { value: AnswerType; label: string }[] = [
  { value: 'info', label: tKey('Geen antwoord (alleen OK)') },
  { value: 'choice', label: tKey('Meerkeuze, één goed') },
  { value: 'multi', label: tKey('Meerkeuze, meerdere goed') },
  { value: 'text', label: tKey('Tekst') },
  { value: 'number', label: tKey('Getal') },
  { value: 'photo', label: tKey('Foto') },
];

const LANG_NAME: Record<string, string> = {
  nl: tKey('Nederlands'),
  en: tKey('Engels'),
  de: tKey('Duits'),
  es: tKey('Spaans'),
  pt: tKey('Portugees'),
  it: tKey('Italiaans'),
  fr: tKey('Frans'),
};

/** Velden die een stad of klant mag aanpassen, met wat het formulier dan toont. */
type Editable = 'title' | 'body' | 'image' | 'confirm' | 'correctComment' | 'wrongComment' | 'answer' | 'points' | 'hints' | 'location';

type Tab = 'task' | 'feedback' | 'hints' | 'media' | 'activation' | 'settings' | 'used';

/** Een blok in een tabblad. In een variant met een schakelaar "Aanpassen in deze variant". */
function Panel(props: { title: string; help?: ReactNode; enabled?: boolean; variant: boolean; on?: boolean; onToggle?: (on: boolean) => void; children: ReactNode }) {
  const t = useT();
  if (props.enabled === false) return null;
  const open = !props.variant || props.on;
  return (
    <section className="panel">
      <div className="panel-head">
        <h3>{props.title}</h3>
        {props.variant ? (
          <label className="switch">
            <input type="checkbox" checked={props.on ?? false} onChange={(e) => props.onToggle?.(e.target.checked)} />
            {t('Aanpassen in deze variant')}
          </label>
        ) : null}
      </div>
      {open ? props.children : <p className="muted small">{t('Gebruikt de waarde van het spel erboven.')}</p>}
      {open && props.help ? <p className="help">{props.help}</p> : null}
    </section>
  );
}

const Icon = ({ d }: { d: string }) => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d={d} />
  </svg>
);
const TAB_ICONS: Record<Tab, string> = {
  task: 'M3 2.5h10v11H3zM5.5 5.5h5M5.5 8h5M5.5 10.5h3',
  feedback: 'M2.5 3h11v7.5H7L4 13v-2.5H2.5z',
  hints: 'M8 2a4 4 0 00-2.5 7.1V11h5V9.1A4 4 0 008 2zM6 13.5h4',
  media: 'M2 3.5h12v9H2zM2 10l3.5-3 3 2.5 2-1.5L14 11M10.5 6.2h.01',
  activation: 'M8 14s4.5-4.2 4.5-7.5a4.5 4.5 0 00-9 0C3.5 9.8 8 14 8 14zM8 8a1.5 1.5 0 100-3 1.5 1.5 0 000 3z',
  settings: 'M8 10a2 2 0 100-4 2 2 0 000 4zM8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.4 3.4l1.4 1.4M11.2 11.2l1.4 1.4M3.4 12.6l1.4-1.4M11.2 4.8l1.4-1.4',
  used: 'M2.5 2.5h7v7h-7zM6.5 6.5h7v7h-7z',
};

export default function TaskPage() {
  const { id, key } = useParams<{ id: string; key: string }>();
  const t = useT();
  const [chain, setChain] = useState<LayerRows[] | null>(null);
  const [form, setForm] = useState<TaskForm | null>(null);
  const [saved, setSaved] = useState<string>('');
  const [inherited, setInherited] = useState<Task | null>(null);
  const [on, setOn] = useState<Partial<Record<Editable, boolean>>>({});
  const [usedIn, setUsedIn] = useState<Pick<GameRow, 'id' | 'slug' | 'layer'>[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<Tab>('task');
  const [lang, setLang] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const db = supabase();
      const c = await loadChain(db, id);
      const [baseRows, ...variantRows] = c;
      const base = rowsToBase(baseRows!);
      const variants = variantRows.map((r) => rowsToVariant(r, baseRows!));
      const find = (tasks: Task[]) => tasks.find((tk) => tk.id === key);
      // Startwaarden: het spel tot en met deze laag. "Geërfd": tot en met de laag erboven.
      const compose = (n: number) => find(composeGame(base, variants.slice(0, n), { id: 'x', version: 0 }).tasks) ?? null;
      const current = variants.length ? compose(variants.length) : find(base.tasks);
      if (!current) throw new Error(t('Opdracht {key} niet gevonden.', { key }));
      const own = variants[variants.length - 1];
      const flags: Partial<Record<Editable, boolean>> = {};
      if (own) {
        for (const o of own.overrides) {
          if ('task' in o.target && o.target.task === key) {
            const f = o.target.field === 'trackLocations' ? 'location' : (o.target.field as Editable);
            flags[f] = true;
          }
        }
      }
      const f = taskToForm(current);
      setChain(c);
      setForm(f);
      setOn(flags);
      setSaved(JSON.stringify([f, flags]));
      setInherited(variants.length ? compose(variants.length - 1) : null);
      // Varianten (stad, klant) die op dit spel voortbouwen.
      const children: Pick<GameRow, 'id' | 'slug' | 'layer'>[] = [];
      let parents = [id];
      while (parents.length) {
        const r = await db.from('games').select('id, slug, layer').in('parent_id', parents);
        if (r.error) break;
        const rows = (r.data ?? []) as Pick<GameRow, 'id' | 'slug' | 'layer'>[];
        children.push(...rows);
        parents = rows.map((x) => x.id);
      }
      setUsedIn(children);
    } catch (err) {
      setErrors([err instanceof Error ? err.message : String(err)]);
    }
  }, [id, key]);

  useEffect(() => {
    void load();
  }, [load]);

  const dirty = form !== null && JSON.stringify([form, on]) !== saved;
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  if (!chain || !form) return errors.length ? <ul className="errors">{errors.map((e, i) => <li key={i}>{e}</li>)}</ul> : <p className="muted">{t('Laden…')}</p>;

  const baseRows = chain[0]!;
  const self = chain[chain.length - 1]!;
  const layer = self.game.layer;
  const isVariant = layer !== 'base';
  const taskRow = baseRows.tasks.find((tk) => tk.key === key)!;
  const languages = baseRows.game.languages;
  const defaultLang = baseRows.game.default_language;
  const l = lang && languages.includes(lang) ? lang : languages.includes(defaultLang) ? defaultLang : languages[0]!;

  // Welke velden mag deze laag aanpassen?
  const allowed = new Set<TaskField>(
    baseRows.overridable
      .filter((o) => o.task_id === taskRow.id && o.layers.includes(layer))
      .map((o) => o.field as TaskField),
  );
  const may = (field: Editable) =>
    !isVariant ||
    (field === 'location' ? allowed.has('location') || allowed.has('trackLocations') : allowed.has(field as TaskField));
  const set = (patch: Partial<TaskForm>) => setForm({ ...form, ...patch });
  const toggle = (field: Editable) => (value: boolean) => setOn({ ...on, [field]: value });
  /** Tekst in de gekozen taal. */
  const inLang = (value: Texts, onChange: (v: Texts) => void) => ({ value: value[l] ?? '', onChange: (v: string) => onChange({ ...value, [l]: v }) });
  const inputLang = (value: Texts, onChange: (v: Texts) => void) => ({
    value: value[l] ?? '',
    onChange: (e: ChangeEvent<HTMLInputElement>) => onChange({ ...value, [l]: e.target.value }),
  });

  const save = async () => {
    setBusy(true);
    setErrors([]);
    setNotice(null);
    const { task, errors: problems } = formToTask(key, form);
    if (problems.length > 0) {
      setErrors(problems);
      setBusy(false);
      return;
    }
    try {
      if (isVariant) await saveVariant(task);
      else await saveBase(task);
      setNotice(t('Opgeslagen. Publiceer het spel om het in nieuwe hunts te gebruiken.'));
      await load();
    } catch (err) {
      setErrors([err instanceof Error ? err.message : String(err)]);
    } finally {
      setBusy(false);
    }
  };

  const db = supabase();
  const must = (r: { error: { message: string } | null }) => {
    if (r.error) throw new Error(r.error.message);
  };
  const textRows = (entityId: string, field: string, text: Partial<Record<string, string>>): TranslationRow[] =>
    Object.entries(text).flatMap(([lang, value]) => (value ? [{ entity: 'task' as const, entity_id: entityId, field, lang, text: value }] : []));

  async function saveBase(task: Task) {
    const { answer, options } = answerToRow(task.answer);
    must(
      await db
        .from('tasks')
        .update({
          answer,
          points: task.points,
          wrong_points: task.wrongPoints ?? 0,
          tags: task.tags,
          hint_costs: task.hints.map((h) => h.cost),
          has_confirm: task.confirm !== undefined,
          retry_until_correct: task.retryUntilCorrect ?? false,
          settings: taskSettings(task, taskRow.settings ?? {}),
        })
        .eq('id', taskRow.id),
    );
    const rows: TranslationRow[] = [
      ...(['title', 'body', 'confirm', 'correctComment', 'wrongComment'] as const).flatMap((f) => textRows(key, f, task[f] ?? {})),
      ...task.hints.flatMap((h, i) => textRows(key, `hint.${i}`, h.text)),
      ...options.flatMap((o, i) => textRows(key, `option.${i}`, o)),
    ];
    must(await db.from('translations').delete().eq('game_id', id).eq('entity', 'task').eq('entity_id', key));
    if (rows.length) must(await db.from('translations').insert(rows.map((r) => ({ ...r, game_id: id }))));
    must(await db.from('task_locations').delete().eq('game_id', id).eq('task_id', taskRow.id).is('track', null));
    if (task.location) {
      must(await db.from('task_locations').insert({ game_id: id, task_id: taskRow.id, track: null, ...task.location }));
    }
  }

  async function saveVariant(task: Task) {
    for (const field of ['title', 'body', 'confirm', 'correctComment', 'wrongComment'] as const) {
      if (!may(field)) continue;
      must(await db.from('translations').delete().eq('game_id', id).eq('entity', 'task').eq('entity_id', key).eq('field', field));
      const text = task[field] ?? {};
      if (on[field] && Object.keys(text).length) {
        must(await db.from('translations').insert(textRows(key, field, text).map((r) => ({ ...r, game_id: id }))));
      }
    }
    if (may('hints')) {
      must(await db.from('translations').delete().eq('game_id', id).eq('entity', 'task').eq('entity_id', key).like('field', 'hint.%'));
      if (on.hints) {
        const rows = task.hints.flatMap((h, i) => textRows(key, `hint.${i}`, h.text));
        if (rows.length) must(await db.from('translations').insert(rows.map((r) => ({ ...r, game_id: id }))));
      }
    }
    for (const field of ['answer', 'points', 'image'] as const) {
      if (!may(field)) continue;
      must(await db.from('overrides').delete().eq('game_id', id).eq('task_id', taskRow.id).eq('field', field));
      if (on[field] && task[field] !== undefined) {
        must(await db.from('overrides').insert({ game_id: id, task_id: taskRow.id, field, value: task[field] }));
      }
    }
    if (may('location') && allowed.has('location')) {
      must(await db.from('task_locations').delete().eq('game_id', id).eq('task_id', taskRow.id).is('track', null));
      if (on.location && task.location) {
        must(await db.from('task_locations').insert({ game_id: id, task_id: taskRow.id, track: null, ...task.location }));
      }
    }
  }

  const uploadImage = async (e: ChangeEvent<HTMLInputElement>) => {
    const chosen = e.target.files?.[0];
    e.target.value = '';
    if (!chosen) return;
    setBusy(true);
    setErrors([]);
    try {
      // Grote foto's eerst verkleinen: elke speler downloadt ze bij de start.
      const file = await shrinkImage(chosen);
      const path = mediaPath(id, `opdracht-${key}`, file.type);
      const up = await db.storage.from('media').upload(path, file, { contentType: file.type });
      if (up.error) throw new Error(up.error.message);
      set({ image: db.storage.from('media').getPublicUrl(path).data.publicUrl });
      setNotice(t('Foto geüpload. Klik op Wijzigingen opslaan om hem bij de opdracht te bewaren.'));
    } catch (err) {
      setErrors([err instanceof Error ? err.message : String(err)]);
    } finally {
      setBusy(false);
    }
  };

  const answer = form.answerType;
  const trackCount = Object.keys(inherited?.trackLocations ?? {}).length;
  const title = cleanText(form.title)[defaultLang] ?? key;

  // Tabbladen; alleen tonen wat deze laag mag aanpassen.
  const tabs: { id: Tab; label: string; show: boolean; count?: number }[] = [
    { id: 'task', label: t('Opdracht'), show: may('title') || may('body') || may('answer') || may('points') },
    { id: 'feedback', label: t('Feedback'), show: !isVariant || may('confirm') || may('correctComment') || may('wrongComment') },
    { id: 'hints', label: t('Hints'), show: may('hints'), count: form.hints.length },
    { id: 'media', label: t('Media'), show: may('image'), count: form.image ? 1 : 0 },
    { id: 'activation', label: t('Activatie'), show: may('location') },
    { id: 'settings', label: t('Instellingen'), show: !isVariant },
    { id: 'used', label: usedIn.length
        ? usedIn.length === 1
          ? t('Gebruikt in 1 variant')
          : t('Gebruikt in {n} varianten', { n: usedIn.length })
        : t('Gebruikt in'),
      show: !isVariant },
  ];
  const visible = tabs.filter((tk) => tk.show);
  const active = visible.some((tk) => tk.id === tab) ? tab : (visible[0]?.id ?? 'task');

  // Talen waarin de titel of tekst nog ontbreekt.
  const missing = (code: string) => (may('title') && !form.title[code]?.trim()) || (may('body') && !richToPlain(form.body[code]).trim());
  const langSwitch =
    languages.length > 1 ? (
      <div className="langs" role="tablist" aria-label={t('Taal')}>
        {languages.map((code) => (
          <button key={code} type="button" role="tab" aria-selected={code === l} className={code === l ? 'active' : ''} onClick={() => setLang(code)} title={LANG_NAME[code] ? t(LANG_NAME[code]!) : code}>
            {code.toUpperCase()}
            {missing(code) ? <span className="todo" title={t('Nog niet vertaald')} /> : null}
          </button>
        ))}
      </div>
    ) : null;

  return (
    <div className="taskedit">
      <p className="muted small crumbs">
        <Link href="/spellen">{t('Spellen')}</Link> › <Link href={`/spellen/${id}`}>{self.game.slug}</Link> › {t('opdracht {key}', { key })}
        {isVariant ? ` · ${layer === 'city' ? t('stadsvariant') : t('klantvariant')}` : ''}
      </p>
      <div className="te-head">
        <h1 title={title}>{t('Bewerk: {title}', { title })}</h1>
        <Link href={`/spellen/${id}`} className="te-close" aria-label={t('Sluiten')} title={t('Terug naar het spel')}>
          ×
        </Link>
      </div>

      <nav className="te-tabs" role="tablist">
        {visible.map((tk) => (
          <button key={tk.id} type="button" role="tab" aria-selected={active === tk.id} className={active === tk.id ? 'active' : ''} onClick={() => setTab(tk.id)}>
            <Icon d={TAB_ICONS[tk.id]} />
            {tk.label}
            {tk.count ? <span className="count">{tk.count}</span> : null}
          </button>
        ))}
      </nav>

      <div className="te-body">
        {isVariant && allowed.size === 0 ? (
          <p className="panel">
            {layer === 'city'
              ? t('Het basisspel markeert geen velden van deze opdracht als aanpasbaar voor een stad.')
              : t('Het basisspel markeert geen velden van deze opdracht als aanpasbaar voor een klant.')}
          </p>
        ) : null}

        {active === 'task' ? (
          <>
            <Panel
              title={t('Opdrachttekst')}
              enabled={may('title') || may('body')}
              variant={isVariant}
              on={on.title || on.body}
              onToggle={(v) => setOn({ ...on, title: v && may('title'), body: v && may('body') })}
              help={t('Spelers zien dit als de opdracht opent.')}
            >
              {langSwitch}
              {may('title') ? (
                <>
                  <label htmlFor="title">{t('Titel')}</label>
                  <input id="title" className="wide" {...inputLang(form.title, (title) => set({ title }))} />
                </>
              ) : null}
              {may('body') ? (
                <>
                  <label>{t('Tekst')}</label>
                  <RichText key={`body-${l}`} {...inLang(form.body, (body) => set({ body }))} placeholder={t('Wat moeten de spelers doen?')} minHeight={140} />
                </>
              ) : null}
            </Panel>

            <Panel title={t('Antwoord')} enabled={may('answer')} variant={isVariant} on={on.answer} onToggle={toggle('answer')}>
              <div className="row compact">
                <div style={{ flex: '0 1 300px' }}>
                  <label htmlFor="type">{t('Type')}</label>
                  <select id="type" value={answer} onChange={(e) => set({ answerType: e.target.value as AnswerType })}>
                    {ANSWER_TYPES.map((tk) => (
                      <option key={tk.value} value={tk.value}>
                        {t(tk.label)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              {answer === 'choice' || answer === 'multi' ? (
                <>
                  <label>
                    {t('Opties')} <span className="muted">({answer === 'choice' ? t('kies het goede antwoord') : t('vink alle goede antwoorden aan')})</span>
                  </label>
                  {languages.length > 1 && !may('title') && !may('body') ? langSwitch : null}
                  <ul className="options">
                    {form.options.map((option, i) => (
                      <li key={i} className={form.correct.includes(i) ? 'is-correct' : ''}>
                        <input
                          type={answer === 'choice' ? 'radio' : 'checkbox'}
                          name="correct"
                          title={t('Goed antwoord')}
                          checked={form.correct.includes(i)}
                          onChange={(e) =>
                            set({
                              correct: answer === 'choice' ? [i] : e.target.checked ? [...form.correct, i] : form.correct.filter((x) => x !== i),
                            })
                          }
                        />
                        <input
                          value={option[l] ?? ''}
                          placeholder={`${t('Optie {n}', { n: i + 1 })}${l !== defaultLang && option[defaultLang] ? ` (${option[defaultLang]})` : ''}`}
                          onChange={(e) => set({ options: form.options.map((o, j) => (j === i ? { ...o, [l]: e.target.value } : o)) })}
                        />
                        <button
                          type="button"
                          className="icon"
                          title={t('Optie verwijderen')}
                          aria-label={t('Optie {n} verwijderen', { n: i + 1 })}
                          onClick={() =>
                            set({
                              options: form.options.filter((_, j) => j !== i),
                              correct: form.correct.filter((x) => x !== i).map((x) => (x > i ? x - 1 : x)),
                            })
                          }
                        >
                          ×
                        </button>
                      </li>
                    ))}
                  </ul>
                  <button type="button" className="link" onClick={() => set({ options: [...form.options, {}] })}>
                    {t('+ Optie toevoegen')}
                  </button>
                </>
              ) : null}
              {answer === 'text' ? (
                <>
                  <label htmlFor="accepted">{t('Goede antwoorden')}</label>
                  <textarea id="accepted" rows={3} value={form.accepted} onChange={(e) => set({ accepted: e.target.value })} />
                  <p className="help">{t('Eén per regel. Hoofdletters, spaties en accenten tellen niet mee.')}</p>
                </>
              ) : null}
              {answer === 'number' ? (
                <div className="row compact">
                  <div>
                    <label htmlFor="value">{t('Goed getal')}</label>
                    <input id="value" inputMode="decimal" value={form.numberValue} onChange={(e) => set({ numberValue: e.target.value })} />
                  </div>
                  <div>
                    <label htmlFor="tol">{t('Marge (optioneel)')}</label>
                    <input id="tol" inputMode="decimal" value={form.tolerance} onChange={(e) => set({ tolerance: e.target.value })} />
                  </div>
                </div>
              ) : null}
              {answer === 'photo' ? <p className="help">{t('Spelers maken een foto. Die komt in het fotoboek en telt als goed.')}</p> : null}
            </Panel>

            <Panel title={t('Punten')} enabled={may('points')} variant={isVariant} on={on.points} onToggle={toggle('points')}>
              <div className="row compact">
                <div>
                  <label htmlFor="points">{t('Bij goed antwoord')}</label>
                  <input id="points" inputMode="numeric" value={form.points} onChange={(e) => set({ points: e.target.value })} />
                </div>
                {!isVariant && answer !== 'info' ? (
                  <div>
                    <label htmlFor="wrong">{t('Per fout antwoord')}</label>
                    <input id="wrong" inputMode="numeric" value={form.wrongPoints} onChange={(e) => set({ wrongPoints: e.target.value })} />
                  </div>
                ) : null}
              </div>
              {!isVariant && answer !== 'info' && answer !== 'photo' ? (
                <label className="check" style={{ marginTop: 12 }}>
                  <input type="checkbox" checked={form.retryUntilCorrect} onChange={(e) => set({ retryUntilCorrect: e.target.checked })} />
                  {t('Bij een fout antwoord opnieuw laten proberen tot het goed is')}
                </label>
              ) : null}
            </Panel>
          </>
        ) : null}

        {active === 'feedback' ? (
          <>
            <Panel
              title={t('Bevestigingsvraag')}
              enabled={!isVariant || may('confirm')}
              variant={isVariant}
              on={on.confirm}
              onToggle={toggle('confirm')}
              help={t('Bijvoorbeeld: “Weten jullie zeker dat je deze opdracht wilt openen?” Spelers kiezen Ja of Nee.')}
            >
              {!isVariant ? (
                <label className="check">
                  <input type="checkbox" checked={form.hasConfirm} onChange={(e) => set({ hasConfirm: e.target.checked })} />
                  {t('Eerst een bevestigingsvraag stellen')}
                </label>
              ) : null}
              {form.hasConfirm && may('confirm') ? (
                <>
                  {langSwitch}
                  <input className="wide" style={{ marginTop: 8 }} {...inputLang(form.confirm, (confirm) => set({ confirm }))} />
                </>
              ) : null}
            </Panel>
            <Panel
              title={t('Na het antwoord')}
              enabled={may('correctComment') || may('wrongComment')}
              variant={isVariant}
              on={on.correctComment || on.wrongComment}
              onToggle={(v) => setOn({ ...on, correctComment: v && may('correctComment'), wrongComment: v && may('wrongComment') })}
              help={t('Optioneel. Laat leeg om alleen “Goed” of “Fout” te tonen.')}
            >
              {langSwitch}
              {may('correctComment') ? (
                <>
                  <label>{t('Bij goed antwoord')}</label>
                  <RichText key={`ok-${l}`} {...inLang(form.correctComment, (correctComment) => set({ correctComment }))} minHeight={70} />
                </>
              ) : null}
              {may('wrongComment') ? (
                <>
                  <label>{t('Bij fout antwoord')}</label>
                  <RichText key={`wrong-${l}`} {...inLang(form.wrongComment, (wrongComment) => set({ wrongComment }))} minHeight={70} />
                </>
              ) : null}
            </Panel>
          </>
        ) : null}

        {active === 'hints' ? (
          <Panel title={t('Hints')} variant={isVariant} on={on.hints} onToggle={toggle('hints')} help={t('Spelers kopen hints één voor één, in deze volgorde.')}>
            {langSwitch}
            {form.hints.length === 0 ? <p className="muted">{t('Nog geen hints.')}</p> : null}
            {form.hints.map((hint, i) => (
              <div key={i} className="hint">
                <div className="hint-head">
                  <strong>{t('Hint {n}', { n: i + 1 })}</strong>
                  {!isVariant ? (
                    <span className="cost">
                      {t('kost')}
                      <input inputMode="numeric" value={hint.cost} aria-label={t('Prijs hint {n}', { n: i + 1 })} onChange={(e) => set({ hints: form.hints.map((h, j) => (j === i ? { ...h, cost: e.target.value } : h)) })} />
                      {t('punten')}
                    </span>
                  ) : null}
                  {!isVariant ? (
                    <button type="button" className="icon" title={t('Hint verwijderen')} aria-label={t('Hint {n} verwijderen', { n: i + 1 })} onClick={() => set({ hints: form.hints.filter((_, j) => j !== i) })}>
                      ×
                    </button>
                  ) : null}
                </div>
                <RichText key={`hint-${i}-${l}`} {...inLang(hint.text, (text) => set({ hints: form.hints.map((h, j) => (j === i ? { ...h, text } : h)) }))} minHeight={60} />
                <input className="wide small-input" value={hint.image} placeholder={t('Afbeelding (optioneel): https://…')} aria-label={t('Afbeelding bij hint {n}', { n: i + 1 })} onChange={(e) => set({ hints: form.hints.map((h, j) => (j === i ? { ...h, image: e.target.value } : h)) })} />
              </div>
            ))}
            {!isVariant ? (
              <button type="button" className="link" onClick={() => set({ hints: [...form.hints, { cost: '25', text: {}, image: '' }] })}>
                {t('+ Hint toevoegen')}
              </button>
            ) : null}
          </Panel>
        ) : null}

        {active === 'media' ? (
          <Panel title={t('Foto')} variant={isVariant} on={on.image} onToggle={toggle('image')} help={t('Spelers zien de foto boven de opdrachttekst.')}>
            {form.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={form.image} alt="" className="te-photo" />
            ) : null}
            <div className="actions" style={{ marginTop: 0 }}>
              <label className="filebutton">
                {form.image ? t('Andere foto') : t('Foto uploaden')}
                <input type="file" accept="image/png,image/jpeg,image/webp" hidden disabled={busy} onChange={(e) => void uploadImage(e)} />
              </label>
              {form.image ? (
                <button className="link" onClick={() => set({ image: '' })}>
                  {t('Weghalen')}
                </button>
              ) : null}
            </div>
            <label htmlFor="image">{t('Of een adres (https)')}</label>
            <input id="image" className="wide" value={form.image} placeholder="https://…" onChange={(e) => set({ image: e.target.value })} />
          </Panel>
        ) : null}

        {active === 'activation' ? (
          <Panel title={t('Locatie')} variant={isVariant} on={on.location} onToggle={toggle('location')} help={t('De opdracht opent zodra een team binnen de straal komt. Punten slepen kan ook op de kaartpagina.')}>
            {trackCount > 0 ? <p className="muted">{t('Deze opdracht heeft ook {n} locaties per track; die staan in de kaarteditor.', { n: trackCount })}</p> : null}
            <label className="check">
              <input type="checkbox" checked={form.hasLocation} onChange={(e) => set({ hasLocation: e.target.checked })} />
              {t('Opent op een locatie')}
            </label>
            {form.hasLocation ? (
              <div className="row compact">
                <div>
                  <label htmlFor="lat">{t('Breedtegraad')}</label>
                  <input id="lat" inputMode="decimal" value={form.lat} onChange={(e) => set({ lat: e.target.value })} placeholder="53.2037" />
                </div>
                <div>
                  <label htmlFor="lng">{t('Lengtegraad')}</label>
                  <input id="lng" inputMode="decimal" value={form.lng} onChange={(e) => set({ lng: e.target.value })} placeholder="5.7895" />
                </div>
                <div style={{ flex: '0 1 120px' }}>
                  <label htmlFor="radius">{t('Straal (m)')}</label>
                  <input id="radius" inputMode="numeric" value={form.radius} onChange={(e) => set({ radius: e.target.value })} />
                </div>
              </div>
            ) : null}
          </Panel>
        ) : null}

        {active === 'settings' ? (
          <Panel title={t('Instellingen')} variant={false}>
            <div className="row compact">
              <div>
                <label htmlFor="tags">{t('Labels')}</label>
                <input id="tags" value={form.tags} onChange={(e) => set({ tags: e.target.value })} placeholder={t('puzzel, binnen')} />
              </div>
              <div style={{ flex: '0 1 160px' }}>
                <label htmlFor="mapLabel">{t('Nummer in kaarticoon')}</label>
                <input id="mapLabel" value={form.mapLabel} maxLength={3} onChange={(e) => set({ mapLabel: e.target.value })} placeholder={t('leeg = titel')} />
              </div>
              <div style={{ flex: '0 1 220px' }}>
                <label htmlFor="mapIcon">{t('Kaarticoon')}</label>
                <select id="mapIcon" value={form.mapIcon} onChange={(e) => set({ mapIcon: e.target.value as '' | 'logo' | 'flag' })}>
                  <option value="">{t('Standaard')}</option>
                  <option value="logo">{t('Logo in trackkleur')}</option>
                  <option value="flag">{t('Finishvlag (met nummer)')}</option>
                </select>
              </div>
            </div>
            <p className="help">{t("Labels scheiden met komma's. Spelregels kunnen labels gebruiken, bijvoorbeeld “alle puzzels af”.")}</p>
          </Panel>
        ) : null}

        {active === 'used' ? (
          <Panel title={t('Gebruikt in')} variant={false}>
            {usedIn.length === 0 ? (
              <p className="muted">{t('Alleen in dit spel. Er zijn geen stads- of klantvarianten die erop voortbouwen.')}</p>
            ) : (
              <>
                <p>{t('Wijzigingen hier gelden ook voor deze varianten, behalve voor velden die een variant zelf heeft aangepast:')}</p>
                <ul className="usedlist">
                  {usedIn.map((g) => (
                    <li key={g.id}>
                      <Link href={`/spellen/${g.id}/opdracht/${key}`}>{g.slug}</Link> <span className="muted small">{g.layer === 'city' ? t('stad') : t('klant')}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </Panel>
        ) : null}
      </div>

      {!isVariant && usedIn.length > 0 && dirty ? (
        <p className="te-warn">
          {usedIn.length === 1
            ? t('Deze opdracht wordt ook gebruikt in 1 variant. Je wijziging geldt daar ook.')
            : t('Deze opdracht wordt ook gebruikt in {n} varianten. Je wijziging geldt daar ook.', { n: usedIn.length })}
        </p>
      ) : null}
      <footer className="te-foot">
        <button onClick={() => void save()} disabled={busy || !dirty}>
          {busy ? t('Bezig…') : t('Wijzigingen opslaan')}
        </button>
        <div className="te-status">
          {errors.length > 0 ? (
            <ul className="errors">
              {errors.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          ) : dirty ? (
            <span className="muted">{t('Niet opgeslagen wijzigingen')}</span>
          ) : notice ? (
            <span className="notice">{notice}</span>
          ) : null}
        </div>
        <Link href={`/spellen/${id}`} className="muted">
          {t('Terug naar het spel')}
        </Link>
      </footer>
    </div>
  );
}
