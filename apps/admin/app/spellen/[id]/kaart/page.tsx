'use client';
import { DEFAULT_MAP_SOURCE, type GamePackage, type TaskLocation } from '@hunt/engine';
import type { Map as MlMap, Marker } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { LayerRows } from '@/lib/game-model';
import { composeChain, loadChain } from '@/lib/game-store';
import { allPins, circle, pinsFor, trackColor, trackCount, type Pin, type TrackChoice } from '@/lib/map-edit';
import { loadMaplibre } from '@/lib/maplibre';
import { supabase } from '@/lib/supabase';
import { tx } from '@/lib/text';

type Changes = Record<string, TaskLocation>; // sleutel: `${taskKey}|${track ?? ''}`

const changeKey = (task: string, track: TrackChoice) => `${task}|${track ?? ''}`;
const pinKey = (p: Pin) => changeKey(p.key, p.track);
/** Welke pinnen de kaart toont: alle tracks tegelijk, de vaste locaties of één track. */
type View = TrackChoice | 'all';
const trackName = (t: TrackChoice) => (t === null ? 'alle tracks' : `track ${t}`);

export default function MapPage() {
  const { id } = useParams<{ id: string }>();
  const [chain, setChain] = useState<LayerRows[] | null>(null);
  const [game, setGame] = useState<GamePackage | null>(null);
  const [view, setView] = useState<View>('all');
  const [changes, setChanges] = useState<Changes>({});
  const [selected, setSelected] = useState<string | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<MlMap | null>(null);
  const markers = useRef<Marker[]>([]);
  const [ready, setReady] = useState(0);

  const load = useCallback(async () => {
    try {
      const c = await loadChain(supabase(), id);
      setChain(c);
      setGame(composeChain(c));
      setChanges({});
    } catch (err) {
      setErrors([err instanceof Error ? err.message : String(err)]);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const pins: Pin[] = useMemo(() => {
    if (!chain || !game) return [];
    const title = (key: string) => tx(game.tasks.find((t) => t.id === key)?.title) || key;
    // In "alle tracks" ook pinnen die net een (nieuwe) locatie kregen.
    const list = view === 'all' ? allPins(chain, game, title) : pinsFor(chain, game, view, title);
    const keys = new Set(list.map(pinKey));
    const extra =
      view === 'all'
        ? Object.keys(changes)
            .filter((k) => !keys.has(k))
            .flatMap((k) => {
              const [task, t] = k.split('|');
              return pinsFor(chain, game, t === '' ? null : Number(t), title).filter((p) => p.key === task);
            })
        : [];
    return [...list, ...extra].map((p) => {
      const changed = changes[pinKey(p)];
      return changed ? { ...p, location: changed, own: true } : p;
    });
  }, [chain, game, view, changes]);

  // Kaart één keer aanmaken.
  useEffect(() => {
    if (!game || !container.current || map.current) return;
    let cancelled = false;
    void loadMaplibre().then(({ Map }) => {
      if (cancelled || !container.current) return;
      const located = game.tasks.flatMap((t) => [t.location, ...Object.values(t.trackLocations ?? {})]).filter(Boolean) as TaskLocation[];
      const first = located[0] ?? { lat: 52.37, lng: 4.89 };
      const m = new Map({
        container: container.current,
        style: game.map?.styleUrl ?? DEFAULT_MAP_SOURCE.styleUrl,
        center: [first.lng, first.lat],
        zoom: 14,
      });
      m.on('load', () => {
        if (located.length > 1) {
          const lats = located.map((l) => l.lat);
          const lngs = located.map((l) => l.lng);
          m.fitBounds([[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]], { padding: 60, maxZoom: 17 });
        }
        m.addSource('radius', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
        m.addLayer({ id: 'radius-fill', type: 'fill', source: 'radius', paint: { 'fill-color': ['get', 'color'], 'fill-opacity': 0.15 } });
        m.addLayer({ id: 'radius-line', type: 'line', source: 'radius', paint: { 'line-color': ['get', 'color'], 'line-width': 1.5 } });
        setReady((n) => n + 1);
      });
      map.current = m;
    });
    return () => {
      cancelled = true;
    };
  }, [game]);

  // Pinnen en cirkels tekenen.
  useEffect(() => {
    const m = map.current;
    if (!m || !ready) return;
    void loadMaplibre().then(({ Marker: MarkerClass }) => {
      for (const marker of markers.current) marker.remove();
      markers.current = [];
      for (const pin of pins) {
        if (!pin.location) continue;
        const el = document.createElement('div');
        el.className = `pin${pin.editable ? ' editable' : ''}${pin.logo ? ' logo' : ''}${pinKey(pin) === selected ? ' selected' : ''}`;
        el.title = `${pin.title} (${trackName(pin.track)})`;
        if (pin.editable) el.style.backgroundColor = trackColor(pin.track);
        if (!pin.logo) el.textContent = pin.label;
        const marker = new MarkerClass({ element: el, draggable: pin.editable })
          .setLngLat([pin.location.lng, pin.location.lat])
          .addTo(m);
        el.addEventListener('click', () => setSelected(pinKey(pin)));
        marker.on('dragend', () => {
          const { lat, lng } = marker.getLngLat();
          setChanges((c) => ({
            ...c,
            [pinKey(pin)]: { lat: round(lat), lng: round(lng), radius: pin.location!.radius },
          }));
          setSelected(pinKey(pin));
        });
        markers.current.push(marker);
      }
      const source = m.getSource('radius') as { setData?: (d: unknown) => void } | undefined;
      source?.setData?.({
        type: 'FeatureCollection',
        features: pins
          .filter((p) => p.location)
          .map((p) => ({
            type: 'Feature',
            properties: { color: p.editable ? trackColor(p.track) : '#9ca3af' },
            geometry: { type: 'Polygon', coordinates: [circle(p.location!.lat, p.location!.lng, p.location!.radius)] },
          })),
      });
    });
  }, [pins, ready, selected]);

  if (!chain || !game) return errors.length ? <ul className="errors">{errors.map((e, i) => <li key={i}>{e}</li>)}</ul> : <p className="muted">Laden…</p>;

  const self = chain[chain.length - 1]!;
  const tracks = trackCount(game);
  const current = pins.find((p) => pinKey(p) === selected) ?? null;
  const dirty = Object.keys(changes).length;

  const place = (pin: Pin) => {
    const c = map.current?.getCenter();
    if (!c) return;
    setChanges({ ...changes, [pinKey(pin)]: { lat: round(c.lat), lng: round(c.lng), radius: pin.location?.radius ?? 25 } });
    setSelected(pinKey(pin));
  };

  const setRadius = (pin: Pin, radius: number) => {
    if (!pin.location || !(radius > 0)) return;
    setChanges({ ...changes, [pinKey(pin)]: { ...pin.location, radius: Math.round(radius) } });
  };

  const save = async () => {
    setBusy(true);
    setErrors([]);
    setNotice(null);
    const db = supabase();
    const idByKey = new Map(chain[0]!.tasks.map((t) => [t.key, t.id]));
    try {
      for (const [k, loc] of Object.entries(changes)) {
        const [taskKey, trackText] = k.split('|');
        const taskId = idByKey.get(taskKey!)!;
        const t = trackText === '' ? null : Number(trackText);
        let del = db.from('task_locations').delete().eq('game_id', id).eq('task_id', taskId);
        del = t === null ? del.is('track', null) : del.eq('track', t);
        const d = await del;
        if (d.error) throw new Error(d.error.message);
        const ins = await db.from('task_locations').insert({ game_id: id, task_id: taskId, track: t, ...loc });
        if (ins.error) throw new Error(ins.error.message);
      }
      setNotice(`${dirty} locatie${dirty === 1 ? '' : 's'} opgeslagen. Publiceer het spel om ze te gebruiken.`);
      await load();
    } catch (err) {
      setErrors([err instanceof Error ? err.message : String(err)]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <p className="muted">
        <Link href="/spellen">Spellen</Link> › <Link href={`/spellen/${id}`}>{self.game.slug}</Link> › Kaart
      </p>
      <h1>Locaties op de kaart</h1>
      <p className="muted">
        Sleep een pin naar de juiste plek. Elke track heeft een eigen kleur; oranje is een vaste locatie voor alle
        tracks. Grijze pinnen mogen hier niet worden aangepast. {self.game.layer === 'client' ? 'Een klantvariant past geen locaties aan.' : ''}
      </p>
      <div className="row" style={{ alignItems: 'center' }}>
        <div style={{ flex: '0 1 260px' }}>
          <label htmlFor="track">Toon</label>
          <select
            id="track"
            value={view === 'all' ? 'all' : (view ?? '')}
            onChange={(e) => setView(e.target.value === 'all' ? 'all' : e.target.value === '' ? null : Number(e.target.value))}
          >
            <option value="all">Alles op één kaart</option>
            <option value="">Vaste locaties (alle tracks)</option>
            {Array.from({ length: tracks }, (_, i) => (
              <option key={i + 1} value={i + 1}>
                Track {i + 1}
              </option>
            ))}
          </select>
        </div>
        <div className="actions" style={{ flex: '1 1 auto', justifyContent: 'flex-end' }}>
          <button onClick={() => void save()} disabled={busy || dirty === 0}>
            {busy ? 'Bezig…' : dirty ? `Opslaan (${dirty})` : 'Opgeslagen'}
          </button>
        </div>
      </div>
      {notice ? <p className="notice">{notice}</p> : null}
      {errors.length > 0 ? (
        <ul className="errors">
          {errors.map((e, i) => (
            <li key={i}>{e}</li>
          ))}
        </ul>
      ) : null}

      <div className="mapgrid">
        <div ref={container} className="map" />
        <aside className="card">
          {current ? (
            <>
              <h2 style={{ marginTop: 0 }}>{current.title}</h2>
              <p className="muted">
                <span className="dot" style={{ background: trackColor(current.track) }} /> {current.key} · {trackName(current.track)}
              </p>
              {current.location ? (
                <>
                  <p>
                    {current.location.lat.toFixed(6)}, {current.location.lng.toFixed(6)}
                  </p>
                  <label htmlFor="r">Straal (m)</label>
                  <input
                    id="r"
                    type="number"
                    min={1}
                    disabled={!current.editable}
                    value={current.location.radius}
                    onChange={(e) => setRadius(current, Number(e.target.value))}
                  />
                </>
              ) : (
                <p className="muted">Nog geen locatie voor {trackName(current.track)}.</p>
              )}
              {current.editable ? (
                <div className="actions">
                  <button className="secondary" onClick={() => place(current)}>
                    Naar midden van de kaart
                  </button>
                </div>
              ) : (
                <p className="muted">Niet aan te passen in deze laag.</p>
              )}
            </>
          ) : (
            <p className="muted">Klik op een pin of kies een opdracht hieronder.</p>
          )}
          <h2>Opdrachten</h2>
          {view === 'all' ? (
            <p className="muted">Opdrachten zonder locatie plaats je door hierboven één track of de vaste locaties te kiezen.</p>
          ) : null}
          <ul className="pinlist">
            {pins
              .filter((p) => p.editable || p.location)
              .map((p) => (
                <li key={pinKey(p)}>
                  <span className="dot" style={{ background: trackColor(p.track) }} />{' '}
                  <button className="link" onClick={() => setSelected(pinKey(p))}>
                    {p.title}
                  </button>{' '}
                  {view === 'all' && p.track !== null ? <span className="muted">T{p.track}</span> : null}
                  {p.location ? '' : <span className="muted">(geen locatie)</span>}
                  {changes[pinKey(p)] ? <span className="badge test">gewijzigd</span> : null}
                </li>
              ))}
          </ul>
        </aside>
      </div>
    </>
  );
}

function round(n: number) {
  return Math.round(n * 1e6) / 1e6;
}
