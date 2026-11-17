import type { Bounds } from '../../core/play-area';

export interface MapMarker {
  id: string;
  lat: number;
  lng: number;
  label: string;
}

export interface MapOverlayImage {
  url: string;
  /** Noordwest en zuidoost. */
  nw: { lat: number; lng: number };
  se: { lat: number; lng: number };
}

export interface GameMapProps {
  styleUrl: string;
  bounds?: Bounds;
  markers: MapMarker[];
  overlay?: MapOverlayImage;
  /** Eigen positie (voor de webkaart; de native kaart toont hem zelf). */
  position?: { lat: number; lng: number; accuracy: number } | null;
}
