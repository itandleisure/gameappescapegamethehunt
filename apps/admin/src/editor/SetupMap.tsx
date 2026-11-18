'use client';
import { DEFAULT_BOUNDARY_COLOR, DEFAULT_MAP_SOURCE, outsideShade, type LatLng, type PlayBoundary } from '@hunt/engine';
import type { GeoJSONSource, Map as MlMap, MapMouseEvent, Marker } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useEffect, useRef, useState } from 'react';
import { boundaryGeoJson, boundaryMaskGeoJson, insertPoint, movePoint, removePoint } from '@/lib/boundary';
import { useT } from '@/lib/language';
import { circle } from '@/lib/map-edit';
import { loadMaplibre } from '@/lib/maplibre';

export interface SetupMarker {
  key: string;
  lat: number;
  lng: number;
  /** Extra CSS-klassen naast "pin", bijvoorbeeld "flag", "logo" of "meeting". */
  className: string;
  text?: string;
  color?: string;
  title: string;
  draggable?: boolean;
  /** Straal in meters, als cirkel om het icoon. */
  radius?: number;
}

interface Props {
  styleUrl?: string;
  /** Punten waar de kaart bij het openen omheen past. */
  fit: LatLng[];
  boundary: PlayBoundary | null;
  /** Gegeven = tekenmodus: klikken voegt een punt toe, hoekpunten zijn te slepen. */
  onBoundary?: (points: PlayBoundary['points']) => void;
  markers: SetupMarker[];
  onMove?: (key: string, to: LatLng) => void;
  /** Klik op de kaart (niet op een icoon), bijvoorbeeld om een plek aan te wijzen. */
  onPick?: (at: LatLng) => void;
}

/** Kaart voor het stappenplan "Stad inrichten". */
export function SetupMap({ styleUrl, fit, boundary, onBoundary, markers, onMove, onPick }: Props) {
  const t = useT();
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<MlMap | null>(null);
  const [ready, setReady] = useState(false);
  const pinMarkers = useRef<Marker[]>([]);
  const vertexMarkers = useRef<Marker[]>([]);
  // De laatste callbacks, zodat de kliklijst van de kaart niet steeds opnieuw hoeft.
  const handlers = useRef({ onBoundary, onPick, boundary });
  handlers.current = { onBoundary, onPick, boundary };

  useEffect(() => {
    if (!container.current || map.current) return;
    let cancelled = false;
    let observer: ResizeObserver | null = null;
    void loadMaplibre().then(({ Map }) => {
      if (cancelled || !container.current) return;
      const first = fit[0] ?? { lat: 52.37, lng: 4.89 };
      const m = new Map({ container: container.current, style: styleUrl ?? DEFAULT_MAP_SOURCE.styleUrl, center: [first.lng, first.lat], zoom: 15 });
      m.on('load', () => {
        if (fit.length > 1) {
          const lats = fit.map((p) => p.lat);
          const lngs = fit.map((p) => p.lng);
          m.fitBounds([[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]], { padding: 60, maxZoom: 17, duration: 0 });
        }
        m.addSource('outside', { type: 'geojson', data: boundaryMaskGeoJson(null) });
        m.addLayer({ id: 'outside', type: 'fill', source: 'outside', paint: { 'fill-color': outsideShade(null).color, 'fill-opacity': 0 } });
        m.addSource('radius', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
        m.addLayer({ id: 'radius-fill', type: 'fill', source: 'radius', paint: { 'fill-color': ['get', 'color'], 'fill-opacity': 0.15 } });
        m.addLayer({ id: 'radius-line', type: 'line', source: 'radius', paint: { 'line-color': ['get', 'color'], 'line-width': 1.5 } });
        m.addSource('boundary', { type: 'geojson', data: boundaryGeoJson(null) });
        m.addLayer({ id: 'boundary', type: 'line', source: 'boundary', layout: { 'line-join': 'round' }, paint: { 'line-color': DEFAULT_BOUNDARY_COLOR, 'line-width': 3 } });
        m.on('click', (e: MapMouseEvent) => {
          if ((e.originalEvent.target as HTMLElement | null)?.tagName !== 'CANVAS') return;
          const at = { lat: e.lngLat.lat, lng: e.lngLat.lng };
          const h = handlers.current;
          if (h.onBoundary) {
            const points = insertPoint(h.boundary?.points ?? [], at);
            // Meteen bijwerken: snel na elkaar klikken mag geen punt kwijtraken.
            h.boundary = { ...(h.boundary ?? {}), points };
            h.onBoundary(points);
          } else h.onPick?.(at);
        });
        setReady(true);
      });
      map.current = m;
      // De kaart volgt de grootte van zijn vak, ook als die pas na het laden vastligt.
      observer = new ResizeObserver(() => m.resize());
      observer.observe(container.current);
    });
    return () => {
      cancelled = true;
      observer?.disconnect();
      map.current?.remove();
      map.current = null;
    };
    // De kaart wordt één keer gemaakt; fit en stijl gelden alleen bij het openen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Speelveld en hoekpunten.
  useEffect(() => {
    const m = map.current;
    if (!m || !ready) return;
    const drawing = Boolean(onBoundary);
    (m.getSource('boundary') as GeoJSONSource | undefined)?.setData(boundaryGeoJson(boundary) as never);
    m.setPaintProperty('boundary', 'line-color', boundary?.color ?? DEFAULT_BOUNDARY_COLOR);
    (m.getSource('outside') as GeoJSONSource | undefined)?.setData(boundaryMaskGeoJson(boundary) as never);
    const shade = outsideShade(boundary);
    m.setPaintProperty('outside', 'fill-color', shade.color);
    m.setPaintProperty('outside', 'fill-opacity', drawing ? 0 : shade.opacity);
    m.getCanvas().style.cursor = drawing || onPick ? 'crosshair' : '';
    void loadMaplibre().then(({ Marker: MarkerClass }) => {
      for (const v of vertexMarkers.current) v.remove();
      vertexMarkers.current = [];
      if (!onBoundary || !boundary) return;
      boundary.points.forEach((pt, i) => {
        const el = document.createElement('div');
        el.className = 'vertex';
        el.title = t('Sleep om te verplaatsen, rechtsklik om weg te halen');
        el.addEventListener('contextmenu', (ev) => {
          ev.preventDefault();
          ev.stopPropagation();
          onBoundary(removePoint(boundary.points, i));
        });
        el.addEventListener('click', (ev) => ev.stopPropagation());
        const marker = new MarkerClass({ element: el, draggable: true }).setLngLat([pt.lng, pt.lat]).addTo(m);
        marker.on('dragend', () => {
          const { lat, lng } = marker.getLngLat();
          onBoundary(movePoint(boundary.points, i, { lat, lng }));
        });
        vertexMarkers.current.push(marker);
      });
    });
  }, [boundary, onBoundary, onPick, ready, t]);

  // Iconen en hun cirkels.
  useEffect(() => {
    const m = map.current;
    if (!m || !ready) return;
    void loadMaplibre().then(({ Marker: MarkerClass }) => {
      for (const marker of pinMarkers.current) marker.remove();
      pinMarkers.current = [];
      for (const p of markers) {
        const el = document.createElement('div');
        el.className = `pin ${p.className}`;
        el.title = p.title;
        if (p.color) el.style.backgroundColor = p.color;
        if (p.text) el.textContent = p.text;
        el.addEventListener('click', (ev) => ev.stopPropagation());
        const marker = new MarkerClass({ element: el, draggable: Boolean(p.draggable && onMove) }).setLngLat([p.lng, p.lat]).addTo(m);
        marker.on('dragend', () => {
          const { lat, lng } = marker.getLngLat();
          onMove?.(p.key, { lat, lng });
        });
        pinMarkers.current.push(marker);
      }
      (m.getSource('radius') as GeoJSONSource | undefined)?.setData({
        type: 'FeatureCollection',
        features: markers
          .filter((p) => p.radius)
          .map((p) => ({
            type: 'Feature',
            properties: { color: p.color ?? '#ea580c' },
            geometry: { type: 'Polygon', coordinates: [circle(p.lat, p.lng, p.radius!)] },
          })),
      } as never);
    });
  }, [markers, onMove, ready]);

  return <div ref={container} className="map" />;
}
