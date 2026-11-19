'use client';
import { DEFAULT_BOUNDARY_COLOR, DEFAULT_MAP_SOURCE, MAP_STYLES, outsideShade } from '@hunt/engine';
import type { GeoJSONSource, Map as MlMap, Marker } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useEffect, useMemo, useRef, useState } from 'react';
import { boundaryGeoJson, boundaryMaskGeoJson } from '@/lib/boundary';
import { ago, boundsOf, buildTrails, isStale, taskPoints, trailsGeoJson, type MapTeam } from '@/lib/live-map';
import { useLanguage } from '@/lib/language';
import { imageCorners } from '@/lib/map-settings';
import { loadMaplibre } from '@/lib/maplibre';
import type { SessionLive } from '@/lib/session-live';
import { tx } from '@/lib/text';

/** Standaard alleen een kort stukje route achter elk team, zoals in Loquiz. */
const TAIL_MINUTES = 5;

/** Kaartstijl die deze spelleider koos, onthouden in deze browser. */
const STYLE_KEY = 'hunt.livekaart.stijl';

function savedStyle(): string | null {
  try {
    return window.localStorage.getItem(STYLE_KEY);
  } catch {
    return null;
  }
}

export function LiveMap({ data, colors }: { data: SessionLive; colors: Map<string, string> }) {
  const { game, teams, positions, leaders } = data;
  const { t, locale } = useLanguage();
  const [focus, setFocus] = useState<string>(''); // '' = alle teams
  const [showTasks, setShowTasks] = useState(true);
  const [now, setNow] = useState(() => Date.now());
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<MlMap | null>(null);
  const teamMarkers = useRef<Map<string, Marker>>(new Map());
  const hunterMarkers = useRef<Map<string, Marker>>(new Map());
  const [showHunters, setShowHunters] = useState(true);
  const taskMarkers = useRef<Marker[]>([]);
  // Telt op bij elke (nieuwe) kaartstijl, zodat routes opnieuw getekend worden.
  const [ready, setReady] = useState(0);
  const fitted = useRef(false);
  const gameStyle = game.map?.styleUrl ?? DEFAULT_MAP_SOURCE.styleUrl;
  const [styleUrl, setStyleUrl] = useState<string>(() => savedStyle() ?? gameStyle);
  const styleOptions = MAP_STYLES.some((x) => x.source.styleUrl === gameStyle)
    ? MAP_STYLES.map((x) => ({ url: x.source.styleUrl, name: t(x.name) }))
    : [{ url: gameStyle, name: t('Stijl van het spel') }, ...MAP_STYLES.map((x) => ({ url: x.source.styleUrl, name: t(x.name) }))];

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 5_000);
    return () => clearInterval(timer);
  }, []);

  const mapTeams: MapTeam[] = useMemo(
    () => teams.map((x) => ({ id: x.id, name: x.name, track: x.track, color: colors.get(x.id) ?? '#555' })),
    [teams, colors],
  );
  const phones = useMemo(() => new Map(teams.map((x) => [x.id, x.phone ?? ''])), [teams]);
  const codes = useMemo(() => new Map(teams.map((x) => [x.id, x.team_code ?? ''])), [teams]);
  const visible = focus ? mapTeams.filter((x) => x.id === focus) : mapTeams;

  // Hele route bij één gekozen team; anders alleen de laatste minuten.
  const trails = useMemo(
    () => buildTrails(positions, { maxAccuracy: game.gps?.maxAccuracy ?? 30, since: focus ? undefined : now - TAIL_MINUTES * 60_000 }),
    [positions, game, focus, now],
  );
  const fullTrails = useMemo(() => buildTrails(positions, { maxAccuracy: game.gps?.maxAccuracy ?? 30 }), [positions, game]);

  const tasks = useMemo(() => {
    const tracks = [...new Set(visible.map((x) => x.track))];
    return taskPoints(game, tracks, (id) => tx(game.tasks.find((x) => x.id === id)?.title) || id);
  }, [game, visible]);

  // Kaart één keer aanmaken.
  useEffect(() => {
    if (!container.current || map.current) return;
    let cancelled = false;
    void loadMaplibre().then(({ Map, NavigationControl }) => {
      if (cancelled || !container.current) return;
      const pts = taskPoints(game, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], () => '');
      const b = boundsOf(pts);
      const m = new Map({
        container: container.current,
        style: styleUrl,
        center: b ? [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2] : [5.8, 53.2],
        zoom: 15,
      });
      m.addControl(new NavigationControl({ showCompass: false }), 'top-left');
      m.once('load', () => {
        if (b) m.fitBounds([[b[0], b[1]], [b[2], b[3]]], { padding: 50, maxZoom: 17, duration: 0 });
      });
      // Ook na het wisselen van kaartstijl: overlay en routes opnieuw toevoegen.
      m.on('style.load', () => {
        const overlay = game.mapOverlay;
        if (overlay && /^https?:/.test(overlay.image)) {
          m.addSource('overlay', { type: 'image', url: overlay.image, coordinates: imageCorners(overlay.bounds) });
          m.addLayer({ id: 'overlay', type: 'raster', source: 'overlay', paint: { 'raster-opacity': 0.85 } });
        }
        if (game.boundary) {
          const shade = outsideShade(game.boundary);
          if (shade.opacity > 0) {
            m.addSource('outside', { type: 'geojson', data: boundaryMaskGeoJson(game.boundary) as never });
            m.addLayer({ id: 'outside', type: 'fill', source: 'outside', paint: { 'fill-color': shade.color, 'fill-opacity': shade.opacity } });
          }
          m.addSource('boundary', { type: 'geojson', data: boundaryGeoJson(game.boundary) as never });
          m.addLayer({
            id: 'boundary',
            type: 'line',
            source: 'boundary',
            layout: { 'line-join': 'round' },
            paint: { 'line-color': game.boundary.color ?? DEFAULT_BOUNDARY_COLOR, 'line-width': 3 },
          });
        }
        m.addSource('trails', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
        m.addLayer({
          id: 'trails-casing',
          type: 'line',
          source: 'trails',
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: { 'line-color': '#ffffff', 'line-width': 6, 'line-opacity': 0.8 },
        });
        m.addLayer({
          id: 'trails',
          type: 'line',
          source: 'trails',
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: { 'line-color': ['get', 'color'], 'line-width': 3.5 },
        });
        setReady((n) => n + 1);
      });
      map.current = m;
    });
    return () => {
      cancelled = true;
    };
    // De stijl wisselt via setStyle hieronder, niet door de kaart opnieuw te maken.
  }, [game]);

  const chooseStyle = (url: string) => {
    setStyleUrl(url);
    try {
      window.localStorage.setItem(STYLE_KEY, url);
    } catch {
      // Geen opslag (privévenster): de keuze geldt dan alleen voor nu.
    }
    map.current?.setStyle(url);
  };

  useEffect(
    () => () => {
      map.current?.remove();
      map.current = null;
    },
    [],
  );

  // Routes.
  useEffect(() => {
    const m = map.current;
    if (!m || !ready) return;
    (m.getSource('trails') as GeoJSONSource | undefined)?.setData(trailsGeoJson(visible, trails) as never);
  }, [ready, trails, visible]);

  // Teams: huidige positie met naam.
  useEffect(() => {
    const m = map.current;
    if (!m || !ready) return;
    void loadMaplibre().then(({ Marker: MarkerClass }) => {
      const keep = new Set<string>();
      for (const team of visible) {
        const last = fullTrails.get(team.id)?.last;
        if (!last) continue;
        keep.add(team.id);
        let marker = teamMarkers.current.get(team.id);
        if (!marker) {
          const el = document.createElement('div');
          el.className = 'teammarker';
          el.innerHTML = '<span class="dot"></span><span class="name"></span>';
          el.addEventListener('click', () => setFocus((f) => (f === team.id ? '' : team.id)));
          marker = new MarkerClass({ element: el, anchor: 'left', offset: [-9, 0] }).setLngLat([last.lng, last.lat]).addTo(m);
          teamMarkers.current.set(team.id, marker);
        }
        marker.setLngLat([last.lng, last.lat]);
        const el = marker.getElement();
        el.classList.toggle('stale', isStale(last.at, now));
        (el.querySelector('.dot') as HTMLElement).style.background = team.color;
        (el.querySelector('.name') as HTMLElement).textContent = team.name;
        el.title = `${team.name} · ${ago(last.at, now)}`;
      }
      for (const [id, marker] of teamMarkers.current) {
        if (!keep.has(id)) {
          marker.remove();
          teamMarkers.current.delete(id);
        }
      }
    });
  }, [ready, visible, fullTrails, now, t]);

  // Spelleiders (The Hunters) die in de game-app zijn ingelogd.
  useEffect(() => {
    const m = map.current;
    if (!m || !ready) return;
    void loadMaplibre().then(({ Marker: MarkerClass }) => {
      const keep = new Set<string>();
      for (const h of showHunters ? leaders : []) {
        if (h.lat === null || h.lng === null || !h.located_at) continue;
        keep.add(h.id);
        let marker = hunterMarkers.current.get(h.id);
        if (!marker) {
          const el = document.createElement('div');
          el.className = 'huntermarker';
          el.innerHTML = '<span class="dot"></span><span class="name"></span>';
          marker = new MarkerClass({ element: el, anchor: 'left', offset: [-9, 0] }).setLngLat([h.lng, h.lat]).addTo(m);
          hunterMarkers.current.set(h.id, marker);
        }
        marker.setLngLat([h.lng, h.lat]);
        const el = marker.getElement();
        const at = Date.parse(h.located_at);
        el.classList.toggle('stale', isStale(at, now));
        (el.querySelector('.name') as HTMLElement).textContent = h.name;
        el.title = `${h.name} · ${ago(at, now)}`;
      }
      for (const [id, marker] of hunterMarkers.current) {
        if (!keep.has(id)) {
          marker.remove();
          hunterMarkers.current.delete(id);
        }
      }
    });
  }, [ready, leaders, showHunters, now]);

  // Opdrachten.
  useEffect(() => {
    const m = map.current;
    if (!m || !ready) return;
    void loadMaplibre().then(({ Marker: MarkerClass }) => {
      for (const marker of taskMarkers.current) marker.remove();
      taskMarkers.current = [];
      if (!showTasks) return;
      for (const p of tasks) {
        const el = document.createElement('div');
        el.className = 'taskmarker';
        el.textContent = p.label || '•';
        el.title = p.track ? `${p.title} (${t('track {n}', { n: p.track })})` : p.title;
        taskMarkers.current.push(new MarkerClass({ element: el }).setLngLat([p.lng, p.lat]).addTo(m));
      }
    });
  }, [ready, tasks, showTasks, t]);

  // Eén team gekozen: inzoomen op zijn hele route.
  useEffect(() => {
    const m = map.current;
    if (!m || !ready) return;
    if (!focus) {
      fitted.current = false;
      return;
    }
    if (fitted.current) return;
    const coords = fullTrails.get(focus)?.coordinates ?? [];
    const b = boundsOf(coords.map(([lng, lat]) => ({ lat, lng })));
    if (b) {
      m.fitBounds([[b[0], b[1]], [b[2], b[3]]], { padding: 60, maxZoom: 17 });
      fitted.current = true;
    }
  }, [focus, ready, fullTrails]);

  const flyTo = (teamId: string) => {
    const last = fullTrails.get(teamId)?.last;
    if (last) map.current?.flyTo({ center: [last.lng, last.lat], zoom: Math.max(map.current.getZoom(), 16) });
  };

  return (
    <div className="mapgrid">
      <div ref={container} className="map livemap" />
      <aside className="card">
        <label htmlFor="focus" style={{ marginTop: 0 }}>
          {t('Filter teams')}
        </label>
        <select
          id="focus"
          value={focus}
          onChange={(e) => {
            fitted.current = false;
            setFocus(e.target.value);
          }}
        >
          <option value="">{t('Alle teams (laatste {n} min route)', { n: TAIL_MINUTES })}</option>
          {mapTeams.map((x) => (
            <option key={x.id} value={x.id}>
              {x.name} ({t('hele route')})
            </option>
          ))}
        </select>
        <label htmlFor="stijl">{t('Kaartstijl')}</label>
        <select id="stijl" value={styleUrl} onChange={(e) => chooseStyle(e.target.value)}>
          {styleOptions.map((o) => (
            <option key={o.url} value={o.url}>
              {o.name}
            </option>
          ))}
          {styleOptions.some((o) => o.url === styleUrl) ? null : <option value={styleUrl}>{t('Eerder gekozen stijl')}</option>}
        </select>
        <label className="check" style={{ marginTop: 12 }}>
          <input type="checkbox" checked={showTasks} onChange={(e) => setShowTasks(e.target.checked)} />
          {t('Opdrachten tonen')}
        </label>
        {leaders.length ? (
          <label className="check">
            <input type="checkbox" checked={showHunters} onChange={(e) => setShowHunters(e.target.checked)} />
            {t('Spelleiders tonen')}
          </label>
        ) : null}

        <h2>{t('Teams')}</h2>
        {mapTeams.length === 0 ? <p className="muted">{t('Nog geen teams in deze hunt.')}</p> : null}
        <ul className="teamlist">
          {mapTeams.map((tm) => {
            const trail = fullTrails.get(tm.id);
            const last = trail?.last;
            return (
              <li key={tm.id} className={focus === tm.id ? 'active' : ''}>
                <span className="dot" style={{ background: tm.color }} />
                <button className="link" onClick={() => (last ? flyTo(tm.id) : undefined)} title={t('Naar dit team')}>
                  {tm.name}
                </button>
                <span className={`muted small${last && isStale(last.at, now) ? ' warn' : ''}`}>
                  {last ? ago(last.at, now) : t('nog geen locatie')}
                  {trail ? ` · ${(trail.distanceM / 1000).toLocaleString(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} km` : ''}
                  {codes.get(tm.id) ? ` · ${t('teamcode {code}', { code: codes.get(tm.id) ?? '' })}` : ''}
                  {phones.get(tm.id) ? (
                    <>
                      {' · '}
                      <a href={`tel:${phones.get(tm.id)}`}>{phones.get(tm.id)}</a>
                    </>
                  ) : null}
                </span>
                <button
                  className="link small"
                  onClick={() => {
                    fitted.current = false;
                    setFocus(focus === tm.id ? '' : tm.id);
                  }}
                >
                  {focus === tm.id ? t('alle teams') : t('route')}
                </button>
              </li>
            );
          })}
        </ul>
        {leaders.length ? (
          <>
            <h2>{t('Spelleiders')}</h2>
            <ul className="teamlist">
              {leaders.map((h) => (
                <li key={h.id}>
                  <span className="dot hunterdot" />
                  <button
                    className="link"
                    onClick={() =>
                      h.lat !== null && h.lng !== null
                        ? map.current?.flyTo({ center: [h.lng, h.lat], zoom: Math.max(map.current.getZoom(), 16) })
                        : undefined
                    }
                  >
                    {h.name}
                  </button>
                  <span className={`muted small${h.located_at && isStale(Date.parse(h.located_at), now) ? ' warn' : ''}`}>
                    {h.located_at ? ago(Date.parse(h.located_at), now) : t('nog geen locatie')}
                  </span>
                </li>
              ))}
            </ul>
          </>
        ) : null}
        <p className="muted small">
          {t('Een grijs team heeft al meer dan 2 minuten geen locatie gestuurd (geen bereik of GPS uit).')}
        </p>
      </aside>
    </div>
  );
}
