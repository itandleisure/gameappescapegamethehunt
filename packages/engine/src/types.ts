/**
 * Gedeelde datatypes voor speler-app, beheeromgeving en server.
 *
 * Een *gepubliceerd spelpakket* (`GamePackage`) is het resultaat van het
 * samenvoegen van de lagen basisspel + stadsvariant + klantvariant (zie
 * `layers.ts`). Een sessie speelt altijd één vaste versie daarvan.
 */

/** Taalcode, bijvoorbeeld `nl` of `en`. */
export type Lang = string;

/** Vertaalbare tekst: één waarde per taal. */
export type Text = Partial<Record<Lang, string>>;

export interface LatLng {
  lat: number;
  lng: number;
}

export interface TaskLocation extends LatLng {
  /** Activatiestraal in meters. */
  radius: number;
}

// ---------------------------------------------------------------------------
// Antwoorden
// ---------------------------------------------------------------------------

export type AnswerSpec =
  /** Alleen lezen en op OK drukken (verhaal, uitleg). */
  | { type: 'info' }
  /** Eén juiste optie kiezen. `correct` is de index in `options`. */
  | { type: 'choice'; options: Text[]; correct: number }
  /** Meerdere juiste opties aanvinken; precies deze set is goed. */
  | { type: 'multi'; options: Text[]; correct: number[] }
  /**
   * Vrij tekstantwoord. Vergeleken zonder hoofdletters, spaties en accenten.
   * Goede antwoorden gelden voor alle talen samen.
   */
  | { type: 'text'; accepted: string[] }
  /** Getal, optioneel met marge. */
  | { type: 'number'; value: number; tolerance?: number }
  /** Foto uploaden; telt altijd als goed. */
  | { type: 'photo' }
  /**
   * Korte video filmen (met geluid); telt altijd als goed. Optioneel
   * opdrachttype: alleen spellen die het kiezen gebruiken het (The Hunt niet).
   * `maxSeconds` is de maximale lengte, standaard 30 (zie `videoSeconds`).
   */
  | { type: 'video'; maxSeconds?: number };

export type AnswerValue =
  | { type: 'info' }
  | { type: 'choice'; option: number }
  | { type: 'multi'; options: number[] }
  | { type: 'text'; text: string }
  | { type: 'number'; value: number | string }
  | { type: 'photo'; photoId: string }
  | { type: 'video'; videoId: string };

// ---------------------------------------------------------------------------
// Opdrachten
// ---------------------------------------------------------------------------

export interface Hint {
  text: Text;
  /** Puntaftrek als positief getal, bijvoorbeeld 25. */
  cost: number;
  /** Optionele afbeelding bij de hint: absolute https-URL. */
  image?: string;
}

export interface Task {
  id: string;
  title: Text;
  body: Text;
  /** Ondersteunende foto bij de tekst: absolute https-URL (PNG, JPG of WebP). */
  image?: string;
  /**
   * Toon als foto een kaartje van het getekende speelveld (kaart met de grens
   * erop), zoals bij het uitlegscherm "Speelveld". De beheeromgeving maakt dat
   * kaartje per stad bij het publiceren en zet het in `image`. Zonder getekend
   * speelveld blijft de gewone foto staan.
   */
  playfieldImage?: boolean;
  /**
   * Toon als foto een vaste tekening van de beheeromgeving, bijvoorbeeld
   * 'extractiepunt' bij het uitlegscherm "Extractiepunt". De beheeromgeving zet
   * die bij het publiceren in `image`.
   */
  illustration?: string;
  /** Kort nummer of teken in het kaarticoon (bijvoorbeeld 1, 2, 3) in plaats van de titel. */
  mapLabel?: string;
  /**
   * Kaarticoon: 'logo' = het Escape Game The Hunt-logo in de kleur van de track
   * (zoals bij de bonusvragen); 'flag' = finishvlag, met mapLabel als nummer
   * (zoals bij de extractiepunten).
   */
  mapIcon?: MapIcon;
  answer: AnswerSpec;
  /** Punten bij een goed (of afgerond) antwoord. */
  points: number;
  /** Punten per fout antwoord (meestal 0 of negatief). */
  wrongPoints?: number;
  tags: string[];
  /** Hints met oplopende prijs; gaan vanzelf uit zodra de opdracht goed is. */
  hints: Hint[];
  /** Bevestigingsvraag voordat de opdracht opent ("Weten jullie zeker…?"). */
  confirm?: Text;
  /** Fout antwoord laat de opdracht openstaan tot hij goed is. */
  retryUntilCorrect?: boolean;
  /** Vaste locatie (voor alle tracks gelijk). */
  location?: TaskLocation;
  /** Locatie per tracknummer; gaat voor `location`. */
  trackLocations?: Record<number, TaskLocation>;
  correctComment?: Text;
  wrongComment?: Text;
}

// ---------------------------------------------------------------------------
// Regels: "wanneer [voorwaarde] dan [actie]"
// ---------------------------------------------------------------------------

/** Welke opdrachten een voorwaarde of actie betreft. */
export type Selector =
  | { task: string }
  | { tasks: string[] }
  | { tag: string }
  | { all: true };

export type Comparison = '>=' | '>' | '<=' | '<' | '==';

export type Condition =
  /** Opdracht(en) afgerond (goed of fout). */
  | { kind: 'completed'; select: Selector; match?: 'all' | 'any' }
  | { kind: 'correct'; select: Selector; match?: 'all' | 'any' }
  /** Definitief fout beantwoord. */
  | { kind: 'incorrect'; select: Selector; match?: 'all' | 'any' }
  /** Speeltijd (sinds start van het team) is minstens x minuten. */
  | { kind: 'elapsed'; minutes: number }
  /** Minstens x seconden geleden dat de opdracht is afgerond. */
  | { kind: 'afterCompleted'; task: string; seconds: number }
  | { kind: 'score'; op: Comparison; value: number }
  | { kind: 'onTrack'; track: number }
  | { kind: 'and'; conditions: Condition[] }
  | { kind: 'or'; conditions: Condition[] }
  | { kind: 'not'; condition: Condition };

export type Placement = 'map' | 'list' | { playground: string };

export type Action =
  | { kind: 'show'; select: Selector; on: Placement }
  /** Direct openen als pop-up (zonder locatie). */
  | { kind: 'open'; task: string }
  | { kind: 'deactivate'; select: Selector }
  | { kind: 'award'; points: number; reason?: string }
  | { kind: 'message'; text: Text }
  /** Start een reeks schermen die na elkaar openen. */
  | { kind: 'startSequence'; sequence: string }
  | { kind: 'end'; ending: string }
  /**
   * Punten niet meer tonen aan het team, voor de spanning in de laatste fase
   * (zoals "na 60 minuten" in Loquiz). De spelleiding ziet ze gewoon.
   */
  | { kind: 'hideScore' };

export interface Rule {
  id: string;
  /** Korte omschrijving voor de beheeromgeving. */
  label?: string;
  when: Condition;
  then: Action[];
}

// ---------------------------------------------------------------------------
// Spelpakket
// ---------------------------------------------------------------------------

export interface Sequence {
  id: string;
  tasks: string[];
}

export interface Ending {
  id: string;
  title: Text;
  body: Text;
  /** Bonuspunten bij dit einde, bijvoorbeeld +600 bij het juiste extractiepunt. */
  bonus: number;
}

export interface Playground {
  id: string;
  name: Text;
  /** Naslagtekst die altijd op dit tabblad staat, zoals de speluitleg met de tijdlijn van het spel. */
  body?: Text;
  /** Een foto die stukje voor stukje zichtbaar wordt (zoals de GPS-code van het extractiepunt). */
  reveal?: PlaygroundReveal;
  /** Vakjes met de GPS-code en een hintveld, die opengaan per opgeloste opdracht. */
  code?: PlaygroundCode;
}

/**
 * De GPS-code van het extractiepunt als losse vakjes. Elk vakje hoort bij één
 * opdracht (zoals een puzzel) en toont zijn stukje code zodra die opdracht goed
 * is. Puzzelnamen staan er niet bij, zodat dezelfde opzet in elke stad en elk
 * land werkt. Een stad vult de stukjes code zelf in (spelveld `playgroundCodes`).
 */
export interface PlaygroundCode {
  boxes: CodeBox[];
  /**
   * Opdracht waarvan de tekst in het hintveld komt, zoals de bonushint over het
   * extractiepunt. Het veld gaat open zodra die opdracht zichtbaar wordt.
   */
  hint?: string;
}

export interface CodeBox {
  /** De opdracht die dit vakje opent. */
  task: string;
  /** Het stukje GPS-code in dit vakje, bijvoorbeeld "53." of "201". */
  value: string;
}

/**
 * Een foto met afgedekte vakken. Elk vak hoort bij één opdracht en wordt
 * zichtbaar zodra die opdracht goed beantwoord is. De rest van de foto is
 * altijd zichtbaar.
 */
export interface PlaygroundReveal {
  /** Absolute https-URL van de foto. */
  image: string;
  /** Afmetingen van de foto in pixels; de vakken rekenen hierin. */
  width: number;
  height: number;
  pieces: RevealPiece[];
}

export interface RevealPiece {
  /** De opdracht die dit vak vrijgeeft. */
  task: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface MeetingPoint extends LatLng {
  text: Text;
  /** Straal in meters van de cirkel om het verzamelpunt; daarbinnen is een team er. Standaard 20. */
  radius?: number;
}

export const DEFAULT_MEETING_RADIUS = 20;

export interface MapOverlay {
  /** Media-id of URL van de afbeelding. */
  image: string;
  /** Hoekpunten: noordwest en zuidoost. */
  bounds: [LatLng, LatLng];
}

/**
 * Grens van het speelveld: een gesloten lijn om het gebied waar teams mogen
 * spelen, zoals de rode lijn in Loquiz. Alleen ter oriëntatie op de kaart.
 */
export const MAP_ICONS = ['logo', 'flag'] as const;
export type MapIcon = (typeof MAP_ICONS)[number];

export interface BoundaryPoint extends LatLng {
  /**
   * Maakt van de lijn naar het volgende punt een bocht: het stuurpunt van een
   * kwadratische bocht (Bézier). Zonder stuurpunt is die lijn recht.
   */
  curve?: LatLng;
}

export interface PlayBoundary {
  /** Hoekpunten in volgorde; de lijn sluit vanzelf terug naar het eerste punt. */
  points: BoundaryPoint[];
  /** Lijnkleur als #rrggbb. Standaard rood. */
  color?: string;
  /** Kleur van de laag over alles buiten het speelveld, als #rrggbb. Standaard grijs. */
  outsideColor?: string;
  /** Dekking van die laag, van 0 (uit) tot 1 (helemaal dicht). Standaard 0,45. */
  outsideOpacity?: number;
}

export const DEFAULT_BOUNDARY_COLOR = '#dc2626';
export const DEFAULT_OUTSIDE_COLOR = '#4b5563';
export const DEFAULT_OUTSIDE_OPACITY = 0.45;

/** Kleur en dekking van de laag buiten het speelveld, met standaardwaarden. */
export function outsideShade(boundary: Pick<PlayBoundary, 'outsideColor' | 'outsideOpacity'> | null | undefined): { color: string; opacity: number } {
  const opacity = boundary?.outsideOpacity ?? DEFAULT_OUTSIDE_OPACITY;
  return { color: boundary?.outsideColor ?? DEFAULT_OUTSIDE_COLOR, opacity: Math.min(1, Math.max(0, opacity)) };
}

/**
 * Kaartbron, instelbaar zodat we kunnen wisselen (OpenFreeMap, eigen
 * kaartbestand op Cloudflare R2, enzovoort) zonder de app te wijzigen.
 * Ontbreekt hij in het spel, dan gebruikt de app de standaardbron uit de configuratie.
 */
export interface MapSource {
  /** URL van een MapLibre-stijl (style.json). */
  styleUrl: string;
  /** Bronvermelding op de kaart. */
  attribution?: string;
  /**
   * Andere stijl binnen het speelveld (zoals kleur binnen, Toner buiten).
   * Alleen in de webkaart (webapp en Expo Go); elders blijft het `styleUrl`.
   */
  insideStyleUrl?: string;
}

const STYLE_BASE = 'https://raw.githubusercontent.com/itandleisure/gameappescapegamethehunt/main/apps/admin/public/kaart';
const OSM_ATTRIBUTION = '© OpenStreetMap-bijdragers, OpenFreeMap';

export const OPENFREEMAP_LIBERTY = 'https://tiles.openfreemap.org/styles/liberty';
export const MAPTILER_TONER = 'https://api.maptiler.com/maps/toner-v2/style.json';

/** De eigen zwart-witte stijl (apps/admin/public/kaart/stijl.json). */
export const ZWART_WIT_SOURCE: MapSource = { styleUrl: `${STYLE_BASE}/stijl.json`, attribution: OSM_ATTRIBUTION };

/**
 * Standaard kaartbron: Toner met kleur. Buiten het speelveld zwart-wit in
 * Toner-stijl, erbinnen groene parken, blauw water en herkenningspunten
 * (kerken, stadhuis, musea). Eigen stijlen in apps/admin/public/kaart op
 * OpenStreetMap-data via OpenFreeMap (geen sleutel nodig), gemaakt met
 * scripts/kaartvoorbeelden/stijlbestanden.mjs. De stijlen staan in de openbare
 * repository en worden na elke merge vanzelf bijgewerkt. Voor productie
 * verhuizen naar een eigen domein of kaartbestand, zie docs/ontwerp.md §2.1.
 */
export const DEFAULT_MAP_SOURCE: MapSource = {
  styleUrl: `${STYLE_BASE}/toner.json`,
  insideStyleUrl: `${STYLE_BASE}/toner-kleur.json`,
  attribution: OSM_ATTRIBUTION,
};

/** Kaartstijlen om uit te kiezen in de beheerapp (per spel, stad of klant). */
export const MAP_STYLES: readonly { id: string; name: string; source: MapSource }[] = [
  { id: 'toner-kleur', name: 'Toner met kleur (standaard)', source: DEFAULT_MAP_SOURCE },
  { id: 'zwart-wit', name: 'Zwart-wit', source: ZWART_WIT_SOURCE },
  { id: 'nacht', name: 'Nacht', source: { styleUrl: `${STYLE_BASE}/nacht.json`, attribution: OSM_ATTRIBUTION } },
  { id: 'schatkaart', name: 'Schatkaart', source: { styleUrl: `${STYLE_BASE}/schatkaart.json`, attribution: OSM_ATTRIBUTION } },
  // Kant-en-klare stijl van MapTiler. Het adres staat hier zonder sleutel; die
  // zet de app er onderweg bij (zie map-provider.ts). Zonder MapTiler valt hij
  // terug op onze eigen Toner-stijl.
  { id: 'toner', name: 'Toner (MapTiler)', source: { styleUrl: MAPTILER_TONER, attribution: '© MapTiler © OpenStreetMap-bijdragers' } },
  { id: 'kleur', name: 'Gewone kleurenkaart', source: { styleUrl: OPENFREEMAP_LIBERTY, attribution: OSM_ATTRIBUTION } },
];

/** Stijl binnen het speelveld bij deze kaartstijl, of undefined als die er niet is. */
export function insideStyleUrl(styleUrl: string): string | undefined {
  return MAP_STYLES.find((s) => s.source.styleUrl === styleUrl)?.source.insideStyleUrl;
}

/** Kleur per track (index 0 = vaste locatie, voor alle tracks), goed te onderscheiden op een grijze kaart. */
export const TRACK_COLORS = ['#ea580c', '#2563eb', '#16a34a', '#db2777', '#ca8a04', '#7c3aed', '#0891b2', '#dc2626', '#4b5563', '#65a30d'] as const;
export function trackColor(track: number | null): string {
  return TRACK_COLORS[(track ?? 0) % TRACK_COLORS.length]!;
}

export interface GpsSettings {
  /** Metingen met een grotere onzekerheid (meters) tellen niet mee. */
  maxAccuracy: number;
  /**
   * Seconden na "Nee" op een bevestigingsvraag (zoals "Is dit het juiste
   * extractiepunt?") om de cirkel uit te lopen. Daarna komt de vraag terug als
   * het team er nog staat. Standaard 20.
   */
  declineSeconds?: number;
}

export interface GamePackage {
  id: string;
  /** Versienummer van de gepubliceerde versie. */
  version: number;
  /**
   * Moment van publiceren (ms, servertijd; door de database gezet). Wordt een
   * lopend spel live bijgewerkt naar deze versie, dan tellen aankomsten op een
   * locatie van vóór dit moment gewoon mee, ook als die locatie verplaatst is.
   */
  publishedAt?: number;
  name: Text;
  languages: Lang[];
  defaultLanguage: Lang;
  tasks: Task[];
  rules: Rule[];
  sequences: Sequence[];
  endings: Ending[];
  playgrounds: Playground[];
  meetingPoint?: MeetingPoint;
  mapOverlay?: MapOverlay;
  map?: MapSource;
  boundary?: PlayBoundary;
  /**
   * Reeks met de speluitleg die teams vóór de start lezen (bij een centrale
   * start door de spelleider). Zijn ze gelezen, dan tellen die opdrachten bij
   * de start als afgerond.
   */
  briefing?: string;
  gps: GpsSettings;
}

// ---------------------------------------------------------------------------
// Gebeurtenissen van een team
// ---------------------------------------------------------------------------

interface EventBase {
  /** Uniek id (door de app gemaakt), zodat dubbel versturen geen kwaad kan. */
  id: string;
  /** Tijdstip in ms sinds epoch, gecorrigeerd naar servertijd. */
  at: number;
}

export type GameEvent = EventBase &
  (
    | { type: 'locationReached'; task: string; lat: number; lng: number; accuracy: number }
    | { type: 'confirmed'; task: string }
    | { type: 'declined'; task: string }
    | { type: 'answered'; task: string; answer: AnswerValue }
    | { type: 'hintUsed'; task: string; hint: number }
    /** Spelleiding opent een opdracht handmatig vanuit de monitor. */
    | { type: 'manualOpen'; task: string }
  );

export interface TeamContext {
  /** Tracknummer van het team (1-based). */
  track: number;
  /** Starttijd van het team volgens de server (ms). */
  startedAt: number;
  /** De speluitleg (GamePackage.briefing) is vóór de start gelezen. */
  briefingRead?: boolean;
}

// ---------------------------------------------------------------------------
// Toestand van een team
// ---------------------------------------------------------------------------

export type TaskStatus =
  /** Nog niet zichtbaar. */
  | 'hidden'
  /** Zichtbaar op kaart, lijst of playground. */
  | 'visible'
  /** Wacht op de bevestigingsvraag. */
  | 'confirming'
  /** Open om te beantwoorden. */
  | 'open'
  /** Afgerond. */
  | 'done'
  /** Uitgezet door een regel. */
  | 'deactivated';

export interface TaskState {
  status: TaskStatus;
  onMap: boolean;
  inList: boolean;
  playground?: string;
  attempts: number;
  correct?: boolean;
  completedAt?: number;
  hintsUsed: number;
  lastAnswer?: AnswerValue;
}

export interface LedgerEntry {
  at: number;
  points: number;
  reason: 'answer' | 'hint' | 'award' | 'ending' | 'wrong';
  task?: string;
  note?: string;
}

export interface MessageEntry {
  at: number;
  text: Text;
  rule: string;
}

export interface Rejection {
  event: string;
  reason: string;
}

export interface TeamState {
  /** Tijdstip waarop deze toestand is berekend. */
  now: number;
  score: number;
  tasks: Record<string, TaskState>;
  firedRules: Record<string, number>;
  messages: MessageEntry[];
  ledger: LedgerEntry[];
  activeSequence?: { id: string; index: number };
  ended?: { ending: string; at: number };
  /** Tijdstip waarop de punten voor het team zijn verborgen (actie `hideScore`). */
  scoreHiddenAt?: number;
  /** Gebeurtenissen die niet zijn toegepast, met reden (voor de monitor). */
  rejected: Rejection[];
}
