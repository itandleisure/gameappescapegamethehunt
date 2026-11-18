import type { Bounds } from '../../core/play-area';

export interface MapMarker {
  id: string;
  lat: number;
  lng: number;
  label: string;
  /** Rond icoon met dit nummer in plaats van een label met de titel. */
  badge?: string;
  /** Logo-icoon in deze kleur (de kleur van de track van het team). */
  logoColor?: string;
  /** Finishvlag met dit nummer (mag leeg zijn), zoals bij de extractiepunten. */
  flag?: string;
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
  /** Speelveldgrens: gesloten lijn om het speelgebied. */
  boundary?: {
    points: { lat: number; lng: number }[];
    color: string;
    /** Laag over alles buiten de grens; dekking 0 = geen laag. */
    outside: { color: string; opacity: number };
  };
  /** Eigen positie (voor de webkaart; de native kaart toont hem zelf). */
  position?: { lat: number; lng: number; accuracy: number } | null;
}
