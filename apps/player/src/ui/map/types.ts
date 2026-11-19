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
  /** Persoon op de kaart (team of spelleider): gekleurde stip met de naam ernaast. */
  person?: { color: string; ring?: string; stale?: boolean };
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
  /** Cirkels op de kaart, bijvoorbeeld om het verzamelpunt. */
  circles?: { lat: number; lng: number; radius: number; color: string }[];
  /**
   * Houd deze punten in beeld (bijvoorbeeld de eigen positie en het
   * verzamelpunt). De kaart schuift mee tot de speler hem zelf verschuift.
   */
  follow?: { lat: number; lng: number }[];
  /** Stippellijn, bijvoorbeeld hemelsbreed van de eigen positie naar het verzamelpunt. */
  line?: { from: { lat: number; lng: number }; to: { lat: number; lng: number }; color: string };
  /** Eigen positie (voor de webkaart; de native kaart toont hem zelf). */
  position?: { lat: number; lng: number; accuracy: number } | null;
}
