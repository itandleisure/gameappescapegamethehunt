'use client';
import type { Hint, Text } from '@hunt/engine';
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { composeChain, loadChain } from '@/lib/game-store';
import { ADMIN_LANGUAGES, ADMIN_LANGUAGE_NAMES } from '@/lib/i18n';
import { useT } from '@/lib/language';
import { PUZZLE_COLUMNS, puzzleFromTask, puzzleSlots, type PuzzleRow } from '@/lib/puzzles';
import { supabase } from '@/lib/supabase';
import { tx } from '@/lib/text';

type Draft = Omit<PuzzleRow, 'id'> & { id: string | null };

const empty = (): Draft => ({
  id: null,
  name: '',
  title: {},
  body: {},
  correct_comment: {},
  wrong_comment: {},
  answer: { type: 'text', accepted: [] },
  hints: [
    { cost: 25, text: {} },
    { cost: 50, text: {} },
    { cost: 75, text: {} },
  ],
});

function must<T extends { error: { message: string } | null }>(r: T): T {
  if (r.error) throw new Error(r.error.message);
  return r;
}

/** Lege talen weg, zodat de puzzel de tekst van de puzzelplek overneemt. */
const clean = (t: Text): Text => Object.fromEntries(Object.entries(t).filter(([, v]) => v?.trim()).map(([k, v]) => [k, v!.trim()]));

/** Talen die in de puzzel voorkomen, Nederlands altijd eerst. */
function languagesOf(d: Draft): string[] {
  const set = new Set<string>(['nl']);
  for (const t of [d.title, d.body, d.correct_comment, d.wrong_comment, ...d.hints.map((h) => h.text)]) for (const k of Object.keys(t ?? {})) set.add(k);
  return [...set];
}

/**
 * Fysieke puzzels: één lijst met alle puzzels uit de tassen, met antwoord en
 * hints. Bij "Stad inrichten" kies je per puzzelplek een puzzel uit deze lijst.
 */
export default function PuzzlesPage() {
  const { org } = useAuth();
  const t = useT();
  const [list, setList] = useState<PuzzleRow[] | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [langs, setLangs] = useState<string[]>(['nl']);
  const [errors, setErrors] = useState<string[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!org) return;
    try {
      const r = must(await supabase().from('puzzles').select(PUZZLE_COLUMNS).eq('org_id', org.id).order('name'));
      setList((r.data ?? []) as unknown as PuzzleRow[]);
    } catch (err) {
      setErrors([err instanceof Error ? err.message : String(err)]);
    }
  }, [org]);

  useEffect(() => {
    void load();
  }, [load]);

  const run = async (work: () => Promise<string | void>) => {
    setBusy(true);
    setErrors([]);
    setNotice(null);
    try {
      const message = await work();
      if (message) setNotice(message);
      await load();
    } catch (err) {
      setErrors([err instanceof Error ? err.message : String(err)]);
    } finally {
      setBusy(false);
    }
  };

  const open = (d: Draft) => {
    setErrors([]);
    setNotice(null);
    setDraft(d);
    setLangs(languagesOf(d));
  };

  const save = () =>
    run(async () => {
      if (!draft || !org) return;
      if (!draft.name.trim()) throw new Error(t('Geef de puzzel een naam.'));
      const answer = draft.answer;
      if (answer.type === 'text' && !answer.accepted.some((a) => a.trim())) throw new Error(t('Vul het antwoord in.'));
      if (answer.type === 'number' && !Number.isFinite(answer.value)) throw new Error(t('Vul het antwoord in.'));
      const row = {
        org_id: org.id,
        name: draft.name.trim(),
        title: clean(draft.title),
        body: clean(draft.body),
        correct_comment: clean(draft.correct_comment),
        wrong_comment: clean(draft.wrong_comment),
        answer: answer.type === 'text' ? { type: 'text', accepted: answer.accepted.map((a) => a.trim()).filter(Boolean) } : answer,
        hints: draft.hints.filter((h) => Object.values(h.text).some((v) => v?.trim()) || h.image).map((h) => ({ ...h, text: clean(h.text) })),
        updated_at: new Date().toISOString(),
      };
      const db = supabase();
      if (draft.id) must(await db.from('puzzles').update(row).eq('id', draft.id));
      else must(await db.from('puzzles').insert(row));
      setDraft(null);
      return t('Puzzel opgeslagen.');
    });

  const remove = (p: PuzzleRow) => {
    if (!window.confirm(t('Puzzel "{name}" verwijderen? Steden die hem gebruiken, krijgen weer de puzzel uit het template.', { name: p.name }))) return;
    void run(async () => {
      must(await supabase().from('puzzles').delete().eq('id', p.id));
      return t('Puzzel verwijderd.');
    });
  };

  /** De zes puzzels uit het (eerste) template als begin van de lijst. */
  const importFromTemplate = () =>
    run(async () => {
      if (!org) return;
      const db = supabase();
      const base = must(await db.from('games').select('id').eq('org_id', org.id).eq('layer', 'base').order('created_at').limit(1)).data?.[0] as
        | { id: string }
        | undefined;
      if (!base) throw new Error(t('Geen template gevonden.'));
      const game = composeChain(await loadChain(db, base.id));
      const have = new Set((list ?? []).map((p) => p.name.toLowerCase()));
      const rows = puzzleSlots(game)
        .map((task) => puzzleFromTask(task, tx(task.title) || task.id))
        .filter((p): p is NonNullable<typeof p> => !!p && !have.has(p.name.toLowerCase()))
        .map((p) => ({ ...p, org_id: org.id }));
      if (rows.length) must(await db.from('puzzles').insert(rows));
      return t('{n} puzzels overgenomen uit het template.', { n: rows.length });
    });

  const setText = (field: 'title' | 'body' | 'correct_comment' | 'wrong_comment', lang: string, value: string) =>
    draft && setDraft({ ...draft, [field]: { ...draft[field], [lang]: value } });
  const setHint = (i: number, patch: Partial<Hint>) =>
    draft && setDraft({ ...draft, hints: draft.hints.map((h, j) => (j === i ? { ...h, ...patch } : h)) });

  const answerText = (p: PuzzleRow) => (p.answer.type === 'number' ? String(p.answer.value) : p.answer.accepted.join(', '));

  return (
    <>
      <h1>{t('Puzzels')}</h1>
      <p className="muted">
        {t('De fysieke puzzels uit de tassen, met antwoord en hints. Bij "Stad inrichten" kies je per puzzelplek (puzzel 1 t/m 6) welke puzzel erin zit.')}
      </p>
      {notice ? <p className="notice">{notice}</p> : null}
      {errors.length > 0 ? (
        <ul className="errors">
          {errors.map((e, i) => (
            <li key={i}>{e}</li>
          ))}
        </ul>
      ) : null}

      {draft ? (
        <section className="card setup" style={{ marginBottom: 16 }}>
          <h2 style={{ marginTop: 0 }}>{draft.id ? t('Puzzel bewerken') : t('Nieuwe puzzel')}</h2>
          <label htmlFor="pz-name">{t('Naam')}</label>
          <input id="pz-name" value={draft.name} maxLength={120} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder={t('Bijvoorbeeld: Morsecode (internationaal)')} />

          <h3>{t('Antwoord')}</h3>
          <div className="actions">
            <label className="check">
              <input type="radio" checked={draft.answer.type === 'text'} onChange={() => setDraft({ ...draft, answer: { type: 'text', accepted: [] } })} />
              {t('Tekst')}
            </label>
            <label className="check">
              <input type="radio" checked={draft.answer.type === 'number'} onChange={() => setDraft({ ...draft, answer: { type: 'number', value: NaN } })} />
              {t('Getal')}
            </label>
          </div>
          {draft.answer.type === 'text' ? (
            <>
              <input
                aria-label={t('Antwoord')}
                value={draft.answer.accepted.join(', ')}
                onChange={(e) => setDraft({ ...draft, answer: { type: 'text', accepted: e.target.value.split(',') } })}
                placeholder={t('Goede antwoorden, gescheiden door komma\'s')}
              />
              <p className="muted small">{t('Hoofdletters, spaties en accenten maken niet uit.')}</p>
            </>
          ) : (
            <input
              aria-label={t('Antwoord')}
              type="number"
              value={Number.isFinite(draft.answer.value) ? draft.answer.value : ''}
              onChange={(e) => setDraft({ ...draft, answer: { type: 'number', value: e.target.value === '' ? NaN : Number(e.target.value) } })}
            />
          )}

          <h3>{t('Hints')}</h3>
          <p className="muted small">{t('Spelers kopen hints één voor één, in deze volgorde.')}</p>
          {draft.hints.map((h, i) => (
            <div key={i} className="row" style={{ alignItems: 'flex-end' }}>
              <div style={{ flex: '0 0 110px' }}>
                <label htmlFor={`pz-cost-${i}`}>{t('Hint {n}: punten', { n: i + 1 })}</label>
                <input id={`pz-cost-${i}`} type="number" min={0} value={h.cost} onChange={(e) => setHint(i, { cost: Number(e.target.value) })} />
              </div>
              {langs.map((l) => (
                <div key={l} style={{ flex: 1 }}>
                  <label htmlFor={`pz-hint-${i}-${l}`}>{l.toUpperCase()}</label>
                  <input id={`pz-hint-${i}-${l}`} value={h.text[l] ?? ''} onChange={(e) => setHint(i, { text: { ...h.text, [l]: e.target.value } })} />
                </div>
              ))}
              <button className="link small" onClick={() => setDraft({ ...draft, hints: draft.hints.filter((_, j) => j !== i) })}>
                {t('Weg')}
              </button>
            </div>
          ))}
          <button className="link small" onClick={() => setDraft({ ...draft, hints: [...draft.hints, { cost: 25 * (draft.hints.length + 1), text: {} }] })}>
            {t('Hint toevoegen')}
          </button>

          <h3>{t('Teksten per taal')}</h3>
          <p className="muted small">{t('Leeg laten = de tekst van de puzzelplek in het template.')}</p>
          {langs.map((l) => (
            <details key={l} open={l === 'nl'} style={{ margin: '8px 0' }}>
              <summary>{ADMIN_LANGUAGE_NAMES[l as keyof typeof ADMIN_LANGUAGE_NAMES] ?? l.toUpperCase()}</summary>
              <label htmlFor={`pz-title-${l}`}>{t('Titel')}</label>
              <input id={`pz-title-${l}`} value={draft.title[l] ?? ''} onChange={(e) => setText('title', l, e.target.value)} />
              <label htmlFor={`pz-body-${l}`}>{t('Opdrachttekst')}</label>
              <textarea id={`pz-body-${l}`} rows={2} value={draft.body[l] ?? ''} onChange={(e) => setText('body', l, e.target.value)} />
              <label htmlFor={`pz-ok-${l}`}>{t('Reactie bij goed antwoord')}</label>
              <textarea id={`pz-ok-${l}`} rows={2} value={draft.correct_comment[l] ?? ''} onChange={(e) => setText('correct_comment', l, e.target.value)} />
              <label htmlFor={`pz-wrong-${l}`}>{t('Reactie bij fout antwoord')}</label>
              <textarea id={`pz-wrong-${l}`} rows={2} value={draft.wrong_comment[l] ?? ''} onChange={(e) => setText('wrong_comment', l, e.target.value)} />
            </details>
          ))}
          <label htmlFor="pz-lang">{t('Taal toevoegen')}</label>
          <select id="pz-lang" value="" onChange={(e) => e.target.value && setLangs([...langs, e.target.value])} style={{ maxWidth: 240 }}>
            <option value="">…</option>
            {ADMIN_LANGUAGES.filter((l) => !langs.includes(l)).map((l) => (
              <option key={l} value={l}>
                {ADMIN_LANGUAGE_NAMES[l]}
              </option>
            ))}
          </select>

          <div className="actions" style={{ marginTop: 16 }}>
            <button onClick={() => void save()} disabled={busy}>
              {busy ? t('Bezig…') : t('Opslaan')}
            </button>
            <button className="secondary" onClick={() => setDraft(null)} disabled={busy}>
              {t('Annuleren')}
            </button>
          </div>
        </section>
      ) : (
        <div className="actions" style={{ marginBottom: 16 }}>
          <button onClick={() => open(empty())}>{t('Nieuwe puzzel')}</button>
          <button className="secondary" onClick={() => void importFromTemplate()} disabled={busy}>
            {t('Puzzels uit het template overnemen')}
          </button>
        </div>
      )}

      {list === null ? (
        <p className="muted">{t('Laden…')}</p>
      ) : list.length === 0 ? (
        <p className="card muted">{t('Nog geen puzzels. Neem de puzzels uit het template over, of maak een nieuwe.')}</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>{t('Puzzel')}</th>
              <th>{t('Antwoord')}</th>
              <th>{t('Hints')}</th>
              <th>{t('Talen')}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {list.map((p) => (
              <tr key={p.id}>
                <td>
                  <button className="link" onClick={() => open({ ...p })}>
                    {p.name}
                  </button>
                </td>
                <td>{answerText(p)}</td>
                <td>{p.hints.length}</td>
                <td>{languagesOf({ ...p }).join(', ').toUpperCase()}</td>
                <td>
                  <button className="link small" onClick={() => remove(p)} disabled={busy}>
                    {t('Verwijderen')}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
