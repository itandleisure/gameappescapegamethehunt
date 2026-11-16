/**
 * The Hunt als testgeval voor de engine: basisspel, stadsvariant Leeuwarden,
 * stadsvariant Amsterdam en klantvariant Parteon.
 *
 * Structuur en regels volgen The Hunt NL Leeuwarden in Loquiz (94 opdrachten,
 * 13 regelblokken). De teksten, antwoorden en coördinaten hieronder zijn
 * TESTDATA: de echte inhoud wordt in fase 4 ingevoerd. Ingebouwde functies
 * (hints, bevestiging, introreeks, tracks) vervangen de ruim 40 losse
 * hulpopdrachten uit Loquiz, daarom heeft dit pakket minder opdrachten.
 */
import type { BaseGame, Variant } from '../../src/layers.js';
import type { Hint, LatLng, Task, TaskLocation, Text } from '../../src/types.js';

const nlen = (nl: string, en: string): Text => ({ nl, en });

const hints = (puzzle: string): Hint[] => [
  { cost: 25, text: nlen(`${puzzle}: hint 1`, `${puzzle}: hint 1`) },
  { cost: 50, text: nlen(`${puzzle}: hint 2`, `${puzzle}: hint 2`) },
  { cost: 75, text: nlen(`${puzzle}: hint 3`, `${puzzle}: hint 3`) },
];

const info = (id: string, nl: string, en: string, extra: Partial<Task> = {}): Task => ({
  id,
  title: nlen(nl, en),
  body: nlen(`${nl} (tekst)`, `${en} (text)`),
  answer: { type: 'info' },
  points: 0,
  tags: [],
  hints: [],
  ...extra,
});

/** Zes puzzels: oplossing invullen, +200, drie hints van 25/50/75. */
export const PUZZLES = [
  { id: 'puzzel-tangram', nl: 'Tangram', en: 'Tangram', answer: { type: 'text', accepted: ['vluchtroute'] } },
  { id: 'puzzel-morse', nl: 'Morsecode', en: 'Morse code', answer: { type: 'text', accepted: ['extractie'] } },
  { id: 'puzzel-blokjes', nl: 'Blokjespuzzel', en: 'Block puzzle', answer: { type: 'number', value: 4711 } },
  { id: 'puzzel-stratenkaart', nl: 'Stratenkaart', en: 'Street map', answer: { type: 'text', accepted: ['Oldehove', 'de oldehove'] } },
  { id: 'puzzel-cryptex', nl: 'Cryptex', en: 'Cryptex', answer: { type: 'text', accepted: ['hunter'] } },
  { id: 'puzzel-kompas', nl: 'Kompas', en: 'Compass', answer: { type: 'text', accepted: ['noordoost', 'north east'] } },
] as const satisfies readonly { id: string; nl: string; en: string; answer: Task['answer'] }[];

export const INTRO = Array.from({ length: 12 }, (_, i) => `uitleg-${String(i + 1).padStart(2, '0')}`);

const TRACKS = [1, 2, 3, 4, 5];
const placeholder: TaskLocation = { lat: 0, lng: 0, radius: 10 };

export const theHuntBase: BaseGame = {
  id: 'the-hunt',
  name: nlen('The Hunt', 'The Hunt'),
  languages: ['nl', 'en'],
  defaultLanguage: 'nl',
  gps: { maxAccuracy: 30 },
  playgrounds: [
    { id: 'extractiepunt', name: nlen('Extractiepunt', 'Extraction point') },
    { id: 'speluitleg', name: nlen('Speluitleg', 'How to play') },
  ],
  sequences: [{ id: 'intro', tasks: INTRO }],
  endings: [
    { id: 'ontsnapt', title: nlen('Ontsnapt!', 'Escaped!'), body: nlen('Jullie zijn ontsnapt.', 'You escaped.'), bonus: 600 },
    {
      id: 'verkeerd-extractiepunt',
      title: nlen('Helaas', 'Too bad'),
      body: nlen('Dit was het verkeerde extractiepunt.', 'This was the wrong extraction point.'),
      bonus: 0,
    },
    { id: 'tijd-op', title: nlen('Tijd is op', 'Time is up'), body: nlen('De Hunters hebben jullie.', 'The Hunters got you.'), bonus: 0 },
  ],
  tasks: [
    info('start', 'Startlocatie', 'Starting point', { location: { ...placeholder, radius: 50 } }),
    ...INTRO.map((id, i) => info(id, `Speluitleg ${i + 1}`, `How to play ${i + 1}`)),
    ...PUZZLES.map(
      (p): Task => ({
        id: p.id,
        title: nlen(p.nl, p.en),
        body: nlen(`Vul de oplossing van de ${p.nl.toLowerCase()} in.`, `Enter the solution of the ${p.en.toLowerCase()}.`),
        answer: p.answer,
        points: 200,
        tags: ['puzzel', 'oplossing'],
        hints: hints(p.nl),
        retryUntilCorrect: true,
      }),
    ),
    {
      id: 'fotomissie',
      title: nlen('Leg het bewijs vast', 'Capture the evidence'),
      body: nlen('Maak een teamfoto bij een Hunter-poster.', 'Take a team photo at a Hunter poster.'),
      answer: { type: 'photo' },
      points: 0,
      tags: ['foto'],
      hints: [],
    },
    // Twee lokale vragen (in Loquiz opdracht 54 en 55): per track een andere plek.
    ...(['lokaal-1', 'lokaal-2'] as const).map(
      (id, i): Task => ({
        id,
        title: nlen(`Lokale vraag ${i + 1}`, `Local question ${i + 1}`),
        body: nlen('(per stad in te vullen)', '(set per city)'),
        answer: { type: 'text', accepted: ['-'] },
        points: 50,
        tags: ['track'],
        hints: [],
        trackLocations: Object.fromEntries(TRACKS.map((t) => [t, placeholder])),
      }),
    ),
    info('extractie-hint', 'Hint extractiepunt', 'Extraction point hint', { tags: ['bonus'] }),
    ...(['extractie-a', 'extractie-b', 'extractie-c'] as const).map((id, i) =>
      info(id, `Extractiepunt ${'ABC'[i]}`, `Extraction point ${'ABC'[i]}`, {
        tags: ['extractie'],
        location: { ...placeholder, radius: 25 },
        confirm: nlen('Weten jullie zeker dat dit het extractiepunt is?', 'Are you sure this is the extraction point?'),
      }),
    ),
  ],
  rules: [
    {
      id: 'start-tonen',
      label: 'Bij de start: startlocatie op de kaart',
      when: { kind: 'elapsed', minutes: 0 },
      then: [{ kind: 'show', select: { task: 'start' }, on: 'map' }],
    },
    {
      id: 'introreeks',
      label: 'Startlocatie bereikt: 12 uitlegschermen na elkaar',
      when: { kind: 'completed', select: { task: 'start' } },
      then: [{ kind: 'startSequence', sequence: 'intro' }],
    },
    {
      id: 'na-uitleg',
      label: 'Na de uitleg: speluitleg terug te lezen, trackvragen op de kaart, eerste puzzel',
      when: { kind: 'completed', select: { task: INTRO[INTRO.length - 1]! } },
      then: [
        { kind: 'show', select: { tasks: INTRO }, on: { playground: 'speluitleg' } },
        { kind: 'show', select: { tag: 'track' }, on: 'map' },
        { kind: 'show', select: { task: PUZZLES[0].id }, on: 'list' },
      ],
    },
    ...PUZZLES.slice(1).map((p, i) => ({
      id: `tijdlijn-${(i + 1) * 10}`,
      label: `Na ${(i + 1) * 10} minuten: bericht en nieuwe puzzel`,
      when: { kind: 'elapsed' as const, minutes: (i + 1) * 10 },
      then: [
        {
          kind: 'message' as const,
          text: nlen(`Er zijn ${(i + 1) * 10} minuten verstreken.`, `${(i + 1) * 10} minutes have passed.`),
        },
        { kind: 'show' as const, select: { task: p.id }, on: 'list' as const },
      ],
    })),
    {
      id: 'fotomissie',
      label: 'Na 35 minuten: fotomissie',
      when: { kind: 'elapsed', minutes: 35 },
      then: [
        { kind: 'show', select: { task: 'fotomissie' }, on: 'list' },
        { kind: 'open', task: 'fotomissie' },
      ],
    },
    {
      id: 'track-bonus',
      label: 'Beide trackvragen gedaan: bonushint over het extractiepunt',
      when: { kind: 'completed', select: { tag: 'track' } },
      then: [{ kind: 'show', select: { task: 'extractie-hint' }, on: { playground: 'extractiepunt' } }],
    },
    {
      id: 'finale',
      label: 'Alle puzzels goed en minstens 60 minuten: extractiepunten verschijnen',
      when: {
        kind: 'and',
        conditions: [
          { kind: 'correct', select: { tag: 'oplossing' } },
          { kind: 'elapsed', minutes: 60 },
        ],
      },
      then: [
        { kind: 'message', text: nlen('Super! Ga naar het juiste extractiepunt.', 'Great! Go to the right extraction point.') },
        { kind: 'show', select: { tag: 'extractie' }, on: 'map' },
      ],
    },
    {
      id: 'juist-extractiepunt',
      label: 'Juist extractiepunt: +600 en einde',
      when: { kind: 'completed', select: { task: 'extractie-a' } },
      then: [{ kind: 'end', ending: 'ontsnapt' }],
    },
    {
      id: 'verkeerd-extractiepunt',
      label: 'Verkeerd extractiepunt: einde',
      when: { kind: 'completed', select: { tasks: ['extractie-b', 'extractie-c'] }, match: 'any' },
      then: [{ kind: 'end', ending: 'verkeerd-extractiepunt' }],
    },
    {
      id: 'tijd-op',
      label: 'Na 75 minuten: alles uit en einde',
      when: { kind: 'elapsed', minutes: 75 },
      then: [
        { kind: 'deactivate', select: { all: true } },
        { kind: 'end', ending: 'tijd-op' },
      ],
    },
  ],
  meetingPoint: { lat: 0, lng: 0, text: nlen('Verzamelpunt', 'Meeting point') },
  overridable: [
    { target: { task: 'start', field: 'location' }, layers: ['city'], label: 'Startlocatie' },
    ...(['lokaal-1', 'lokaal-2'] as const).flatMap((task) => [
      { target: { task, field: 'trackLocations' as const }, layers: ['city' as const], label: 'Locaties per track' },
      { target: { task, field: 'title' as const }, layers: ['city' as const, 'client' as const] },
      { target: { task, field: 'body' as const }, layers: ['city' as const, 'client' as const], label: 'Lokale vraag' },
      { target: { task, field: 'answer' as const }, layers: ['city' as const, 'client' as const], label: 'Antwoord' },
    ]),
    ...(['extractie-a', 'extractie-b', 'extractie-c'] as const).map((task) => ({
      target: { task, field: 'location' as const },
      layers: ['city' as const],
      label: 'Extractiepunt',
    })),
    { target: { task: 'extractie-hint', field: 'body' }, layers: ['city'], label: 'Hintfoto en tekst extractiepunt' },
    { target: { task: 'puzzel-morse', field: 'hints' }, layers: ['city', 'client'], label: 'Hints morsecodepuzzel' },
    { target: { game: 'meetingPoint' }, layers: ['city'], label: 'Verzamelpunt' },
    { target: { game: 'mapOverlay' }, layers: ['city'], label: 'Kaart-overlay' },
  ],
};

/** Verschuift een punt met een aantal meters (noord, oost). */
export function offset(origin: LatLng, northMeters: number, eastMeters: number): LatLng {
  const dLat = northMeters / 111_320;
  const dLng = eastMeters / (111_320 * Math.cos((origin.lat * Math.PI) / 180));
  return { lat: origin.lat + dLat, lng: origin.lng + dLng };
}

// Testcoördinaten rond de Oldehove, Leeuwarden.
export const LWD = { lat: 53.2037, lng: 5.7895 };
export const leeuwardenPoints = {
  start: offset(LWD, 0, 0),
  extractieA: offset(LWD, 600, 300),
  extractieB: offset(LWD, -500, 400),
  extractieC: offset(LWD, 200, -700),
  track: (track: number, question: 1 | 2) => offset(LWD, track * 150 * (question === 1 ? 1 : -1), track * 90),
};

export const leeuwarden: Variant = {
  id: 'leeuwarden',
  layer: 'city',
  name: nlen('Leeuwarden', 'Leeuwarden'),
  overrides: [
    { target: { task: 'start', field: 'location' }, value: { ...leeuwardenPoints.start, radius: 50 } },
    { target: { task: 'extractie-a', field: 'location' }, value: { ...leeuwardenPoints.extractieA, radius: 25 } },
    { target: { task: 'extractie-b', field: 'location' }, value: { ...leeuwardenPoints.extractieB, radius: 25 } },
    { target: { task: 'extractie-c', field: 'location' }, value: { ...leeuwardenPoints.extractieC, radius: 25 } },
    ...([1, 2] as const).flatMap((q) => [
      {
        target: { task: `lokaal-${q}`, field: 'trackLocations' as const },
        value: Object.fromEntries(TRACKS.map((t) => [t, { ...leeuwardenPoints.track(t, q), radius: 10 }])),
      },
      {
        target: { task: `lokaal-${q}`, field: 'body' as const },
        value: nlen(`Leeuwarden vraag ${q}: hoe heet dit plein?`, `Leeuwarden question ${q}: what is this square called?`),
      },
      { target: { task: `lokaal-${q}`, field: 'answer' as const }, value: { type: 'text', accepted: [q === 1 ? 'Zaailand' : 'Waagplein'] } },
    ]),
    {
      target: { task: 'extractie-hint', field: 'body' },
      value: nlen('Het extractiepunt ligt ten noordoosten van de Oldehove.', 'The extraction point is north-east of the Oldehove.'),
    },
    { target: { game: 'meetingPoint' }, value: { ...LWD, text: nlen('Verzamelen bij de Oldehove', 'Meet at the Oldehove') } },
  ],
};

export const AMS = { lat: 52.3731, lng: 4.8926 };
export const amsterdam: Variant = {
  id: 'amsterdam',
  layer: 'city',
  name: nlen('Amsterdam', 'Amsterdam'),
  overrides: [
    { target: { task: 'start', field: 'location' }, value: { ...AMS, radius: 50 } },
    ...([1, 2] as const).flatMap((q) => [
      {
        target: { task: `lokaal-${q}`, field: 'body' as const },
        value: nlen(`Amsterdam vraag ${q}`, `Amsterdam question ${q}`),
      },
    ]),
  ],
};

/** Klantvariant op Amsterdam: andere lokale vragen en morsecode-hints. */
export const parteon: Variant = {
  id: 'parteon',
  layer: 'client',
  name: nlen('Parteon', 'Parteon'),
  overrides: [
    {
      target: { task: 'lokaal-1', field: 'body' },
      value: { nl: 'Wat is de duurzaamheidsambitie van Parteon?' },
    },
    {
      target: { task: 'lokaal-2', field: 'body' },
      value: { nl: 'Voor welke doelgroep is de Zaanse Stek bedoeld?' },
    },
    {
      target: { task: 'puzzel-morse', field: 'hints' },
      value: [{ text: { nl: 'Parteon-hint 1' } }, { text: { nl: 'Parteon-hint 2' } }, { text: { nl: 'Parteon-hint 3' } }],
    },
  ],
};
