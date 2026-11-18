import { composeGame, type GamePackage, type Rule, type Task } from '@hunt/engine';
import { leeuwarden, leeuwardenPoints, PUZZLES, theHuntBase } from '../../../packages/engine/test/fixtures/the-hunt.js';

/**
 * Schermvoorbeeld: nepspellen om alle schermen in de browser te bekijken op
 * veel schermmaten, zonder server, GPS of camera. Alleen voor
 * `pnpm --filter @hunt/player screens`; komt nooit in de echte app.
 *
 * De scène staat in de URL: `?scene=task&img=tall`.
 */
export type Scene = 'join' | 'teamphoto' | 'teamcode' | 'central' | 'play' | 'task' | 'chat' | 'end';
export type ImageKind = 'none' | 'normal' | 'huge' | 'tiny' | 'wide' | 'tall' | 'broken';

export function currentScene(): { scene: Scene; img: ImageKind; long: boolean } {
  const params = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '');
  return {
    scene: (params.get('scene') as Scene | null) ?? 'join',
    img: (params.get('img') as ImageKind | null) ?? 'normal',
    long: params.get('long') === '1',
  };
}

/** SVG-plaatje met de gevraagde afmetingen (een dambord met de maat erop), zodat er geen bestanden nodig zijn. */
export function testImage(width: number, height: number, label = `${width} × ${height}`): string {
  const cell = Math.max(4, Math.round(Math.min(width, height) / 6));
  const font = Math.max(6, Math.round(Math.min(width / 8, height / 3)));
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
    `<defs><pattern id="p" width="${cell * 2}" height="${cell * 2}" patternUnits="userSpaceOnUse">` +
    `<rect width="${cell * 2}" height="${cell * 2}" fill="#2d6cdf"/><rect width="${cell}" height="${cell}" fill="#f5a524"/>` +
    `<rect x="${cell}" y="${cell}" width="${cell}" height="${cell}" fill="#f5a524"/></pattern></defs>` +
    `<rect width="100%" height="100%" fill="url(#p)"/><rect x="2" y="2" width="${width - 4}" height="${height - 4}" fill="none" stroke="#e00" stroke-width="4"/>` +
    `<text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-family="sans-serif" font-size="${font}" fill="#fff" stroke="#000" stroke-width="1">${label}</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

const IMAGES: Record<Exclude<ImageKind, 'none'>, string> = {
  normal: testImage(1200, 900),
  // Telefoonfoto van 48 megapixel, onverkleind geüpload in de beheeromgeving.
  huge: testImage(8000, 6000),
  tiny: testImage(40, 30),
  wide: testImage(3000, 300, 'panorama'),
  tall: testImage(300, 3000, 'lang'),
  broken: 'https://example.invalid/bestaat-niet.jpg',
};

const LONG =
  'Dit is een extra lange opdrachttekst om te zien of alles op een klein scherm past. '.repeat(12) +
  'Supercalifragilisticexpialidocious-achtig-lang-woord-zonder-spaties-dat-niet-afgebroken-kan-worden.';

const LONG_TITLE = 'Een hele lange titel voor een opdracht die over meerdere regels loopt';

export function previewImage(kind: ImageKind): string | undefined {
  return kind === 'none' ? undefined : IMAGES[kind];
}

/** Het spel voor de scène: Leeuwarden uit de tests, met opdrachten die meteen in de lijst staan. */
export function previewGame(scene: Scene, img: ImageKind, long: boolean): GamePackage {
  const game = composeGame(theHuntBase, [leeuwarden], { id: 'voorbeeld', version: 1 });
  const image = previewImage(img);
  const tasks: Task[] = game.tasks.map((t) => {
    if (t.id === 'puzzel-tangram')
      return {
        ...t,
        ...(long ? { title: { nl: LONG_TITLE, en: LONG_TITLE }, body: { nl: LONG, en: LONG } } : {}),
        ...(image ? { image } : {}),
        hints: t.hints.map((h, i) => (i === 0 && image ? { ...h, image } : h)),
      };
    if (t.id === 'fotomissie' && image) return { ...t, image };
    return t;
  });
  const shown: Rule = {
    id: 'voorbeeld-lijst',
    when: { kind: 'elapsed', minutes: 0 },
    then: [
      ...[...PUZZLES.map((p) => p.id), 'fotomissie'].map((task) => ({ kind: 'show' as const, select: { task }, on: 'list' as const })),
      { kind: 'show', select: { task: 'start' }, on: 'map' },
      { kind: 'show', select: { task: 'extractie-a' }, on: { playground: 'extractiepunt' } },
      ...(long ? [{ kind: 'message' as const, text: { nl: LONG, en: LONG } }] : []),
      ...(scene === 'end' ? [{ kind: 'end' as const, ending: 'ontsnapt' }] : []),
    ],
  };
  const reveal = {
    image: image ?? IMAGES.normal,
    width: img === 'wide' ? 3000 : img === 'tall' ? 300 : 1200,
    height: img === 'wide' ? 300 : img === 'tall' ? 3000 : 900,
    pieces: PUZZLES.slice(0, 3).map((p, i) => ({ task: p.id, x: (i * 1200) / 4, y: 0, w: 200, h: 200 })),
  };
  return {
    ...game,
    tasks,
    rules: [shown],
    playgrounds: game.playgrounds.map((p) =>
      p.id === 'extractiepunt' ? { ...p, ...(long ? { body: { nl: LONG, en: LONG } } : {}), reveal } : p,
    ),
    meetingPoint: { ...leeuwardenPoints.start, text: { nl: long ? LONG : 'Kom naar de ingang van het museum.', en: 'Meet at the museum entrance.' } },
  };
}
