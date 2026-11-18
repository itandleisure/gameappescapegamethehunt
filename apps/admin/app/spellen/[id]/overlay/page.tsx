'use client';
import { DEFAULT_MAP_SOURCE, MAP_STYLES, type GamePackage, type Layer, type LatLng, type MapOverlay, type MapSource, type Text } from '@hunt/engine';
import type { ImageSource, Map as MlMap, Marker } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react';
import type { LayerRows } from '@/lib/game-model';
import { composeChain, loadChain } from '@/lib/game-store';
import { t as tr, tKey } from '@/lib/i18n';
import { useT } from '@/lib/language';
import {
  centerBounds,
  gameFieldEditable,
  imageCorners,
  initialBounds,
  moveCorner,
  overlayPath,
  ownGameField,
  type MapGameField,
} from '@/lib/map-settings';
import { loadMaplibre } from '@/lib/maplibre';
import { supabase } from '@/lib/supabase';

const round = (n: number) => Math.round(n * 1e6) / 1e6;

export default function OverlayPage() {
  const { id } = useParams<{ id: string }>();
  const t = useT();
  const [chain, setChain] = useState<LayerRows[] | null>(null);
  const [game, setGame] = useState<GamePackage | null>(null);
  const [overlay, setOverlay] = useState<MapOverlay | null>(null);
  const [meeting, setMeeting] = useState<LatLng | null>(null);
  const [meetingText, setMeetingText] = useState<Text>({});
  const [opacity, setOpacity] = useState(0.7);
  const [mapSource, setMapSource] = useState<MapSource | null>(null);
  /** Welke lagen (stad, klant) een veld mogen aanpassen; alleen in het basisspel in te stellen. */
  const [allowed, setAllowed] = useState<Record<MapGameField, Layer[]>>({ map: [], mapOverlay: [], meetingPoint: [], boundary: [] });
  const [allowedDirty, setAllowedDirty] = useState(false);
  const shownStyle = useRef<string | null>(null);
  const [dirty, setDirty] = useState<Set<MapGameField>>(new Set());
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
      const g = composeChain(c);
      setChain(c);
      setGame(g);
      setOverlay(g.mapOverlay ?? null);
      setMeeting(g.meetingPoint ? { lat: g.meetingPoint.lat, lng: g.meetingPoint.lng } : null);
      setMeetingText(g.meetingPoint?.text ?? {});
      setMapSource(g.map ?? null);
      const fields: MapGameField[] = ['map', 'mapOverlay', 'meetingPoint', 'boundary'];
      setAllowed(
        Object.fromEntries(
          fields.map((f) => [f, c[0]!.overridable.find((o) => o.task_id === null && o.field === f)?.layers.filter((l) => l !== 'base') ?? []]),
        ) as Record<MapGameField, Layer[]>,
      );
      setAllowedDirty(false);
      setDirty(new Set());
    } catch (err) {
      setErrors([err instanceof Error ? err.message : String(err)]);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const touch = (field: MapGameField) => setDirty((d) => new Set(d).add(field));
  const canOverlay = chain ? gameFieldEditable(chain, 'mapOverlay') : false;
  const canMeeting = chain ? gameFieldEditable(chain, 'meetingPoint') : false;
  const canStyle = chain ? gameFieldEditable(chain, 'map') : false;

  // Kaart één keer aanmaken.
  useEffect(() => {
    if (!game || !container.current || map.current) return;
    let cancelled = false;
    void loadMaplibre().then(({ Map }) => {
      if (cancelled || !container.current) return;
      const start =
        game.meetingPoint ??
        (game.mapOverlay ? { lat: (game.mapOverlay.bounds[0].lat + game.mapOverlay.bounds[1].lat) / 2, lng: (game.mapOverlay.bounds[0].lng + game.mapOverlay.bounds[1].lng) / 2 } : null) ??
        game.tasks.map((tk) => tk.location ?? Object.values(tk.trackLocations ?? {})[0]).find(Boolean) ??
        { lat: 52.37, lng: 4.89 };
      const m = new Map({
        container: container.current,
        style: game.map?.styleUrl ?? DEFAULT_MAP_SOURCE.styleUrl,
        center: [start.lng, start.lat],
        zoom: 15,
      });
      shownStyle.current = game.map?.styleUrl ?? DEFAULT_MAP_SOURCE.styleUrl;
      m.on('load', () => setReady((n) => n + 1));
      map.current = m;
    });
    return () => {
      cancelled = true;
    };
  }, [game]);

  // Andere kaartstijl gekozen: de kaart opnieuw opbouwen, daarna de overlay weer erop.
  useEffect(() => {
    const m = map.current;
    const url = mapSource?.styleUrl ?? DEFAULT_MAP_SOURCE.styleUrl;
    if (!m || !ready || shownStyle.current === url) return;
    shownStyle.current = url;
    m.setStyle(url);
    m.once('style.load', () => setReady((n) => n + 1));
  }, [mapSource, ready]);

  // Overlay-afbeelding tonen of bijwerken.
  useEffect(() => {
    const m = map.current;
    if (!m || !ready) return;
    const source = m.getSource('overlay') as ImageSource | undefined;
    const url = overlay && /^https?:/.test(overlay.image) ? overlay.image : null;
    if (!url) {
      if (m.getLayer('overlay')) m.removeLayer('overlay');
      if (source) m.removeSource('overlay');
      return;
    }
    const coordinates = imageCorners(overlay!.bounds);
    if (source && (source as unknown as { url?: string }).url === url) {
      source.setCoordinates(coordinates);
    } else {
      if (m.getLayer('overlay')) m.removeLayer('overlay');
      if (source) m.removeSource('overlay');
      m.addSource('overlay', { type: 'image', url, coordinates });
      m.addLayer({ id: 'overlay', type: 'raster', source: 'overlay', paint: { 'raster-opacity': opacity } });
    }
  }, [overlay, ready, opacity]);

  useEffect(() => {
    const m = map.current;
    if (m?.getLayer('overlay')) m.setPaintProperty('overlay', 'raster-opacity', opacity);
  }, [opacity]);

  // Hoekpunten en verzamelpunt als versleepbare markeringen.
  useEffect(() => {
    const m = map.current;
    if (!m || !ready) return;
    void loadMaplibre().then(({ Marker: MarkerClass }) => {
      for (const marker of markers.current) marker.remove();
      markers.current = [];
      if (overlay) {
        for (const corner of ['nw', 'se'] as const) {
          const at = corner === 'nw' ? overlay.bounds[0] : overlay.bounds[1];
          const el = document.createElement('div');
          el.className = 'corner';
          el.title = corner === 'nw' ? t('Linksboven') : t('Rechtsonder');
          const marker = new MarkerClass({ element: el, draggable: canOverlay }).setLngLat([at.lng, at.lat]).addTo(m);
          marker.on('dragend', () => {
            const { lat, lng } = marker.getLngLat();
            setOverlay((o) => (o ? { ...o, bounds: moveCorner(o.bounds, corner, { lat, lng }) } : o));
            touch('mapOverlay');
          });
          markers.current.push(marker);
        }
      }
      if (meeting) {
        const el = document.createElement('div');
        el.className = `pin meeting${canMeeting ? ' editable' : ''}`;
        el.title = t('Verzamelpunt');
        const marker = new MarkerClass({ element: el, draggable: canMeeting }).setLngLat([meeting.lng, meeting.lat]).addTo(m);
        marker.on('dragend', () => {
          const { lat, lng } = marker.getLngLat();
          setMeeting({ lat: round(lat), lng: round(lng) });
          touch('meetingPoint');
        });
        markers.current.push(marker);
      }
    });
  }, [overlay, meeting, ready, canOverlay, canMeeting, t]);

  if (!chain || !game) return errors.length ? <ul className="errors">{errors.map((e, i) => <li key={i}>{e}</li>)}</ul> : <p className="muted">{t('Laden…')}</p>;

  const self = chain[chain.length - 1]!;
  const isBase = self.game.layer === 'base';
  const center = () => {
    const c = map.current?.getCenter();
    return c ? { lat: round(c.lat), lng: round(c.lng) } : null;
  };

  const upload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true);
    setErrors([]);
    setNotice(null);
    try {
      const path = overlayPath(id, file.type);
      const size = await imageSize(file);
      const db = supabase();
      const up = await db.storage.from('media').upload(path, file, { contentType: file.type, upsert: false });
      if (up.error) throw new Error(up.error.message);
      const url = db.storage.from('media').getPublicUrl(path).data.publicUrl;
      const m = map.current;
      const mid = center() ?? { lat: 52.37, lng: 4.89 };
      // Eerste plaatsing: 60% van de zichtbare breedte, daarna uitlijnen met de hoeken.
      let widthMeters = 500;
      if (m) {
        const b = m.getBounds();
        widthMeters = 0.6 * 111_320 * Math.cos((mid.lat * Math.PI) / 180) * (b.getEast() - b.getWest());
      }
      setOverlay((o) => ({ image: url, bounds: o?.bounds ?? initialBounds(mid, size.width, size.height, widthMeters) }));
      touch('mapOverlay');
      setNotice(t('Afbeelding geüpload. Sleep de blauwe hoeken tot de overlay op de kaart past en sla daarna op.'));
    } catch (err) {
      setErrors([err instanceof Error ? err.message : String(err)]);
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    setBusy(true);
    setErrors([]);
    setNotice(null);
    const db = supabase();
    const must = (r: { error: { message: string } | null }) => {
      if (r.error) throw new Error(r.error.message);
    };
    try {
      if (isBase) {
        const settings: Record<string, unknown> = { ...self.game.settings };
        if (dirty.has('mapOverlay')) {
          if (overlay) settings.mapOverlay = overlay;
          else delete settings.mapOverlay;
        }
        if (dirty.has('map')) {
          if (mapSource) settings.map = mapSource;
          else delete settings.map;
        }
        if (allowedDirty) {
          for (const [field, layers] of Object.entries(allowed)) {
            must(await db.from('overridable_fields').delete().eq('game_id', id).is('task_id', null).eq('field', field));
            if (layers.length) must(await db.from('overridable_fields').insert({ game_id: id, task_id: null, field, layers }));
          }
        }
        if (dirty.has('meetingPoint')) {
          if (meeting) settings.meetingPoint = meeting;
          else delete settings.meetingPoint;
          must(await db.from('translations').delete().eq('game_id', id).eq('entity', 'game').eq('entity_id', '').eq('field', 'meetingPoint'));
          const rows = meeting ? textRows(meetingText) : [];
          if (rows.length) must(await db.from('translations').insert(rows.map((r) => ({ ...r, game_id: id }))));
        }
        must(await db.from('games').update({ settings }).eq('id', id));
      } else {
        for (const field of dirty) {
          must(await db.from('overrides').delete().eq('game_id', id).is('task_id', null).eq('field', field));
          const value = field === 'mapOverlay' ? overlay : field === 'map' ? mapSource : meeting ? { ...meeting, text: cleanText(meetingText) } : null;
          if (value) must(await db.from('overrides').insert({ game_id: id, task_id: null, field, value }));
        }
      }
      setNotice(t('Opgeslagen. Publiceer het spel om het in de app te zien.'));
      await load();
    } catch (err) {
      setErrors([err instanceof Error ? err.message : String(err)]);
    } finally {
      setBusy(false);
    }
  };

  const reset = async (field: MapGameField) => {
    // Een variant valt terug op de waarde uit de laag erboven.
    setBusy(true);
    setErrors([]);
    try {
      const r = await supabase().from('overrides').delete().eq('game_id', id).is('task_id', null).eq('field', field);
      if (r.error) throw new Error(r.error.message);
      setNotice(t('Teruggezet naar de waarde van de laag erboven.'));
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
        <Link href="/spellen">{t('Spellen')}</Link> › <Link href={`/spellen/${id}`}>{self.game.slug}</Link> › {t('Kaartstijl, overlay en verzamelpunt')}
      </p>
      <h1>{t('Kaartstijl, overlay en verzamelpunt')}</h1>
      <p className="muted">
        {t('Een overlay is een eigen kaartafbeelding (bijvoorbeeld een getekende spelkaart) die over de gewone kaart ligt. Het verzamelpunt is waar teams aan het begin en einde samenkomen.')}
      </p>
      <div className="actions">
        <button onClick={() => void save()} disabled={busy || (dirty.size === 0 && !allowedDirty)}>
          {busy ? t('Bezig…') : dirty.size || allowedDirty ? t('Opslaan') : t('Opgeslagen')}
        </button>
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
          <h2 style={{ marginTop: 0 }}>{t('Kaartstijl')}</h2>
          {!canStyle ? (
            <p className="muted">{t('De kaartstijl is in deze laag niet aan te passen.')}</p>
          ) : (
            <>
              <select
                aria-label={t('Kaartstijl')}
                value={MAP_STYLES.find((s) => s.source.styleUrl === (mapSource?.styleUrl ?? DEFAULT_MAP_SOURCE.styleUrl))?.id ?? 'eigen'}
                onChange={(e) => {
                  const style = MAP_STYLES.find((s) => s.id === e.target.value);
                  if (!style) return;
                  setMapSource(style.id === MAP_STYLES[0]!.id ? null : style.source);
                  touch('map');
                }}
              >
                {MAP_STYLES.map((s) => (
                  <option key={s.id} value={s.id}>
                    {t(s.name)}
                  </option>
                ))}
                {mapSource && !MAP_STYLES.some((s) => s.source.styleUrl === mapSource.styleUrl) ? <option value="eigen">{t('Eigen stijl')}</option> : null}
              </select>
              <p className="muted">{t('Zo ziet de kaart eruit in de app. Een stad of klant kan een andere stijl kiezen als dat hieronder mag.')}</p>
              {!isBase && ownGameField(chain, 'map') ? (
                <button className="link" onClick={() => void reset('map')} disabled={busy}>
                  {t('Terug naar kaartstijl van de laag erboven')}
                </button>
              ) : null}
            </>
          )}

          <h2>{t('Overlay')}</h2>
          {!canOverlay ? (
            <p className="muted">{t('De overlay is in deze laag niet aan te passen.')}</p>
          ) : (
            <>
              <label className="filebutton">
                {overlay ? t('Andere afbeelding') : t('Afbeelding uploaden')}
                <input type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => void upload(e)} disabled={busy} />
              </label>
              {overlay ? (
                <>
                  <label htmlFor="opacity">{t('Doorzichtigheid tijdens uitlijnen')}</label>
                  <input id="opacity" type="range" min={0.2} max={1} step={0.05} value={opacity} onChange={(e) => setOpacity(Number(e.target.value))} />
                  <p className="muted">{t('Sleep de blauwe hoeken (linksboven en rechtsonder) tot straten en gebouwen samenvallen.')}</p>
                  <div className="actions">
                    <button
                      className="secondary"
                      onClick={() => {
                        const c = center();
                        if (!c) return;
                        setOverlay({ ...overlay, bounds: centerBounds(overlay.bounds, c) });
                        touch('mapOverlay');
                      }}
                    >
                      {t('Naar midden van de kaart')}
                    </button>
                    <button
                      className="link"
                      onClick={() => {
                        setOverlay(null);
                        touch('mapOverlay');
                      }}
                    >
                      {t('Weghalen')}
                    </button>
                  </div>
                </>
              ) : (
                <p className="muted">{t('Nog geen overlay.')}</p>
              )}
              {!isBase && ownGameField(chain, 'mapOverlay') ? (
                <button className="link" onClick={() => void reset('mapOverlay')} disabled={busy}>
                  {t('Terug naar overlay van de laag erboven')}
                </button>
              ) : null}
            </>
          )}

          <h2>{t('Verzamelpunt')}</h2>
          {!canMeeting ? (
            <p className="muted">{t('Het verzamelpunt is in deze laag niet aan te passen.')}</p>
          ) : (
            <>
              {meeting ? (
                <p>
                  {meeting.lat.toFixed(6)}, {meeting.lng.toFixed(6)}
                </p>
              ) : (
                <p className="muted">{t('Nog geen verzamelpunt.')}</p>
              )}
              <div className="actions">
                <button
                  className="secondary"
                  onClick={() => {
                    const c = center();
                    if (!c) return;
                    setMeeting(c);
                    touch('meetingPoint');
                  }}
                >
                  {meeting ? t('Naar midden van de kaart') : t('Plaatsen in het midden van de kaart')}
                </button>
                {meeting ? (
                  <button
                    className="link"
                    onClick={() => {
                      setMeeting(null);
                      touch('meetingPoint');
                    }}
                  >
                    {t('Weghalen')}
                  </button>
                ) : null}
              </div>
              {meeting
                ? game.languages.map((lang) => (
                    <div key={lang}>
                      <label htmlFor={`mp-${lang}`}>{t('Omschrijving ({lang})', { lang: lang.toUpperCase() })}</label>
                      <input
                        id={`mp-${lang}`}
                        value={meetingText[lang] ?? ''}
                        placeholder={lang === 'nl' ? 'Bij de ingang van de Oldehove' : ''}
                        onChange={(e) => {
                          setMeetingText({ ...meetingText, [lang]: e.target.value });
                          touch('meetingPoint');
                        }}
                      />
                    </div>
                  ))
                : null}
              {!isBase && ownGameField(chain, 'meetingPoint') ? (
                <button className="link" onClick={() => void reset('meetingPoint')} disabled={busy}>
                  {t('Terug naar verzamelpunt van de laag erboven')}
                </button>
              ) : null}
            </>
          )}
          {isBase ? (
            <>
              <h2>{t('Aanpassen in varianten')}</h2>
              <p className="muted">{t('Mag een stad of klant hier een eigen versie van maken?')}</p>
              <table>
                <thead>
                  <tr>
                    <th />
                    <th>{t('Stad')}</th>
                    <th>{t('Klant')}</th>
                  </tr>
                </thead>
                <tbody>
                  {(
                    [
                      ['map', tKey('Kaartstijl')],
                      ['mapOverlay', tKey('Overlay')],
                      ['meetingPoint', tKey('Verzamelpunt')],
                      ['boundary', tKey('Speelveldgrens (rode lijn)')],
                    ] as const
                  ).map(([field, label]) => (
                    <tr key={field}>
                      <td>{t(label)}</td>
                      {(['city', 'client'] as const).map((layer) => (
                        <td key={layer}>
                          <input
                            type="checkbox"
                            aria-label={`${t(label)} ${layer === 'city' ? t('stad') : t('klant')}`}
                            checked={allowed[field].includes(layer)}
                            onChange={(e) => {
                              const next = e.target.checked ? [...allowed[field], layer] : allowed[field].filter((l) => l !== layer);
                              setAllowed({ ...allowed, [field]: next });
                              setAllowedDirty(true);
                            }}
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          ) : null}
        </aside>
      </div>
    </>
  );
}

function cleanText(text: Text): Text {
  return Object.fromEntries(
    Object.entries(text)
      .filter((e): e is [string, string] => typeof e[1] === 'string' && e[1].trim() !== '')
      .map(([k, v]) => [k, v.trim()]),
  ) as Text;
}

function textRows(text: Text) {
  return Object.entries(cleanText(text)).map(([lang, tk]) => ({ entity: 'game' as const, entity_id: '', field: 'meetingPoint', lang, text: tk }));
}

function imageSize(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
      URL.revokeObjectURL(url);
    };
    img.onerror = () => reject(new Error(tr('Deze afbeelding kan niet worden gelezen.')));
    img.src = url;
  });
}
