'use client';
import { composeGame, type Task, type TaskField } from '@hunt/engine';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState, type ChangeEvent, type ReactNode } from 'react';
import { answerToRow, rowsToBase, taskSettings, rowsToVariant, type LayerRows, type TranslationRow } from '@/lib/game-model';
import { loadChain } from '@/lib/game-store';
import { mediaPath } from '@/lib/map-settings';
import { supabase } from '@/lib/supabase';
import { cleanText, formToTask, taskToForm, type AnswerType, type TaskForm, type Texts } from '@/lib/task-form';

const ANSWER_TYPES: { value: AnswerType; label: string }[] = [
  { value: 'info', label: 'Info (alleen OK)' },
  { value: 'choice', label: 'Meerkeuze, één goed' },
  { value: 'multi', label: 'Meerkeuze, meerdere goed' },
  { value: 'text', label: 'Tekst' },
  { value: 'number', label: 'Getal' },
  { value: 'photo', label: 'Foto' },
];

const LANG_NAME: Record<string, string> = { nl: 'Nederlands', en: 'Engels', de: 'Duits', es: 'Spaans', pt: 'Portugees', it: 'Italiaans', fr: 'Frans' };

/** Velden die een stad of klant mag aanpassen, met wat het formulier dan toont. */
type Editable = 'title' | 'body' | 'image' | 'confirm' | 'correctComment' | 'wrongComment' | 'answer' | 'points' | 'hints' | 'location';

function TextFields(props: { languages: string[]; value: Texts; onChange: (v: Texts) => void; multiline?: boolean; label: string }) {
  return (
    <div>
      {props.languages.map((lang) => (
        <div key={lang}>
          <label>
            {props.label} <span className="muted">({LANG_NAME[lang] ?? lang.toUpperCase()})</span>
          </label>
          {props.multiline ? (
            <textarea rows={4} value={props.value[lang] ?? ''} onChange={(e) => props.onChange({ ...props.value, [lang]: e.target.value })} />
          ) : (
            <input value={props.value[lang] ?? ''} onChange={(e) => props.onChange({ ...props.value, [lang]: e.target.value })} />
          )}
        </div>
      ))}
    </div>
  );
}

function Section(props: { title: string; enabled: boolean; variant: boolean; on?: boolean; onToggle?: (on: boolean) => void; children: ReactNode }) {
  if (!props.enabled) return null;
  return (
    <section className="card" style={{ marginTop: 16 }}>
      <div className="row" style={{ alignItems: 'center' }}>
        <h2 style={{ margin: 0 }}>{props.title}</h2>
        {props.variant ? (
          <label className="check" style={{ flex: '0 0 auto', margin: 0 }}>
            <input type="checkbox" checked={props.on} onChange={(e) => props.onToggle?.(e.target.checked)} />
            Aanpassen in deze variant
          </label>
        ) : null}
      </div>
      {!props.variant || props.on ? props.children : <p className="muted">Gebruikt de waarde van het spel erboven.</p>}
    </section>
  );
}

export default function TaskPage() {
  const { id, key } = useParams<{ id: string; key: string }>();
  const [chain, setChain] = useState<LayerRows[] | null>(null);
  const [form, setForm] = useState<TaskForm | null>(null);
  const [inherited, setInherited] = useState<Task | null>(null);
  const [on, setOn] = useState<Partial<Record<Editable, boolean>>>({});
  const [errors, setErrors] = useState<string[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const c = await loadChain(supabase(), id);
      const [baseRows, ...variantRows] = c;
      const base = rowsToBase(baseRows!);
      const variants = variantRows.map((r) => rowsToVariant(r, baseRows!));
      const find = (tasks: Task[]) => tasks.find((t) => t.id === key);
      // Startwaarden: het spel tot en met deze laag. "Geërfd": tot en met de laag erboven.
      const compose = (n: number) => find(composeGame(base, variants.slice(0, n), { id: 'x', version: 0 }).tasks) ?? null;
      const current = variants.length ? compose(variants.length) : find(base.tasks);
      if (!current) throw new Error(`Opdracht ${key} niet gevonden.`);
      setChain(c);
      setForm(taskToForm(current));
      setInherited(variants.length ? compose(variants.length - 1) : null);
      const own = variants[variants.length - 1];
      if (own) {
        const flags: Partial<Record<Editable, boolean>> = {};
        for (const o of own.overrides) {
          if ('task' in o.target && o.target.task === key) {
            const f = o.target.field === 'trackLocations' ? 'location' : (o.target.field as Editable);
            flags[f] = true;
          }
        }
        setOn(flags);
      }
    } catch (err) {
      setErrors([err instanceof Error ? err.message : String(err)]);
    }
  }, [id, key]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!chain || !form) return errors.length ? <ul className="errors">{errors.map((e, i) => <li key={i}>{e}</li>)}</ul> : <p className="muted">Laden…</p>;

  const baseRows = chain[0]!;
  const self = chain[chain.length - 1]!;
  const layer = self.game.layer;
  const isVariant = layer !== 'base';
  const taskRow = baseRows.tasks.find((t) => t.key === key)!;
  const languages = baseRows.game.languages;

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
      setNotice('Opgeslagen. Publiceer het spel om het in nieuwe sessies te gebruiken.');
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
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true);
    setErrors([]);
    try {
      const path = mediaPath(id, `opdracht-${key}`, file.type);
      const up = await db.storage.from('media').upload(path, file, { contentType: file.type });
      if (up.error) throw new Error(up.error.message);
      set({ image: db.storage.from('media').getPublicUrl(path).data.publicUrl });
      setNotice('Foto geüpload. Klik op Opslaan om hem bij de opdracht te bewaren.');
    } catch (err) {
      setErrors([err instanceof Error ? err.message : String(err)]);
    } finally {
      setBusy(false);
    }
  };

  const answer = form.answerType;
  const trackCount = Object.keys(inherited?.trackLocations ?? {}).length;

  return (
    <>
      <p className="muted">
        <Link href="/spellen">Spellen</Link> › <Link href={`/spellen/${id}`}>{self.game.slug}</Link>
      </p>
      <h1>{cleanText(form.title)[baseRows.game.default_language] ?? key}</h1>
      <p className="muted">
        {key}
        {isVariant ? ` · in ${layer === 'city' ? 'stad' : 'klantvariant'} ${self.game.slug}` : ''}
      </p>
      {isVariant && allowed.size === 0 ? (
        <p className="card">Het basisspel markeert geen velden van deze opdracht als aanpasbaar voor een {layer === 'city' ? 'stad' : 'klant'}.</p>
      ) : null}

      <Section title="Tekst" enabled={may('title') || may('body')} variant={isVariant} on={on.title || on.body} onToggle={(v) => setOn({ ...on, title: v && may('title'), body: v && may('body') })}>
        {may('title') ? <TextFields label="Titel" languages={languages} value={form.title} onChange={(title) => set({ title })} /> : null}
        {may('body') ? <TextFields label="Tekst" multiline languages={languages} value={form.body} onChange={(body) => set({ body })} /> : null}
      </Section>

      <Section title="Foto" enabled={may('image')} variant={isVariant} on={on.image} onToggle={toggle('image')}>
        <p className="muted">Een foto ter ondersteuning van de tekst. Spelers zien hem boven de vraag.</p>
        {form.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={form.image} alt="" style={{ maxWidth: '100%', maxHeight: 280, borderRadius: 8, display: 'block', marginBottom: 8 }} />
        ) : null}
        <div className="actions">
          <label className="filebutton">
            {form.image ? 'Andere foto' : 'Foto uploaden'}
            <input type="file" accept="image/png,image/jpeg,image/webp" hidden disabled={busy} onChange={(e) => void uploadImage(e)} />
          </label>
          {form.image ? (
            <button className="link" onClick={() => set({ image: '' })}>
              Weghalen
            </button>
          ) : null}
        </div>
        <label htmlFor="image">Of een adres (https)</label>
        <input id="image" value={form.image} placeholder="https://…" onChange={(e) => set({ image: e.target.value })} />
      </Section>

      <Section title="Antwoord" enabled={may('answer')} variant={isVariant} on={on.answer} onToggle={toggle('answer')}>
        <label htmlFor="type">Soort antwoord</label>
        <select id="type" value={answer} onChange={(e) => set({ answerType: e.target.value as AnswerType })}>
          {ANSWER_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
        {answer === 'choice' || answer === 'multi' ? (
          <>
            {form.options.map((option, i) => (
              <div key={i} className="card" style={{ marginTop: 8 }}>
                <label className="check">
                  <input
                    type={answer === 'choice' ? 'radio' : 'checkbox'}
                    name="correct"
                    checked={form.correct.includes(i)}
                    onChange={(e) =>
                      set({
                        correct: answer === 'choice' ? [i] : e.target.checked ? [...form.correct, i] : form.correct.filter((x) => x !== i),
                      })
                    }
                  />
                  Optie {i + 1} is goed
                </label>
                <TextFields label={`Optie ${i + 1}`} languages={languages} value={option} onChange={(v) => set({ options: form.options.map((o, j) => (j === i ? v : o)) })} />
                <button
                  type="button"
                  className="link"
                  onClick={() =>
                    set({
                      options: form.options.filter((_, j) => j !== i),
                      correct: form.correct.filter((x) => x !== i).map((x) => (x > i ? x - 1 : x)),
                    })
                  }
                >
                  Optie verwijderen
                </button>
              </div>
            ))}
            <div className="actions">
              <button type="button" className="secondary" onClick={() => set({ options: [...form.options, {}] })}>
                Optie toevoegen
              </button>
            </div>
          </>
        ) : null}
        {answer === 'text' ? (
          <>
            <label htmlFor="accepted">Goede antwoorden (één per regel; hoofdletters, spaties en accenten tellen niet)</label>
            <textarea id="accepted" rows={3} value={form.accepted} onChange={(e) => set({ accepted: e.target.value })} />
          </>
        ) : null}
        {answer === 'number' ? (
          <div className="row">
            <div>
              <label htmlFor="value">Goed getal</label>
              <input id="value" inputMode="decimal" value={form.numberValue} onChange={(e) => set({ numberValue: e.target.value })} />
            </div>
            <div>
              <label htmlFor="tol">Marge (optioneel)</label>
              <input id="tol" inputMode="decimal" value={form.tolerance} onChange={(e) => set({ tolerance: e.target.value })} />
            </div>
          </div>
        ) : null}
        {!isVariant ? (
          <label className="check" style={{ marginTop: 12 }}>
            <input type="checkbox" checked={form.retryUntilCorrect} onChange={(e) => set({ retryUntilCorrect: e.target.checked })} />
            Fout antwoord: opnieuw proberen tot het goed is
          </label>
        ) : null}
      </Section>

      <Section title="Punten" enabled={may('points')} variant={isVariant} on={on.points} onToggle={toggle('points')}>
        <div className="row">
          <div>
            <label htmlFor="points">Punten bij goed</label>
            <input id="points" inputMode="numeric" value={form.points} onChange={(e) => set({ points: e.target.value })} />
          </div>
          {!isVariant ? (
            <>
              <div>
                <label htmlFor="wrong">Punten per fout antwoord</label>
                <input id="wrong" inputMode="numeric" value={form.wrongPoints} onChange={(e) => set({ wrongPoints: e.target.value })} />
              </div>
              <div>
                <label htmlFor="tags">Labels (komma's)</label>
                <input id="tags" value={form.tags} onChange={(e) => set({ tags: e.target.value })} placeholder="puzzel" />
              </div>
              <div>
                <label htmlFor="mapLabel">Nummer in kaarticoon</label>
                <input id="mapLabel" value={form.mapLabel} maxLength={3} onChange={(e) => set({ mapLabel: e.target.value })} placeholder="leeg = titel" />
              </div>
              <div>
                <label htmlFor="mapIcon">Kaarticoon</label>
                <select id="mapIcon" value={form.mapIcon} onChange={(e) => set({ mapIcon: e.target.value as '' | 'logo' })}>
                  <option value="">Standaard</option>
                  <option value="logo">Logo in trackkleur</option>
                </select>
              </div>
            </>
          ) : null}
        </div>
      </Section>

      <Section title="Hints" enabled={may('hints')} variant={isVariant} on={on.hints} onToggle={toggle('hints')}>
        {form.hints.map((hint, i) => (
          <div key={i} className="card" style={{ marginTop: 8 }}>
            {!isVariant ? (
              <>
                <label>Prijs hint {i + 1} (punten eraf)</label>
                <input inputMode="numeric" value={hint.cost} onChange={(e) => set({ hints: form.hints.map((h, j) => (j === i ? { ...h, cost: e.target.value } : h)) })} />
              </>
            ) : null}
            <TextFields label={`Hint ${i + 1}`} languages={languages} value={hint.text} onChange={(text) => set({ hints: form.hints.map((h, j) => (j === i ? { ...h, text } : h)) })} />
            <label>
              Afbeelding bij hint {i + 1} <span className="muted">(optioneel, https-adres)</span>
            </label>
            <input value={hint.image} placeholder="https://…" onChange={(e) => set({ hints: form.hints.map((h, j) => (j === i ? { ...h, image: e.target.value } : h)) })} />
            {!isVariant ? (
              <button type="button" className="link" onClick={() => set({ hints: form.hints.filter((_, j) => j !== i) })}>
                Hint verwijderen
              </button>
            ) : null}
          </div>
        ))}
        {!isVariant ? (
          <div className="actions">
            <button type="button" className="secondary" onClick={() => set({ hints: [...form.hints, { cost: '25', text: {}, image: '' }] })}>
              Hint toevoegen
            </button>
          </div>
        ) : null}
      </Section>

      <Section title="Locatie" enabled={may('location')} variant={isVariant} on={on.location} onToggle={toggle('location')}>
        {trackCount > 0 ? <p className="muted">Deze opdracht heeft ook {trackCount} locaties per track; die volgen in de kaarteditor.</p> : null}
        <label className="check">
          <input type="checkbox" checked={form.hasLocation} onChange={(e) => set({ hasLocation: e.target.checked })} />
          Opent op een locatie
        </label>
        {form.hasLocation ? (
          <div className="row">
            <div>
              <label htmlFor="lat">Breedtegraad</label>
              <input id="lat" inputMode="decimal" value={form.lat} onChange={(e) => set({ lat: e.target.value })} placeholder="53.2037" />
            </div>
            <div>
              <label htmlFor="lng">Lengtegraad</label>
              <input id="lng" inputMode="decimal" value={form.lng} onChange={(e) => set({ lng: e.target.value })} placeholder="5.7895" />
            </div>
            <div>
              <label htmlFor="radius">Straal (m)</label>
              <input id="radius" inputMode="numeric" value={form.radius} onChange={(e) => set({ radius: e.target.value })} />
            </div>
          </div>
        ) : null}
      </Section>

      <Section
        title="Bevestiging en toelichting"
        enabled={!isVariant || may('confirm') || may('correctComment') || may('wrongComment')}
        variant={isVariant}
        on={on.confirm || on.correctComment || on.wrongComment}
        onToggle={(v) => setOn({ ...on, confirm: v && may('confirm'), correctComment: v && may('correctComment'), wrongComment: v && may('wrongComment') })}
      >
        {!isVariant ? (
          <label className="check">
            <input type="checkbox" checked={form.hasConfirm} onChange={(e) => set({ hasConfirm: e.target.checked })} />
            Eerst een bevestigingsvraag stellen
          </label>
        ) : null}
        {form.hasConfirm && may('confirm') ? (
          <TextFields label="Bevestigingsvraag" languages={languages} value={form.confirm} onChange={(confirm) => set({ confirm })} />
        ) : null}
        {may('correctComment') ? (
          <TextFields label="Toelichting bij goed" multiline languages={languages} value={form.correctComment} onChange={(correctComment) => set({ correctComment })} />
        ) : null}
        {may('wrongComment') ? (
          <TextFields label="Toelichting bij fout" multiline languages={languages} value={form.wrongComment} onChange={(wrongComment) => set({ wrongComment })} />
        ) : null}
      </Section>

      {errors.length > 0 ? (
        <ul className="errors">
          {errors.map((e, i) => (
            <li key={i}>{e}</li>
          ))}
        </ul>
      ) : null}
      {notice ? <p className="notice">{notice}</p> : null}
      <div className="actions" style={{ position: 'sticky', bottom: 0, background: 'var(--bg)', padding: '12px 0' }}>
        <button onClick={() => void save()} disabled={busy}>
          {busy ? 'Bezig…' : 'Opslaan'}
        </button>
        <Link href={`/spellen/${id}`} className="muted" style={{ alignSelf: 'center' }}>
          Terug naar het spel
        </Link>
      </div>
    </>
  );
}

