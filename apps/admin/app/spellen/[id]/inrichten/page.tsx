'use client';
import { gameLanguageShort } from '@/lib/game-languages';
import { trackColor, type AnswerSpec, type GamePackage, type LatLng, type PlayBoundary, type TaskLocation } from '@hunt/engine';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { rectAround } from '@/lib/boundary';
import { CITY_TODOS, todoState, type TodoKey } from '@/lib/city-rollout';
import { FINISH_TASKS, LOCAL_QUESTIONS, MORSE_TASK, finishPoint, gatherAt, iconPins, pinKey, startPoint } from '@/lib/city-setup';
import { PUZZLE_COLUMNS, puzzleChoice, puzzleSlots, type PuzzleChoice, type PuzzleRow } from '@/lib/puzzles';
import type { LayerRows } from '@/lib/game-model';
import { displayName } from '@/lib/game-name';
import { composeChain, loadChain } from '@/lib/game-store';
import { t as tr } from '@/lib/i18n';
import { useT } from '@/lib/language';
import { allPins, type Pin } from '@/lib/map-edit';
import { gameFieldEditable } from '@/lib/map-settings';
import { supabase } from '@/lib/supabase';
import { tx } from '@/lib/text';
import { SetupMap, type SetupMarker } from '@/editor/SetupMap';

type Question = { body: string; options: string[]; correct: number };
type LocalKey = (typeof LOCAL_QUESTIONS)[number];

function must<T extends { error: { message: string } | null }>(r: T): T {
  if (r.error) throw new Error(r.error.message);
  return r;
}

const round = (n: number) => Math.round(n * 1e6) / 1e6;
const at = (p: LatLng): LatLng => ({ lat: round(p.lat), lng: round(p.lng) });

/** Tekst in één taal, of leeg. */
const inLang = (value: unknown, lang: string) => (value && typeof value === 'object' ? ((value as Record<string, string>)[lang] ?? '') : '');

/**
 * Stappenplan om een nieuwe stad in te richten: één scherm per stap, van
 * speelveld tekenen tot de puzzels kiezen. Elke stap slaat zelf op en vinkt
 * zichzelf af in de lijst "Nog te doen" op de spelpagina.
 */
export default function SetupPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const t = useT();
  const [chain, setChain] = useState<LayerRows[] | null>(null);
  const [game, setGame] = useState<GamePackage | null>(null);
  const [step, setStep] = useState(1);
  const [errors, setErrors] = useState<string[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [boundary, setBoundary] = useState<PlayBoundary | null>(null);
  const [finish, setFinish] = useState<LatLng | null>(null);
  const [start, setStart] = useState<LatLng | null>(null);
  const [changes, setChanges] = useState<Record<string, TaskLocation>>({});
  const [questions, setQuestions] = useState<Record<LocalKey, Question>>({
    'lokaal-1': { body: '', options: ['', '', ''], correct: 0 },
    'lokaal-2': { body: '', options: ['', '', ''], correct: 0 },
  });
  const [morseOwn, setMorseOwn] = useState(false);
  const [morseHints, setMorseHints] = useState<string[]>([]);
  const [chosen, setChosen] = useState<PuzzleChoice>({});
  /** De lijst met fysieke puzzels om uit te kiezen. */
  const [library, setLibrary] = useState<PuzzleRow[]>([]);

  useEffect(() => {
    const n = Number(new URLSearchParams(window.location.search).get('stap'));
    if (n >= 1 && n <= CITY_TODOS.length) setStep(n);
  }, []);

  const load = useCallback(async () => {
    try {
      const c = await loadChain(supabase(), id);
      const g = composeChain(c);
      const self = c[c.length - 1]!;
      const lang = self.game.default_language;
      setChain(c);
      setGame(g);
      setBoundary(g.boundary ?? null);
      setFinish(finishPoint(g));
      setStart(startPoint(self.game.settings));
      setChanges({});
      const q = {} as Record<LocalKey, Question>;
      for (const key of LOCAL_QUESTIONS) {
        const task = g.tasks.find((tk) => tk.id === key);
        const body = inLang(task?.body, lang);
        const answer = task?.answer;
        const options = answer?.type === 'choice' ? answer.options.map((o) => inLang(o, lang)) : [];
        while (options.length < 3) options.push('');
        q[key] = {
          // De tekst tussen [ ] uit het template is een invulaanwijzing, geen vraag.
          body: body.startsWith('[') ? '' : body,
          options: options.map((o) => (/^(Antwoord|Answer) [A-Z]\b/.test(o) ? '' : o)),
          correct: answer?.type === 'choice' ? answer.correct : 0,
        };
      }
      setQuestions(q);
      const morse = g.tasks.find((tk) => tk.id === MORSE_TASK);
      setMorseHints((morse?.hints ?? []).map((h) => inLang(h.text, lang)));
      setMorseOwn(self.translations.some((r) => r.entity === 'task' && r.entity_id === MORSE_TASK && r.field.startsWith('hint.')));
      setChosen(puzzleChoice(self.game.settings, g));
      const lib = await supabase().from('puzzles').select(PUZZLE_COLUMNS).order('name');
      setLibrary((lib.data ?? []) as unknown as PuzzleRow[]);
    } catch (err) {
      setErrors([err instanceof Error ? err.message : String(err)]);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const pins: Pin[] = useMemo(() => {
    if (!chain || !game) return [];
    const title = (key: string) => tx(game.tasks.find((tk) => tk.id === key)?.title) || key;
    return iconPins(allPins(chain, game, title)).map((p) => {
      const moved = changes[pinKey(p)];
      return moved ? { ...p, location: moved } : p;
    });
  }, [chain, game, changes]);

  const editBoundary = useCallback((points: PlayBoundary['points']) => {
    setBoundary((b) => (points.length ? { ...(b ?? {}), points } : null));
  }, []);
  const moveIcon = useCallback((key: string, to: LatLng) => {
    setChanges((c) => ({ ...c, [key]: { ...at(to), radius: c[key]?.radius ?? 25 } }));
  }, []);
  const pickFinish = useCallback((p: LatLng) => setFinish(at(p)), []);
  const pickStart = useCallback((p: LatLng) => setStart(at(p)), []);
  const moveFinish = useCallback((_key: string, p: LatLng) => setFinish(at(p)), []);
  const moveStart = useCallback((_key: string, p: LatLng) => setStart(at(p)), []);

  if (!chain || !game) {
    return errors.length ? <ul className="errors">{errors.map((e, i) => <li key={i}>{e}</li>)}</ul> : <p className="muted">{t('Laden…')}</p>;
  }

  const base = chain[0]!;
  const self = chain[chain.length - 1]!;
  const lang = self.game.default_language;
  const todo = todoState(self.game.settings) ?? {};
  const current = CITY_TODOS[step - 1]!;
  const idByKey = new Map(base.tasks.map((tk) => [tk.key, tk.id]));
  const may = (key: string, field: string) =>
    base.overridable.some((o) => o.task_id === idByKey.get(key) && o.field === field && o.layers.includes('city'));
  const taskTitle = (key: string) => tx(game.tasks.find((tk) => tk.id === key)?.title) || key;

  if (self.game.layer !== 'city') {
    return <p className="card">{t('Het stappenplan is alleen voor een stad.')}</p>;
  }

  const goTo = (n: number) => {
    setErrors([]);
    setNotice(null);
    setStep(n);
    router.replace(`/spellen/${id}/inrichten?stap=${n}`, { scroll: false });
    window.scrollTo(0, 0);
  };

  const db = supabase();

  /** Slaat de locatie van opdracht + track op in deze stad. */
  const saveLocation = async (taskKey: string, track: number | null, loc: TaskLocation) => {
    const taskId = idByKey.get(taskKey);
    if (!taskId) return;
    let del = db.from('task_locations').delete().eq('game_id', id).eq('task_id', taskId);
    del = track === null ? del.is('track', null) : del.eq('track', track);
    must(await del);
    must(await db.from('task_locations').insert({ game_id: id, task_id: taskId, track, lat: loc.lat, lng: loc.lng, radius: loc.radius }));
  };

  const saveChanges = async (list: Record<string, TaskLocation>) => {
    for (const [k, loc] of Object.entries(list)) {
      const [taskKey, trackText] = k.split('|');
      await saveLocation(taskKey!, trackText === '' ? null : Number(trackText), loc);
    }
  };

  const setTaskText = async (taskKey: string, field: string, text: string) => {
    must(await db.from('translations').delete().eq('game_id', id).eq('entity', 'task').eq('entity_id', taskKey).eq('field', field).eq('lang', lang));
    if (text.trim()) must(await db.from('translations').insert({ game_id: id, entity: 'task', entity_id: taskKey, field, lang, text: text.trim() }));
  };

  /** Slaat de stap op, vinkt hem af en gaat door naar de volgende. */
  const saveStep = async (work: () => Promise<Record<string, unknown> | void>) => {
    setBusy(true);
    setErrors([]);
    setNotice(null);
    try {
      const extra = (await work()) ?? {};
      const fresh = must(await db.from('games').select('settings').eq('id', id).single()).data as { settings: Record<string, unknown> } | null;
      const settings = fresh?.settings ?? self.game.settings;
      const done = { ...(todoState(settings) ?? {}), [current.key]: true };
      must(await db.from('games').update({ settings: { ...settings, ...extra, todo: done } }).eq('id', id));
      await load();
      if (step < CITY_TODOS.length) goTo(step + 1);
      // Laatste stap: naar het overzicht van het spel, om te controleren en te publiceren.
      else router.push(`/spellen/${id}`);
    } catch (err) {
      setErrors([err instanceof Error ? err.message : String(err)]);
    } finally {
      setBusy(false);
    }
  };

  // ---- Wat elke stap opslaat ----

  const saveBoundary = () =>
    saveStep(async () => {
      if (!boundary || boundary.points.length < 3) throw new Error(t('Het speelveld heeft minstens 3 punten nodig.'));
      must(await db.from('overrides').delete().eq('game_id', id).is('task_id', null).eq('field', 'boundary'));
      must(await db.from('overrides').insert({ game_id: id, task_id: null, field: 'boundary', value: boundary }));
    });

  const saveFinish = () =>
    saveStep(async () => {
      if (!finish) throw new Error(t('Klik op de kaart om de finishlocatie aan te wijzen.'));
      for (const key of FINISH_TASKS) {
        if (!may(key, 'location')) continue;
        const radius = game.tasks.find((tk) => tk.id === key)?.location?.radius ?? 25;
        await saveLocation(key, null, { ...finish, radius });
      }
      if (gameFieldEditable(chain, 'meetingPoint')) {
        const mp = game.meetingPoint;
        const value: Record<string, unknown> = { ...finish, text: mp?.text ?? {} };
        if (mp?.radius) value.radius = mp.radius;
        must(await db.from('overrides').delete().eq('game_id', id).is('task_id', null).eq('field', 'meetingPoint'));
        must(await db.from('overrides').insert({ game_id: id, task_id: null, field: 'meetingPoint', value }));
      }
    });

  const saveStart = () =>
    saveStep(async () => {
      if (!start) throw new Error(t('Klik op de kaart om de startlocatie aan te wijzen.'));
      // Zolang de iconen nog niet zijn versleept, komen ze bij de start te liggen.
      if (!todo.iconen) await saveChanges(gatherAt(pins, start));
      return { start };
    });

  const saveIcons = () => saveStep(async () => saveChanges(changes));

  const saveQuestion = (key: LocalKey) =>
    saveStep(async () => {
      const q = questions[key];
      if (!q.body.trim()) throw new Error(t('Vul de vraag in.'));
      const filled = q.options.map((o, i) => ({ o: o.trim(), i })).filter((x) => x.o);
      if (filled.length < 2) throw new Error(t('Vul minstens twee antwoorden in.'));
      const correct = filled.findIndex((x) => x.i === q.correct);
      if (correct < 0) throw new Error(t('Kies welk antwoord goed is.'));
      if (may(key, 'body')) await setTaskText(key, 'body', q.body);
      if (may(key, 'answer')) {
        const answer: AnswerSpec = { type: 'choice', options: filled.map((x) => ({ [lang]: x.o })), correct };
        const taskId = idByKey.get(key)!;
        must(await db.from('overrides').delete().eq('game_id', id).eq('task_id', taskId).eq('field', 'answer'));
        must(await db.from('overrides').insert({ game_id: id, task_id: taskId, field: 'answer', value: answer }));
      }
    });

  const saveMorse = () =>
    saveStep(async () => {
      must(await db.from('translations').delete().eq('game_id', id).eq('entity', 'task').eq('entity_id', MORSE_TASK).like('field', 'hint.%'));
      if (morseOwn) {
        const rows = morseHints
          .map((text, i) => ({ game_id: id, entity: 'task', entity_id: MORSE_TASK, field: `hint.${i}`, lang, text: text.trim() }))
          .filter((r) => r.text);
        if (rows.length) must(await db.from('translations').insert(rows));
      }
      return { morse: morseOwn ? 'eigen' : 'algemeen' };
    });

  const savePuzzles = () => saveStep(async () => ({ puzzles: chosen }));

  const saveTest = () => saveStep(async () => undefined);

  // ---- Schermen ----

  const finishMarkers = (draggable: boolean): SetupMarker[] =>
    finish
      ? [
          { key: 'finish', ...finish, className: 'flag editable', text: '🏁3', title: t('Finish, extractiepunt 3 en verzamelpunt'), draggable, radius: 25 },
        ]
      : [];
  const startMarkers = (draggable: boolean): SetupMarker[] =>
    start ? [{ key: 'start', ...start, className: 'start', text: 'S', title: t('Startlocatie'), draggable }] : [];
  const fitPoints = (): LatLng[] => {
    const pts: LatLng[] = [...(boundary?.points ?? [])];
    if (finish) pts.push(finish);
    if (start) pts.push(start);
    if (pts.length < 2) pts.push(...pins.map((p) => p.location!).filter(Boolean));
    return pts;
  };
  const styleUrl = game.map?.styleUrl;

  let body: ReactNode = null;
  let save: (() => Promise<void>) | null = null;

  switch (current.key) {
    case 'speelveld': {
      save = saveBoundary;
      const canBoundary = gameFieldEditable(chain, 'boundary');
      body = (
        <>
          <p>{t('Klik op de kaart om de hoeken van het speelveld te zetten. Sleep een hoek om hem te verplaatsen; rechtsklik om hem weg te halen.')}</p>
          {canBoundary ? (
            <div className="actions">
              {!boundary ? (
                <button className="secondary" onClick={() => editBoundary(rectAround(pins.map((p) => p.location!).filter(Boolean)))}>
                  {t('Begin met een rechthoek')}
                </button>
              ) : (
                <button className="link" onClick={() => editBoundary([])}>
                  {t('Opnieuw beginnen')}
                </button>
              )}
              <span className="muted">{boundary ? t('{n} punten.', { n: boundary.points.length }) : t('Nog geen grens.')}</span>
            </div>
          ) : (
            <p className="errors">{t('Het template laat een stad het speelveld niet aanpassen.')}</p>
          )}
          <div className="mapgrid" style={{ gridTemplateColumns: '1fr' }}>
            <SetupMap key="speelveld" styleUrl={styleUrl} fit={fitPoints()} boundary={boundary} onBoundary={canBoundary ? editBoundary : undefined} markers={[]} />
          </div>
        </>
      );
      break;
    }
    case 'finish':
      save = saveFinish;
      body = (
        <>
          <p>
            {t('Klik op de kaart waar het spel eindigt. Op deze plek komen de finishvlag, extractiepunt 3 (het juiste extractiepunt) en het verzamelpunt samen.')}
          </p>
          <div className="mapgrid" style={{ gridTemplateColumns: '1fr' }}>
            <SetupMap key="finish" styleUrl={styleUrl} fit={fitPoints()} boundary={boundary} markers={finishMarkers(true)} onPick={pickFinish} onMove={moveFinish} />
          </div>
        </>
      );
      break;
    case 'start':
      save = saveStart;
      body = (
        <>
          <p>{t('Klik op het speelveld waar de teams beginnen.')}</p>
          {!todo.iconen ? <p className="muted">{t('Bij het opslaan worden alle iconen rond de startlocatie gelegd, zodat je ze in de volgende stap vandaar naar hun plek sleept.')}</p> : null}
          <div className="mapgrid" style={{ gridTemplateColumns: '1fr' }}>
            <SetupMap key="start" styleUrl={styleUrl} fit={fitPoints()} boundary={boundary} markers={[...finishMarkers(false), ...startMarkers(true)]} onPick={pickStart} onMove={moveStart} />
          </div>
        </>
      );
      break;
    case 'iconen': {
      save = saveIcons;
      const markers: SetupMarker[] = [
        ...finishMarkers(false),
        ...pins.map((p) => ({
          key: pinKey(p),
          ...p.location!,
          className: `editable${p.logo ? ' logo' : ''}${p.flag ? ' flag' : ''}`,
          text: p.flag ? `🏁${p.label}` : p.logo ? undefined : p.label,
          color: trackColor(p.track),
          title: p.track === null ? p.title : `${p.title} (${tr('track {n}', { n: p.track })})`,
          draggable: true,
          radius: p.location!.radius,
        })),
        // Als laatste, zodat het startpunt boven de iconen ligt.
        ...startMarkers(false),
      ];
      const moved = Object.keys(changes).length;
      body = (
        <>
          <p>{t('Sleep elk icoon naar zijn plek binnen het speelveld. Elke track heeft een eigen kleur.')}</p>
          <div className="actions">
            {start ? (
              <button className="secondary" onClick={() => setChanges(gatherAt(pins, start))}>
                {t('Alle iconen terug naar de start')}
              </button>
            ) : null}
            <span className="muted">{moved ? t('{n} iconen verplaatst, nog niet opgeslagen.', { n: moved }) : t('{n} iconen.', { n: pins.length })}</span>
          </div>
          <div className="mapgrid" style={{ gridTemplateColumns: '1fr' }}>
            <SetupMap key="iconen" styleUrl={styleUrl} fit={fitPoints()} boundary={boundary} markers={markers} onMove={moveIcon} />
          </div>
        </>
      );
      break;
    }
    case 'vraag1':
    case 'vraag2': {
      const key: LocalKey = current.key === 'vraag1' ? 'lokaal-1' : 'lokaal-2';
      const q = questions[key];
      const set = (patch: Partial<Question>) => setQuestions({ ...questions, [key]: { ...q, ...patch } });
      save = () => saveQuestion(key);
      body = (
        <>
          <p className="muted">
            {t('Teams krijgen deze vraag als ze bij het icoon van {title} komen. Een goed antwoord geeft bonuspunten.', { title: taskTitle(key) })}
          </p>
          <label htmlFor="vraag">{t('Vraag')} ({gameLanguageShort(lang)})</label>
          <textarea id="vraag" rows={4} value={q.body} onChange={(e) => set({ body: e.target.value })} placeholder={t('Bijvoorbeeld: in welk jaar is deze kerk gebouwd?')} />
          <label>{t('Antwoorden (kies welke goed is)')}</label>
          {q.options.map((o, i) => (
            <div key={i} className="check" style={{ margin: '6px 0' }}>
              <input type="radio" name="goed" checked={q.correct === i} onChange={() => set({ correct: i })} aria-label={t('Goed antwoord')} />
              <input
                value={o}
                onChange={(e) => set({ options: q.options.map((x, j) => (j === i ? e.target.value : x)) })}
                placeholder={t('Antwoord {n}', { n: i + 1 })}
                style={{ flex: 1 }}
              />
            </div>
          ))}
          {q.options.length < 5 ? (
            <button className="link small" onClick={() => set({ options: [...q.options, ''] })}>
              {t('Antwoord toevoegen')}
            </button>
          ) : null}
          <p className="muted small">
            {t('Een foto bij de vraag of vertalingen voeg je toe in de')}{' '}
            <Link href={`/spellen/${id}/opdracht/${key}`}>{t('opdrachteditor')}</Link>.
          </p>
        </>
      );
      break;
    }
    case 'morse':
      save = saveMorse;
      body = (
        <>
          <p>{t('De hints van de morsecodepuzzel kunnen naar plekken in de stad verwijzen. Gebruik je de algemene morsecode, of schrijf je eigen hints voor deze stad?')}</p>
          <label className="check">
            <input type="radio" name="morse" checked={!morseOwn} onChange={() => setMorseOwn(false)} />
            {t('Algemene morsecode (zoals in het template)')}
          </label>
          <label className="check">
            <input type="radio" name="morse" checked={morseOwn} onChange={() => setMorseOwn(true)} />
            {t('Eigen hints voor deze stad')}
          </label>
          {morseHints.map((h, i) => (
            <div key={i}>
              <label htmlFor={`hint-${i}`}>{t('Hint {n}', { n: i + 1 })}</label>
              <textarea id={`hint-${i}`} rows={2} value={h} disabled={!morseOwn} onChange={(e) => setMorseHints(morseHints.map((x, j) => (j === i ? e.target.value : x)))} />
            </div>
          ))}
        </>
      );
      break;
    case 'puzzels':
      save = savePuzzles;
      body = (
        <>
          <p>{t('Er zijn altijd zes puzzels. Kies per puzzelplek welke fysieke puzzel erin zit; antwoord en hints komen dan van die puzzel.')}</p>
          {puzzleSlots(game).map((slot, i) => (
            <div key={slot.id} className="row" style={{ alignItems: 'center', margin: '6px 0' }}>
              <label htmlFor={`slot-${slot.id}`} style={{ flex: '0 0 110px', margin: 0 }}>
                {t('Puzzel {n}', { n: i + 1 })}
              </label>
              <select
                id={`slot-${slot.id}`}
                value={chosen[slot.id] ?? ''}
                onChange={(e) => setChosen({ ...chosen, [slot.id]: e.target.value || null })}
                style={{ flex: 1 }}
              >
                <option value="">{t('{name} (uit het template)', { name: tx(slot.title) })}</option>
                {library.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
          ))}
          <p className="muted small">
            {library.length ? t('Een puzzel toevoegen of aanpassen doe je op de pagina') : t('Er staan nog geen puzzels in de lijst. Voeg ze toe op de pagina')}{' '}
            <Link href="/puzzels">{t('Puzzels')}</Link>.
          </p>
        </>
      );
      break;
    case 'test':
      save = saveTest;
      body = (
        <>
          <p>{t('Loop een proefronde met de testmodus van de app. Klopt alles, publiceer de stad dan op het overzicht.')}</p>
          <p>
            <Link href={`/spellen/${id}`}>{t('Naar het overzicht om te publiceren')}</Link>
          </p>
        </>
      );
      break;
  }

  return (
    <>
      <p className="muted">
        <Link href="/spellen">{t('Spellen')}</Link> › <Link href={`/spellen/${id}`}>{displayName(self.game, self.translations)}</Link> › {t('Stad inrichten')}
      </p>
      <h1>{t('Stad inrichten')}</h1>
      <ol className="setup-steps">
        {CITY_TODOS.map((td, i) => (
          <li key={td.key} className={`${i + 1 === step ? 'current' : ''}${todo[td.key as TodoKey] ? ' done' : ''}`}>
            <button className="link" onClick={() => goTo(i + 1)}>
              <span className="nr">{todo[td.key as TodoKey] ? '✓' : i + 1}</span> {t(td.label)}
            </button>
          </li>
        ))}
      </ol>
      <section className="card setup">
        <h2 style={{ marginTop: 0 }}>
          {t('Stap {n} van {total}', { n: step, total: CITY_TODOS.length })}: {t(current.label)}
        </h2>
        {body}
        {notice ? <p className="notice">{notice}</p> : null}
        {errors.length > 0 ? (
          <ul className="errors">
            {errors.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        ) : null}
        <div className="actions" style={{ marginTop: 16 }}>
          {step > 1 ? (
            <button className="secondary" onClick={() => goTo(step - 1)} disabled={busy}>
              {t('Vorige')}
            </button>
          ) : null}
          {save ? (
            <button onClick={() => void save!()} disabled={busy}>
              {busy ? t('Bezig…') : step < CITY_TODOS.length ? t('Opslaan en verder') : t('Klaar')}
            </button>
          ) : null}
          {step < CITY_TODOS.length ? (
            <button className="link" onClick={() => goTo(step + 1)} disabled={busy}>
              {t('Overslaan')}
            </button>
          ) : null}
        </div>
      </section>
    </>
  );
}
