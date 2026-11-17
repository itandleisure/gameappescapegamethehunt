'use client';
import { CompositionError } from '@hunt/engine';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import type { LayerRows } from '@/lib/game-model';
import { loadChain, publish } from '@/lib/game-store';
import { supabase } from '@/lib/supabase';

const LAYER_LABEL = { base: 'Basisspel', city: 'Stad', client: 'Klant' } as const;
const ANSWER_LABEL: Record<string, string> = {
  info: 'Info',
  choice: 'Meerkeuze',
  multi: 'Meerdere goed',
  text: 'Tekst',
  number: 'Getal',
  photo: 'Foto',
};

interface Version {
  id: string;
  version: number;
  published_at: string;
}

interface Child {
  id: string;
  slug: string;
  layer: 'city' | 'client';
}

function nl(rows: LayerRows, entity: string, id: string, field: string): string {
  const list = rows.translations.filter((t) => t.entity === entity && t.entity_id === id && t.field === field);
  return (list.find((t) => t.lang === rows.game.default_language) ?? list[0])?.text ?? '';
}

export default function GamePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [chain, setChain] = useState<LayerRows[] | null>(null);
  const [versions, setVersions] = useState<Version[]>([]);
  const [children, setChildren] = useState<Child[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [newKey, setNewKey] = useState('');

  const load = useCallback(async () => {
    const db = supabase();
    try {
      const [c, v, k] = await Promise.all([
        loadChain(db, id),
        db.from('game_versions').select('id, version, published_at').eq('game_id', id).order('version', { ascending: false }),
        db.from('games').select('id, slug, layer').eq('parent_id', id).order('slug'),
      ]);
      setChain(c);
      setVersions((v.data ?? []) as Version[]);
      setChildren((k.data ?? []) as Child[]);
    } catch (err) {
      setErrors([err instanceof Error ? err.message : String(err)]);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!chain) return errors.length ? <ul className="errors">{errors.map((e, i) => <li key={i}>{e}</li>)}</ul> : <p className="muted">Laden…</p>;

  const base = chain[0]!;
  const self = chain[chain.length - 1]!;
  const isBase = self.game.layer === 'base';
  const legacy = isBase && base.tasks.length === 0 && (self.game.settings as { imported?: boolean }).imported;
  const title = isBase ? nl(base, 'game', '', 'name') || self.game.slug : self.game.slug;

  // Wat deze laag aanpast, per opdrachtsleutel.
  const changed = new Set<string>();
  if (!isBase) {
    const keyById = new Map(base.tasks.map((t) => [t.id, t.key]));
    for (const t of self.translations) if (t.entity === 'task') changed.add(t.entity_id);
    for (const o of self.overrides) if (o.task_id) changed.add(keyById.get(o.task_id) ?? '');
    for (const l of self.locations) changed.add(keyById.get(l.task_id) ?? '');
  }

  const doPublish = async () => {
    setBusy(true);
    setErrors([]);
    setNotice(null);
    try {
      const version = await publish(supabase(), id);
      setNotice(`Gepubliceerd als versie ${version}. Nieuwe sessies kunnen deze versie kiezen.`);
      await load();
    } catch (err) {
      setErrors(err instanceof CompositionError ? err.issues : [err instanceof Error ? err.message : String(err)]);
    } finally {
      setBusy(false);
    }
  };

  const addTask = async (e: FormEvent) => {
    e.preventDefault();
    const key = newKey.trim().toLowerCase();
    if (!/^[a-z0-9][a-z0-9-]{0,62}$/.test(key)) {
      setErrors(['Gebruik voor de sleutel alleen kleine letters, cijfers en streepjes.']);
      return;
    }
    const position = Math.max(-1, ...base.tasks.map((t) => t.position)) + 1;
    const { error } = await supabase().from('tasks').insert({ game_id: id, key, position });
    if (error) setErrors([error.message]);
    else router.push(`/spellen/${id}/opdracht/${key}`);
  };

  const tasks = [...base.tasks].sort((a, b) => a.position - b.position);

  return (
    <>
      <p className="muted">
        <Link href="/spellen">Spellen</Link>
        {chain.slice(0, -1).map((c) => (
          <span key={c.game.id}>
            {' '}› <Link href={`/spellen/${c.game.id}`}>{c.game.slug}</Link>
          </span>
        ))}
      </p>
      <h1>{title}</h1>
      <p className="muted">
        {LAYER_LABEL[self.game.layer]} · {self.game.slug} · talen {self.game.languages.join(', ').toUpperCase()}
      </p>

      <div className="actions">
        <button onClick={() => void doPublish()} disabled={busy || Boolean(legacy)}>
          {busy ? 'Bezig…' : 'Publiceren'}
        </button>
        {!legacy && self.game.layer !== 'client' ? (
          <Link href={`/spellen/${id}/kaart`} className="filebutton" style={{ background: 'transparent', color: 'var(--text)', border: '1px solid var(--line)' }}>
            Kaart
          </Link>
        ) : null}
        {!legacy ? (
          <Link href={`/spellen/${id}/overlay`} className="filebutton" style={{ background: 'transparent', color: 'var(--text)', border: '1px solid var(--line)' }}>
            Overlay en verzamelpunt
          </Link>
        ) : null}
        {isBase && !legacy ? (
          <Link href={`/spellen/${id}/regels`} className="filebutton" style={{ background: 'transparent', color: 'var(--text)', border: '1px solid var(--line)' }}>
            Regels
          </Link>
        ) : null}
        {versions[0] ? (
          <span className="muted">
            Laatste versie: v{versions[0].version} van {new Date(versions[0].published_at).toLocaleString('nl-NL')}
          </span>
        ) : (
          <span className="muted">Nog niet gepubliceerd.</span>
        )}
      </div>
      {notice ? <p className="notice">{notice}</p> : null}
      {errors.length > 0 ? (
        <ul className="errors">
          {errors.map((e, i) => (
            <li key={i}>{e}</li>
          ))}
        </ul>
      ) : null}

      {legacy ? (
        <p className="card">
          Dit spel is als kant-en-klaar spelpakket geïmporteerd en heeft daarom geen losse opdrachten om te bewerken. Je
          kunt er wel sessies mee maken. Importeer het spel opnieuw als bundel om het te bewerken.
        </p>
      ) : null}

      {children.length > 0 ? (
        <>
          <h2>{isBase ? 'Steden' : 'Klantvarianten'}</h2>
          <ul>
            {children.map((c) => (
              <li key={c.id}>
                <Link href={`/spellen/${c.id}`}>{c.slug}</Link> <span className="muted">({LAYER_LABEL[c.layer]})</span>
              </li>
            ))}
          </ul>
        </>
      ) : null}

      {!legacy ? (
        <>
          <h2>Opdrachten</h2>
          {!isBase ? (
            <p className="muted">
              Een {self.game.layer === 'city' ? 'stad' : 'klant'} past alleen de aanpasbare velden aan. Opdrachten met een
              stip zijn in deze variant aangepast.
            </p>
          ) : null}
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Opdracht</th>
                  <th>Antwoord</th>
                  <th>Punten</th>
                  <th>Locatie</th>
                </tr>
              </thead>
              <tbody>
                {tasks.map((t) => {
                  const located = chain.some((c) => c.locations.some((l) => l.task_id === t.id));
                  return (
                    <tr key={t.id}>
                      <td>
                        <Link href={`/spellen/${id}/opdracht/${t.key}`}>
                          <strong>{nl(base, 'task', t.key, 'title') || t.key}</strong>
                        </Link>
                        {changed.has(t.key) ? <span className="badge test" style={{ marginLeft: 8 }}>aangepast</span> : null}
                        <div className="muted">{t.key}</div>
                      </td>
                      <td>{ANSWER_LABEL[String(t.answer.type)] ?? String(t.answer.type)}</td>
                      <td>{t.points}</td>
                      <td>{located ? 'Ja' : '–'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {isBase ? (
            <form className="row" onSubmit={addTask} style={{ marginTop: 16 }}>
              <div>
                <label htmlFor="key">Nieuwe opdracht (sleutel)</label>
                <input id="key" value={newKey} onChange={(e) => setNewKey(e.target.value)} placeholder="puzzel-kompas" />
              </div>
              <div style={{ flex: '0 0 auto' }}>
                <button type="submit">Toevoegen</button>
              </div>
            </form>
          ) : null}
        </>
      ) : null}
    </>
  );
}
