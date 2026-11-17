'use client';
import { composeGame, CompositionError, type Rule } from '@hunt/engine';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { actionsToRow, rowsToBase, type LayerRows, type TranslationRow } from '@/lib/game-model';
import { loadChain } from '@/lib/game-store';
import { describeRule, parseRule } from '@/lib/rules';
import { supabase } from '@/lib/supabase';

interface Draft {
  id: string;
  label: string;
  when: string;
  then: string;
  isNew: boolean;
}

const pretty = (v: unknown) => JSON.stringify(v, null, 2);

export default function RulesPage() {
  const { id } = useParams<{ id: string }>();
  const [rows, setRows] = useState<LayerRows | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const chain = await loadChain(supabase(), id);
      setRows(chain[0]!);
    } catch (err) {
      setErrors([err instanceof Error ? err.message : String(err)]);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!rows) return errors.length ? <ul className="errors">{errors.map((e, i) => <li key={i}>{e}</li>)}</ul> : <p className="muted">Laden…</p>;
  if (rows.game.id !== id) {
    return <p className="card">Regels horen bij het basisspel. Open het basisspel om ze te bewerken.</p>;
  }

  const base = rowsToBase(rows);
  const db = supabase();
  const must = (r: { error: { message: string } | null }) => {
    if (r.error) throw new Error(r.error.message);
  };

  const run = async (fn: () => Promise<void>, done: string) => {
    setBusy(true);
    setErrors([]);
    setNotice(null);
    try {
      await fn();
      setNotice(done);
      await load();
    } catch (err) {
      setErrors(err instanceof CompositionError ? err.issues : [err instanceof Error ? err.message : String(err)]);
    } finally {
      setBusy(false);
    }
  };

  const saveDraft = () =>
    run(async () => {
      if (!draft) return;
      if (!/^[a-z0-9][a-z0-9-]{0,62}$/.test(draft.id)) throw new Error('Gebruik voor de sleutel alleen kleine letters, cijfers en streepjes.');
      if (draft.isNew && base.rules.some((r) => r.id === draft.id)) throw new Error('Die sleutel bestaat al.');
      const { rule, error } = parseRule(draft.id, draft.label, draft.when, draft.then);
      if (!rule) throw new Error(error);
      // Eerst proef-samenstellen: onbekende opdrachten, reeksen of eindes komen hier boven.
      const rules = draft.isNew ? [...base.rules, rule] : base.rules.map((r) => (r.id === rule.id ? rule : r));
      composeGame({ ...base, rules }, [], { id: 'proef', version: 0 });

      const texts: TranslationRow[] = [];
      const actions = actionsToRow(rule, texts);
      const position = draft.isNew ? Math.max(-1, ...rows.rules.map((r) => r.position)) + 1 : rows.rules.find((r) => r.key === rule.id)!.position;
      const row = { condition: rule.when, actions, label: rule.label ?? null };
      if (draft.isNew) must(await db.from('rules').insert({ game_id: id, key: rule.id, position, ...row }));
      else must(await db.from('rules').update(row).eq('game_id', id).eq('key', rule.id));
      must(await db.from('translations').delete().eq('game_id', id).eq('entity', 'rule').eq('entity_id', rule.id));
      if (texts.length) must(await db.from('translations').insert(texts.map((t) => ({ ...t, game_id: id }))));
      setDraft(null);
    }, 'Regel opgeslagen. Publiceer het spel om hem te gebruiken.');

  const remove = (rule: Rule) =>
    run(async () => {
      composeGame({ ...base, rules: base.rules.filter((r) => r.id !== rule.id) }, [], { id: 'proef', version: 0 });
      must(await db.from('rules').delete().eq('game_id', id).eq('key', rule.id));
      must(await db.from('translations').delete().eq('game_id', id).eq('entity', 'rule').eq('entity_id', rule.id));
    }, 'Regel verwijderd.');

  const move = (index: number, delta: number) =>
    run(async () => {
      const order = [...base.rules];
      const [item] = order.splice(index, 1);
      order.splice(index + delta, 0, item!);
      for (const [position, r] of order.entries()) {
        must(await db.from('rules').update({ position }).eq('game_id', id).eq('key', r.id));
      }
    }, 'Volgorde opgeslagen.');

  return (
    <>
      <p className="muted">
        <Link href="/spellen">Spellen</Link> › <Link href={`/spellen/${id}`}>{rows.game.slug}</Link> › Regels
      </p>
      <h1>Regels</h1>
      <p className="muted">
        Een regel is “als dit gebeurt, dan dat”. Elke regel vuurt één keer, op het eerste moment dat de voorwaarde waar
        wordt. Volgorde telt bij regels die op hetzelfde moment vuren.
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
        <div className="card">
          <div className="row">
            <div>
              <label htmlFor="key">Sleutel</label>
              <input id="key" value={draft.id} disabled={!draft.isNew} onChange={(e) => setDraft({ ...draft, id: e.target.value })} />
            </div>
            <div>
              <label htmlFor="label">Omschrijving</label>
              <input id="label" value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })} />
            </div>
          </div>
          <label htmlFor="when">Als (voorwaarde, JSON)</label>
          <textarea id="when" rows={6} className="mono" value={draft.when} onChange={(e) => setDraft({ ...draft, when: e.target.value })} />
          <label htmlFor="then">Dan (acties, JSON)</label>
          <textarea id="then" rows={10} className="mono" value={draft.then} onChange={(e) => setDraft({ ...draft, then: e.target.value })} />
          {(() => {
            const { rule } = parseRule(draft.id || 'nieuw', draft.label, draft.when, draft.then);
            return rule ? <p className="muted">{describeRule(rule)}</p> : null;
          })()}
          <div className="actions">
            <button onClick={() => void saveDraft()} disabled={busy}>
              Opslaan
            </button>
            <button className="secondary" onClick={() => setDraft(null)}>
              Annuleren
            </button>
          </div>
        </div>
      ) : (
        <div className="actions">
          <button
            onClick={() =>
              setDraft({
                id: '',
                label: '',
                when: pretty({ kind: 'elapsed', minutes: 10 }),
                then: pretty([{ kind: 'message', text: { nl: 'Nog 10 minuten!', en: '10 minutes left!' } }]),
                isNew: true,
              })
            }
          >
            Nieuwe regel
          </button>
        </div>
      )}

      <h2>Alle regels</h2>
      <ol className="rules">
        {base.rules.map((rule, i) => (
          <li key={rule.id} className="card">
            <strong>{rule.label ?? rule.id}</strong> <span className="muted">{rule.id}</span>
            <p>{describeRule(rule)}</p>
            <div className="actions">
              <button
                className="secondary"
                onClick={() => setDraft({ id: rule.id, label: rule.label ?? '', when: pretty(rule.when), then: pretty(rule.then), isNew: false })}
              >
                Bewerken
              </button>
              <button className="secondary" disabled={busy || i === 0} onClick={() => void move(i, -1)}>
                ↑
              </button>
              <button className="secondary" disabled={busy || i === base.rules.length - 1} onClick={() => void move(i, 1)}>
                ↓
              </button>
              <button className="link" disabled={busy} onClick={() => {
                  if (window.confirm(`Regel ${rule.id} verwijderen?`)) void remove(rule);
                }}>
                Verwijderen
              </button>
            </div>
          </li>
        ))}
      </ol>
    </>
  );
}
