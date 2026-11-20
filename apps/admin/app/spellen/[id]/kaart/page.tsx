'use client';
import { gameLanguageShort } from '@/lib/game-languages';
import {
  circlesGeoJson,
  DEFAULT_BOUNDARY_COLOR,
  DEFAULT_MEETING_RADIUS,
  MAP_STYLES,
  outsideShade,
  type GamePackage,
  type LatLng,
  type Layer,
  type MapOverlay,
  type MapSource,
  type PlayBoundary,
  type TaskLocation,
  type Text,
} from '@hunt/engine';
import type { GeoJSONSource, ImageSource, Map as MlMap, MapMouseEvent, Marker } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { bendSegment, boundaryGeoJson, boundaryMaskGeoJson, insertPoint, movePoint, rectAround, removePoint, segmentHandle, straightenSegment } from '@/lib/boundary';
import type { LayerRows } from '@/lib/game-model';
import { composeChain, loadChain } from '@/lib/game-store';
import { t as tr, tKey } from '@/lib/i18n';
import { useT } from '@/lib/language';
import { useAuth } from '@/lib/auth';
import { DEFAULT_SETTINGS, defaultMapSource } from '@/lib/org-settings';
import { useOrgSettings } from '@/lib/org-settings-store';
import { allPins, circle, pinsFor, trackColor, trackCount, type Pin, type TrackChoice } from '@/lib/map-edit';
import { gameFieldEditable, imageCorners, ownGameField, type MapGameField } from '@/lib/map-settings';
import { loadMaplibre } from '@/lib/maplibre';
import { playfieldStyle, renderPlayfieldImage } from '@/lib/playfield-image';
import { supabase } from '@/lib/supabase';
import { tx } from '@/lib/text';
import { GameNav } from '@/editor/GameNav';

/** Spelvelden die deze pagina naast de pinnen en de grens bewaart. */
type SettingField = Exclude<MapGameField, 'boundary'>;

type Changes = Record<string, TaskLocation>; // sleutel: `${taskKey}|${track ?? ''}`

const changeKey = (task: string, track: TrackChoice) => `${task}|${track ?? ''}`;
const pinKey = (p: Pin) => changeKey(p.key, p.track);
/** Welke pinnen de kaart toont: alle tracks tegelijk, de vaste locaties of één track. */
type View = TrackChoice | 'all';
const trackName = (tk: TrackChoice) => (tk === null ? tr('alle tracks') : tr('track {n}', { n: tk }));

export default function MapPage() {
  const { id } = useParams<{ id: string }>();
  const t = useT();
  const { org } = useAuth();
  /** Standaard uit Instellingen › Spellen en landen, voor wat het spel zelf niet kiest. */
  const gs = (useOrgSettings(org?.id) ?? DEFAULT_SETTINGS).games;
  const fallbackStyle = defaultMapSource(gs).styleUrl;
  const shadeOf = (b: PlayBoundary | null) =>
    outsideShade({ outsideColor: b?.outsideColor ?? gs.outside_color, outsideOpacity: b?.outsideOpacity ?? gs.outside_opacity });
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
  /** Speelveldgrens zoals hij nu op het scherm staat, en of hij gewijzigd is. */
  const [boundary, setBoundary] = useState<PlayBoundary | null>(null);
  const [boundaryDirty, setBoundaryDirty] = useState(false);
  const [drawing, setDrawing] = useState(false);
  /** Speelveldgrens (en een eventuele oude overlay) onder de pinnen tonen. */
  const [showOverlay, setShowOverlay] = useState(true);
  const drawingRef = useRef(false);
  const vertexMarkers = useRef<Marker[]>([]);
  /** Kaartstijl, verzamelpunt en een eventuele oude overlay. */
  const [mapSource, setMapSource] = useState<MapSource | null>(null);
  const [overlay, setOverlay] = useState<MapOverlay | null>(null);
  const [meeting, setMeeting] = useState<LatLng | null>(null);
  const [meetingText, setMeetingText] = useState<Text>({});
  const [meetingRadius, setMeetingRadius] = useState(DEFAULT_MEETING_RADIUS);
  const [fieldsDirty, setFieldsDirty] = useState<Set<SettingField>>(new Set());
  /** Welke lagen (stad, klant) een veld mogen aanpassen; alleen in het basisspel in te stellen. */
  const [allowed, setAllowed] = useState<Record<MapGameField, Layer[]>>({ map: [], mapOverlay: [], meetingPoint: [], boundary: [] });
  const [allowedDirty, setAllowedDirty] = useState(false);
  const shownStyle = useRef<string | null>(null);
  /** Voorbeeld van het kaartje voor de speluitleg (zie playfield-image.ts). */
  const [preview, setPreview] = useState<string | null>(null);
  const [previewBusy, setPreviewBusy] = useState(false);
  const meetingMarker = useRef<Marker | null>(null);

  const load = useCallback(async () => {
    try {
      const c = await loadChain(supabase(), id);
      setChain(c);
      const g = composeChain(c);
      setGame(g);
      setChanges({});
      setBoundary(g.boundary ?? null);
      setBoundaryDirty(false);
      setMapSource(g.map ?? null);
      setOverlay(g.mapOverlay ?? null);
      setMeeting(g.meetingPoint ? { lat: g.meetingPoint.lat, lng: g.meetingPoint.lng } : null);
      setMeetingText(g.meetingPoint?.text ?? {});
      setMeetingRadius(g.meetingPoint?.radius ?? DEFAULT_MEETING_RADIUS);
      setFieldsDirty(new Set());
      const fields: MapGameField[] = ['map', 'mapOverlay', 'meetingPoint', 'boundary'];
      setAllowed(
        Object.fromEntries(
          fields.map((f) => [f, c[0]!.overridable.find((o) => o.task_id === null && o.field === f)?.layers.filter((l) => l !== 'base') ?? []]),
        ) as Record<MapGameField, Layer[]>,
      );
      setAllowedDirty(false);
    } catch (err) {
      setErrors([err instanceof Error ? err.message : String(err)]);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  // Zonder eigen cirkel om het verzamelpunt: de standaard uit Instellingen.
  useEffect(() => {
    if (game && game.meetingPoint?.radius === undefined && !fieldsDirty.has('meetingPoint')) setMeetingRadius(gs.meeting_radius);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game, gs]);

  const pins: Pin[] = useMemo(() => {
    if (!chain || !game) return [];
    const title = (key: string) => tx(game.tasks.find((tk) => tk.id === key)?.title) || key;
    // In "alle tracks" ook pinnen die net een (nieuwe) locatie kregen.
    const list = view === 'all' ? allPins(chain, game, title) : pinsFor(chain, game, view, title);
    const keys = new Set(list.map(pinKey));
    const extra =
      view === 'all'
        ? Object.keys(changes)
            .filter((k) => !keys.has(k))
            .flatMap((k) => {
              const [task, tk] = k.split('|');
              return pinsFor(chain, game, tk === '' ? null : Number(tk), title).filter((p) => p.key === task);
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
      const located = game.tasks.flatMap((tk) => [tk.location, ...Object.values(tk.trackLocations ?? {})]).filter(Boolean) as TaskLocation[];
      const first = located[0] ?? game.meetingPoint ?? { lat: 52.37, lng: 4.89 };
      const m = new Map({
        container: container.current,
        style: game.map?.styleUrl ?? fallbackStyle,
        center: [first.lng, first.lat],
        zoom: 14,
      });
      shownStyle.current = game.map?.styleUrl ?? fallbackStyle;
      m.on('load', () => {
        if (located.length > 1) {
          const lats = located.map((l) => l.lat);
          const lngs = located.map((l) => l.lng);
          m.fitBounds([[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]], { padding: 60, maxZoom: 17 });
        }
        addLayers(m);
        // Klikken op de kaart voegt een punt aan de grens toe, alleen in tekenmodus.
        m.on('click', (e: MapMouseEvent) => {
          if (!drawingRef.current) return;
          // Klikken op een pin of hoekpunt telt niet.
          if ((e.originalEvent.target as HTMLElement | null)?.tagName !== 'CANVAS') return;
          const point = { lat: e.lngLat.lat, lng: e.lngLat.lng };
          setBoundary((b) => ({ ...(b ?? {}), points: insertPoint(b?.points ?? [], point) }));
          setBoundaryDirty(true);
        });
        setReady((n) => n + 1);
      });
      map.current = m;
    });
    return () => {
      cancelled = true;
    };
  }, [game]);

  // Andere kaartstijl gekozen: stijl wisselen, daarna de eigen lagen er weer op.
  useEffect(() => {
    const m = map.current;
    const url = mapSource?.styleUrl ?? fallbackStyle;
    if (!m || !ready || shownStyle.current === url) return;
    shownStyle.current = url;
    m.setStyle(url, { diff: false });
    m.once('style.load', () => {
      addLayers(m);
      setReady((n) => n + 1);
    });
  }, [mapSource, ready, fallbackStyle]);

  // Oude overlay-afbeelding tonen, of weghalen.
  useEffect(() => {
    const m = map.current;
    if (!m || !ready) return;
    const url = overlay && /^https?:/.test(overlay.image) ? overlay.image : null;
    const source = m.getSource('overlay') as ImageSource | undefined;
    if (!url) {
      if (m.getLayer('overlay')) m.removeLayer('overlay');
      if (source) m.removeSource('overlay');
      return;
    }
    if (source) return;
    // Onder alles, zodat de pinnen erboven te slepen blijven.
    const below = m.getLayer('outside') ? 'outside' : undefined;
    m.addSource('overlay', { type: 'image', url, coordinates: imageCorners(overlay!.bounds) });
    m.addLayer({ id: 'overlay', type: 'raster', source: 'overlay', paint: { 'raster-opacity': 0.85 } }, below);
    m.setLayoutProperty('overlay', 'visibility', showOverlay ? 'visible' : 'none');
  }, [overlay, ready, showOverlay]);

  // Cirkel om het verzamelpunt: daarbinnen is een team er.
  const drawMeetingCircle = useCallback(
    (at: LatLng | null) => {
      const data = circlesGeoJson(at ? [{ ...at, radius: meetingRadius, color: '#ea580c' }] : []);
      (map.current?.getSource('meeting-radius') as GeoJSONSource | undefined)?.setData(data as never);
    },
    [meetingRadius],
  );
  useEffect(() => {
    if (ready) drawMeetingCircle(meeting);
  }, [drawMeetingCircle, meeting, ready]);

  // Verzamelpunt als versleepbare markering.
  const canMeeting = chain ? gameFieldEditable(chain, 'meetingPoint') : false;
  useEffect(() => {
    const m = map.current;
    if (!m || !ready) return;
    void loadMaplibre().then(({ Marker: MarkerClass }) => {
      meetingMarker.current?.remove();
      meetingMarker.current = null;
      if (!meeting) return;
      const el = document.createElement('div');
      el.className = `pin meeting${canMeeting ? ' editable' : ''}`;
      el.title = t('Verzamelpunt');
      const marker = new MarkerClass({ element: el, draggable: canMeeting }).setLngLat([meeting.lng, meeting.lat]).addTo(m);
      marker.on('drag', () => drawMeetingCircle(marker.getLngLat()));
      marker.on('dragend', () => {
        const { lat, lng } = marker.getLngLat();
        setMeeting({ lat: round(lat), lng: round(lng) });
        touchField('meetingPoint');
      });
      meetingMarker.current = marker;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meeting, ready, canMeeting, drawMeetingCircle, t]);

  function addLayers(m: MlMap) {
        // Grijze (of gekleurde) laag over alles buiten het speelveld.
        m.addSource('outside', { type: 'geojson', data: boundaryMaskGeoJson(null) });
        m.addLayer({ id: 'outside', type: 'fill', source: 'outside', paint: { 'fill-color': outsideShade(null).color, 'fill-opacity': 0 } });
        m.addSource('radius', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
        m.addLayer({ id: 'radius-fill', type: 'fill', source: 'radius', paint: { 'fill-color': ['get', 'color'], 'fill-opacity': 0.15 } });
        m.addLayer({ id: 'radius-line', type: 'line', source: 'radius', paint: { 'line-color': ['get', 'color'], 'line-width': 1.5 } });
        m.addSource('boundary', { type: 'geojson', data: boundaryGeoJson(null) });
        m.addLayer({
          id: 'boundary',
          type: 'line',
          source: 'boundary',
          layout: { 'line-join': 'round' },
          paint: { 'line-color': DEFAULT_BOUNDARY_COLOR, 'line-width': 3 },
        });
        m.addSource('meeting-radius', { type: 'geojson', data: circlesGeoJson([]) as never });
        m.addLayer({ id: 'meeting-radius-fill', type: 'fill', source: 'meeting-radius', paint: { 'fill-color': ['get', 'color'], 'fill-opacity': 0.15 } });
        m.addLayer({ id: 'meeting-radius-line', type: 'line', source: 'meeting-radius', paint: { 'line-color': ['get', 'color'], 'line-width': 2 } });
  }

  const touchField = (field: SettingField) => setFieldsDirty((d) => new Set(d).add(field));

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
        el.className = `pin${pin.editable ? ' editable' : ''}${pin.logo ? ' logo' : ''}${pin.flag ? ' flag' : ''}${pinKey(pin) === selected ? ' selected' : ''}`;
        el.title = `${pin.title} (${trackName(pin.track)})`;
        if (pin.editable) el.style.backgroundColor = trackColor(pin.track);
        if (pin.flag) el.textContent = `🏁${pin.label}`;
        else if (!pin.logo) el.textContent = pin.label;
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
  }, [pins, ready, selected, t]);

  // Grens tekenen, met versleepbare hoekpunten in tekenmodus.
  useEffect(() => {
    drawingRef.current = drawing;
    const m = map.current;
    if (!m || !ready) return;
    (m.getSource('boundary') as GeoJSONSource | undefined)?.setData(boundaryGeoJson(boundary) as never);
    if (m.getLayer('boundary')) m.setPaintProperty('boundary', 'line-color', boundary?.color ?? gs.boundary_color);
    (m.getSource('outside') as GeoJSONSource | undefined)?.setData(boundaryMaskGeoJson(boundary) as never);
    if (m.getLayer('outside')) {
      const shade = shadeOf(boundary);
      m.setPaintProperty('outside', 'fill-color', shade.color);
      m.setPaintProperty('outside', 'fill-opacity', shade.opacity);
      // Tijdens het tekenen weg, zodat je de hele kaart ziet.
      m.setLayoutProperty('outside', 'visibility', showOverlay && !drawing ? 'visible' : 'none');
    }
    m.getCanvas().style.cursor = drawing ? 'crosshair' : '';
    for (const layer of ['overlay', 'boundary']) {
      if (m.getLayer(layer)) m.setLayoutProperty(layer, 'visibility', showOverlay || (layer === 'boundary' && drawing) ? 'visible' : 'none');
    }
    void loadMaplibre().then(({ Marker: MarkerClass }) => {
      for (const v of vertexMarkers.current) v.remove();
      vertexMarkers.current = [];
      if (!drawing || !boundary) return;
      boundary.points.forEach((pt, i) => {
        const el = document.createElement('div');
        el.className = 'vertex';
        el.title = t('Sleep om te verplaatsen, rechtsklik om weg te halen');
        el.addEventListener('contextmenu', (ev) => {
          ev.preventDefault();
          ev.stopPropagation();
          setBoundary((b) => (b ? { ...b, points: removePoint(b.points, i) } : b));
          setBoundaryDirty(true);
        });
        el.addEventListener('click', (ev) => ev.stopPropagation());
        const marker = new MarkerClass({ element: el, draggable: true }).setLngLat([pt.lng, pt.lat]).addTo(m);
        marker.on('dragend', () => {
          const { lat, lng } = marker.getLngLat();
          setBoundary((b) => (b ? { ...b, points: movePoint(b.points, i, { lat, lng }) } : b));
          setBoundaryDirty(true);
        });
        vertexMarkers.current.push(marker);
      });
      // Handvat midden op elke zijde: slepen maakt er een bocht van, dubbelklikken weer recht.
      const sides = boundary.points.length >= 3 ? boundary.points.length : boundary.points.length - 1;
      for (let i = 0; i < sides; i++) {
        const h = segmentHandle(boundary.points, i);
        const el = document.createElement('div');
        el.className = `bend${boundary.points[i]!.curve ? ' curved' : ''}`;
        el.title = t('Sleep voor een bocht; dubbelklik om de lijn weer recht te maken');
        el.addEventListener('click', (ev) => ev.stopPropagation());
        el.addEventListener('dblclick', (ev) => {
          ev.preventDefault();
          ev.stopPropagation();
          setBoundary((b) => (b ? { ...b, points: straightenSegment(b.points, i) } : b));
          setBoundaryDirty(true);
        });
        const marker = new MarkerClass({ element: el, draggable: true }).setLngLat([h.lng, h.lat]).addTo(m);
        marker.on('drag', () => {
          // Tijdens het slepen de lijn live laten meebuigen.
          const { lat, lng } = marker.getLngLat();
          const preview = { ...boundary, points: bendSegment(boundary.points, i, { lat, lng }) };
          (m.getSource('boundary') as GeoJSONSource | undefined)?.setData(boundaryGeoJson(preview) as never);
        });
        marker.on('dragend', () => {
          const { lat, lng } = marker.getLngLat();
          setBoundary((b) => (b ? { ...b, points: bendSegment(b.points, i, { lat, lng }) } : b));
          setBoundaryDirty(true);
        });
        vertexMarkers.current.push(marker);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boundary, drawing, ready, showOverlay, t, gs]);

  if (!chain || !game) return errors.length ? <ul className="errors">{errors.map((e, i) => <li key={i}>{e}</li>)}</ul> : <p className="muted">{t('Laden…')}</p>;

  const self = chain[chain.length - 1]!;
  const tracks = trackCount(game);
  const current = pins.find((p) => pinKey(p) === selected) ?? null;
  const isBase = self.game.layer === 'base';
  const dirty = Object.keys(changes).length + (boundaryDirty ? 1 : 0) + fieldsDirty.size + (allowedDirty ? 1 : 0);
  const canBoundary = gameFieldEditable(chain, 'boundary');
  const canStyle = gameFieldEditable(chain, 'map');
  const canOverlay = gameFieldEditable(chain, 'mapOverlay');
  const mapCenter = () => {
    const c = map.current?.getCenter();
    return c ? { lat: round(c.lat), lng: round(c.lng) } : null;
  };
  const allLocations = (): LatLng[] =>
    game.tasks.flatMap((tk) => [tk.location, ...Object.values(tk.trackLocations ?? {})]).filter((l): l is TaskLocation => !!l);
  const editBoundary = (points: LatLng[]) => {
    setBoundary(points.length ? { ...(boundary ?? {}), points } : null);
    setBoundaryDirty(true);
  };

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
    const idByKey = new Map(chain[0]!.tasks.map((tk) => [tk.key, tk.id]));
    const must = (r: { error: { message: string } | null }) => {
      if (r.error) throw new Error(r.error.message);
    };
    try {
      if (boundaryDirty && boundary && boundary.points.length < 3) throw new Error(t('De speelveldgrens heeft minstens 3 punten nodig, of wis hem helemaal.'));
      // Velden van het spel zelf: in het basisspel in de instellingen, in een variant als aanpassing.
      const values: Partial<Record<MapGameField, unknown>> = {};
      if (boundaryDirty) values.boundary = boundary && boundary.points.length ? boundary : null;
      if (fieldsDirty.has('map')) values.map = mapSource;
      if (fieldsDirty.has('mapOverlay')) values.mapOverlay = overlay;
      if (fieldsDirty.has('meetingPoint')) {
        values.meetingPoint = meeting ? { ...meeting, radius: meetingRadius, ...(isBase ? {} : { text: cleanText(meetingText) }) } : null;
      }
      if (isBase) {
        if (Object.keys(values).length) {
          const settings: Record<string, unknown> = { ...self.game.settings };
          for (const [field, value] of Object.entries(values)) {
            if (value) settings[field] = value;
            else delete settings[field];
          }
          must(await db.from('games').update({ settings }).eq('id', id));
        }
        if (fieldsDirty.has('meetingPoint')) {
          must(await db.from('translations').delete().eq('game_id', id).eq('entity', 'game').eq('entity_id', '').eq('field', 'meetingPoint'));
          const rows = meeting ? textRows(meetingText) : [];
          if (rows.length) must(await db.from('translations').insert(rows.map((r) => ({ ...r, game_id: id }))));
        }
        if (allowedDirty) {
          for (const [field, layers] of Object.entries(allowed)) {
            must(await db.from('overridable_fields').delete().eq('game_id', id).is('task_id', null).eq('field', field));
            if (layers.length) must(await db.from('overridable_fields').insert({ game_id: id, task_id: null, field, layers }));
          }
        }
      } else {
        for (const [field, value] of Object.entries(values)) {
          must(await db.from('overrides').delete().eq('game_id', id).is('task_id', null).eq('field', field));
          if (value) must(await db.from('overrides').insert({ game_id: id, task_id: null, field, value }));
        }
      }
      for (const [k, loc] of Object.entries(changes)) {
        const [taskKey, trackText] = k.split('|');
        const taskId = idByKey.get(taskKey!)!;
        const tk = trackText === '' ? null : Number(trackText);
        let del = db.from('task_locations').delete().eq('game_id', id).eq('task_id', taskId);
        del = tk === null ? del.is('track', null) : del.eq('track', tk);
        const d = await del;
        if (d.error) throw new Error(d.error.message);
        const ins = await db.from('task_locations').insert({ game_id: id, task_id: taskId, track: tk, ...loc });
        if (ins.error) throw new Error(ins.error.message);
      }
      setNotice(isBase ? t('Opgeslagen in de template. Steden krijgen dit pas als je bij Templateversies "Opslaan als nieuwe versie" kiest en de steden overzet.') : t('Opgeslagen. Publiceer het spel om het in de app te gebruiken.'));
      setDrawing(false);
      await load();
    } catch (err) {
      setErrors([err instanceof Error ? err.message : String(err)]);
    } finally {
      setBusy(false);
    }
  };

  const makePreview = async () => {
    if (!boundary) return;
    setPreviewBusy(true);
    setErrors([]);
    try {
      const { styleUrl, attribution } = playfieldStyle({ map: mapSource ?? undefined });
      const blob = await renderPlayfieldImage(await loadMaplibre(), boundary, styleUrl, attribution);
      setPreview((old) => {
        if (old) URL.revokeObjectURL(old);
        return URL.createObjectURL(blob);
      });
    } catch (err) {
      setErrors([err instanceof Error ? err.message : String(err)]);
    } finally {
      setPreviewBusy(false);
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
        <Link href="/spellen">{t('Spellen')}</Link> › <Link href={`/spellen/${id}`}>{self.game.slug}</Link> › {t('Kaart')}
      </p>
      <h1>{t('Locaties op de kaart')}</h1>
      <GameNav id={id} layer={self.game.layer} active="kaart" />
      <p className="muted">
        {t('Sleep een pin naar de juiste plek. Elke track heeft een eigen kleur; oranje is een vaste locatie voor alle tracks. Grijze pinnen mogen hier niet worden aangepast.')}{' '}
        {self.game.layer === 'client' ? t('Een klantvariant past geen locaties aan.') : ''}
      </p>
      <div className="row" style={{ alignItems: 'center' }}>
        <div style={{ flex: '0 1 260px' }}>
          <label htmlFor="track">{t('Toon')}</label>
          <select
            id="track"
            value={view === 'all' ? 'all' : (view ?? '')}
            onChange={(e) => setView(e.target.value === 'all' ? 'all' : e.target.value === '' ? null : Number(e.target.value))}
          >
            <option value="all">{t('Alles op één kaart')}</option>
            <option value="">{t('Vaste locaties (alle tracks)')}</option>
            {Array.from({ length: tracks }, (_, i) => (
              <option key={i + 1} value={i + 1}>
                {t('Track {n}', { n: i + 1 })}
              </option>
            ))}
          </select>
        </div>
        {canStyle ? (
          <div style={{ flex: '0 1 220px' }}>
            <label htmlFor="style">{t('Kaartstijl')}</label>
            <select
              id="style"
              value={MAP_STYLES.find((s) => s.source.styleUrl === (mapSource?.styleUrl ?? fallbackStyle))?.id ?? 'eigen'}
              onChange={(e) => {
                const style = MAP_STYLES.find((s) => s.id === e.target.value);
                if (!style) return;
                setMapSource(style.id === gs.map_style ? null : style.source);
                touchField('map');
              }}
            >
              {MAP_STYLES.map((s) => (
                <option key={s.id} value={s.id}>
                  {t(s.name)}
                </option>
              ))}
              {mapSource && !MAP_STYLES.some((s) => s.source.styleUrl === mapSource.styleUrl) ? <option value="eigen">{t('Eigen stijl')}</option> : null}
            </select>
            {!isBase && ownGameField(chain, 'map') ? (
              <button className="link" onClick={() => void reset('map')} disabled={busy}>
                {t('Terug naar kaartstijl van de laag erboven')}
              </button>
            ) : null}
          </div>
        ) : null}
        <label className="check" style={{ flex: '0 1 auto', margin: 0 }}>
          <input type="checkbox" checked={showOverlay} onChange={(e) => setShowOverlay(e.target.checked)} />
          {t('Speelveldgrens tonen')}
        </label>
        <div className="actions" style={{ flex: '1 1 auto', justifyContent: 'flex-end' }}>
          <button onClick={() => void save()} disabled={busy || dirty === 0}>
            {busy ? t('Bezig…') : dirty ? t('Opslaan ({n})', { n: dirty }) : t('Opgeslagen')}
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
                  <label htmlFor="r">{t('Straal (m)')}</label>
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
                <p className="muted">{t('Nog geen locatie voor {track}.', { track: trackName(current.track) })}</p>
              )}
              {current.editable ? (
                <div className="actions">
                  <button className="secondary" onClick={() => place(current)}>
                    {t('Naar midden van de kaart')}
                  </button>
                </div>
              ) : (
                <p className="muted">{t('Niet aan te passen in deze laag.')}</p>
              )}
            </>
          ) : (
            <p className="muted">{t('Klik op een pin of kies een opdracht hieronder.')}</p>
          )}
          <h2>{t('Speelveldgrens')}</h2>
          <p className="muted small">
            {t('De rode lijn om het gebied waar teams spelen.')}{' '}
            {boundary ? t('{n} punten.', { n: boundary.points.length }) : t('Nog geen grens.')}
          </p>
          {canBoundary ? (
            <>
              {drawing ? (
                <p className="muted small">
                  {t('Klik op de kaart om een punt toe te voegen. Sleep een punt om het te verplaatsen; rechtsklik om het weg te halen. Sleep het kleine handvat midden op een lijn voor een bocht; dubbelklik het handvat om de lijn weer recht te maken.')}
                </p>
              ) : null}
              <div className="actions">
                <button className={drawing ? '' : 'secondary'} onClick={() => setDrawing(!drawing)}>
                  {drawing ? t('Klaar met tekenen') : boundary ? t('Grens bewerken') : t('Grens tekenen')}
                </button>
                {!boundary ? (
                  <button className="secondary" onClick={() => { editBoundary(rectAround(allLocations())); setDrawing(true); }}>
                    {t('Rechthoek om alle locaties')}
                  </button>
                ) : null}
                {boundary ? (
                  <button className="link" onClick={() => { if (window.confirm(t('Speelveldgrens wissen?'))) editBoundary([]); }}>
                    {t('Wissen')}
                  </button>
                ) : null}
              </div>
              {boundary ? (
                <label className="check">
                  {t('Kleur')}{' '}
                  <input
                    type="color"
                    value={boundary.color ?? gs.boundary_color}
                    onChange={(e) => {
                      setBoundary({ ...boundary, color: e.target.value });
                      setBoundaryDirty(true);
                    }}
                  />
                </label>
              ) : null}
              {boundary ? (
                <>
                  <p className="muted small">{t('Buiten het speelveld')}</p>
                  <label className="check">
                    {t('Kleur')}{' '}
                    <input
                      type="color"
                      value={shadeOf(boundary).color}
                      onChange={(e) => {
                        setBoundary({ ...boundary, outsideColor: e.target.value });
                        setBoundaryDirty(true);
                      }}
                    />
                  </label>
                  <label className="check">
                    {t('Dekking')}{' '}
                    <input
                      type="range"
                      min={0}
                      max={90}
                      step={5}
                      value={Math.round(shadeOf(boundary).opacity * 100)}
                      onChange={(e) => {
                        setBoundary({ ...boundary, outsideOpacity: Number(e.target.value) / 100 });
                        setBoundaryDirty(true);
                      }}
                    />{' '}
                    {Math.round(shadeOf(boundary).opacity * 100)}%
                  </label>
                </>
              ) : null}
            </>
          ) : (
            <p className="muted small">{t('Niet aan te passen in deze laag.')}</p>
          )}
          {boundary && boundary.points.length >= 3 ? (
            <>
              <p className="muted small">
                {t('Bij publiceren wordt van het speelveld een kaartje gemaakt. Dat staat als foto bij de uitleg “Speelveld” (en elke opdracht met “Kaartje van het speelveld tonen”).')}
              </p>
              <div className="actions">
                <button className="secondary" disabled={previewBusy} onClick={() => void makePreview()}>
                  {previewBusy ? t('Bezig…') : t('Voorbeeld van het kaartje')}
                </button>
              </div>
              {preview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={preview} alt={t('Kaartje van het speelveld')} style={{ width: '100%', border: '1px solid #ddd', borderRadius: 6 }} />
              ) : null}
            </>
          ) : null}
          <h2>{t('Verzamelpunt')}</h2>
          <p className="muted small">{t('Waar teams aan het begin en einde samenkomen. Sleep het oranje icoon om het te verplaatsen.')}</p>
          {!canMeeting ? (
            <p className="muted small">{t('Het verzamelpunt is in deze laag niet aan te passen.')}</p>
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
                    const c = mapCenter();
                    if (!c) return;
                    setMeeting(c);
                    touchField('meetingPoint');
                  }}
                >
                  {meeting ? t('Naar midden van de kaart') : t('Plaatsen in het midden van de kaart')}
                </button>
                {meeting ? (
                  <button
                    className="link"
                    onClick={() => {
                      setMeeting(null);
                      touchField('meetingPoint');
                    }}
                  >
                    {t('Weghalen')}
                  </button>
                ) : null}
              </div>
              {meeting ? (
                <div>
                  <label htmlFor="mp-radius">{t('Straal van de cirkel (meter)')}</label>
                  <input
                    id="mp-radius"
                    type="number"
                    min={1}
                    max={1000}
                    value={meetingRadius}
                    onChange={(e) => {
                      const r = Math.round(Number(e.target.value));
                      if (!(r > 0 && r <= 1000)) return;
                      setMeetingRadius(r);
                      touchField('meetingPoint');
                    }}
                  />
                  <p className="muted small">{t('Binnen deze cirkel is een team bij het verzamelpunt.')}</p>
                </div>
              ) : null}
              {meeting
                ? game.languages.map((lang) => (
                    <div key={lang}>
                      <label htmlFor={`mp-${lang}`}>{t('Omschrijving ({lang})', { lang: gameLanguageShort(lang) })}</label>
                      <input
                        id={`mp-${lang}`}
                        value={meetingText[lang] ?? ''}
                        placeholder={lang === 'nl' ? 'Bij de ingang van de Oldehove' : ''}
                        onChange={(e) => {
                          setMeetingText({ ...meetingText, [lang]: e.target.value });
                          touchField('meetingPoint');
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
          {overlay && canOverlay ? (
            <>
              <h2>{t('Oude overlay')}</h2>
              <p className="muted small">{t('Dit spel heeft nog een kaartafbeelding van vroeger. Teken het speelveld liever op de kaart; deze afbeelding kun je weghalen.')}</p>
              <button
                className="link"
                onClick={() => {
                  setOverlay(null);
                  touchField('mapOverlay');
                }}
              >
                {t('Weghalen')}
              </button>
            </>
          ) : null}
          <h2>{t('Opdrachten')}</h2>
          {view === 'all' ? (
            <p className="muted">{t('Opdrachten zonder locatie plaats je door hierboven één track of de vaste locaties te kiezen.')}</p>
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
                  {p.location ? '' : <span className="muted">{t('(geen locatie)')}</span>}
                  {changes[pinKey(p)] ? <span className="badge test">{t('gewijzigd')}</span> : null}
                </li>
              ))}
          </ul>
          {isBase ? (
            <>
              <h2>{t('Aanpassen in varianten')}</h2>
              <p className="muted small">{t('Mag een stad of klant hier een eigen versie van maken?')}</p>
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

function round(n: number) {
  return Math.round(n * 1e6) / 1e6;
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
