// Zet een Loquiz-game (uit de export van fetch.mjs) om naar ons importformaat.
//
// Loquiz geeft via de API wel teksten, antwoorden, feedback, foto's, de kaartoverlay
// en het verzamelpunt, maar géén locaties per opdracht, punten of spelregels.
// Daarom vullen we een bestaand bundelbestand (met regels, locaties en punten)
// aan met de echte teksten, volgens een koppeltabel per stad (zie MAPPINGS).
//
// Gebruik:
//   node scripts/loquiz/convert.mjs <loquiz-game.json> <skelet-bundel.json> <uitvoer.json> [stad]
// De inhoud komt NIET in de repository (die is openbaar), alleen in de projectmap.
import { readFile, writeFile } from 'node:fs/promises';

// ---------------------------------------------------------------------------
// Hulpfuncties
// ---------------------------------------------------------------------------

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

/** HTML uit de Loquiz-editor naar platte tekst met witregels. */
export function htmlToText(html) {
  if (!html) return '';
  let s = String(html)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<li[^>]*>/gi, '\n• ')
    .replace(/<\/(p|div|h[1-6]|li|ul|ol)>/gi, '\n')
    .replace(/<img[^>]*>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&(#\d+|#x[0-9a-f]+|\w+);/gi, (m, e) => {
      if (e[0] === '#') return String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
      return ENTITIES[e.toLowerCase()] ?? m;
    });
  s = s
    .split('\n')
    .map((l) => l.replace(/[ \t ]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return s;
}

/** Afbeeldingen in de HTML-tekst. */
export function inlineImages(html) {
  return [...String(html ?? '').matchAll(/<img[^>]+src=["']([^"']+)["']/gi)].map((m) => m[1]);
}

/** Eerste afbeelding: uit media, anders uit de tekst. */
export function firstImage(task) {
  const media = (task.media ?? []).find((m) => m?.type === 'image' && m.url);
  return media?.url ?? inlineImages(task.text)[0];
}

/** Splitst "1/12 - Titel\n\nTekst" in titel en tekst. */
export function splitTitle(text) {
  const [first, ...rest] = text.split('\n');
  const title = first.replace(/^\d+\s*\/\s*\d+\s*[-–]\s*/, '').trim();
  return { title, body: rest.join('\n').trim() };
}

/** Loquiz-antwoord naar ons AnswerSpec. Geeft ook waarschuwingen terug. */
export function convertAnswer(task) {
  const warnings = [];
  const answers = task.answers ?? [];
  switch (task.answerType) {
    case 'none':
      return { answer: { type: 'info' }, warnings };
    case 'photo':
      return { answer: { type: 'photo' }, warnings };
    case 'single': {
      const correct = answers.findIndex((a) => a.correct);
      return { answer: { type: 'choice', options: answers.map((a) => ({ nl: a.text })), correct }, warnings };
    }
    case 'multiple':
      return {
        answer: {
          type: 'multi',
          options: answers.map((a) => ({ nl: a.text })),
          correct: answers.flatMap((a, i) => (a.correct ? [i] : [])),
        },
        warnings,
      };
    case 'text': {
      // Jokerteken * (bijv. "ver*") werkt in de engine zoals in Loquiz.
      const accepted = answers.filter((a) => a.correct).map((a) => a.text);
      return { answer: { type: 'text', accepted }, warnings };
    }
    case 'number': {
      const a = answers.find((x) => x.correct);
      return { answer: { type: 'number', value: Number(a?.text) }, warnings };
    }
    case 'number:range': {
      const a = answers.find((x) => x.correct);
      const min = Number(a?.min);
      const max = Number(a?.max);
      return { answer: { type: 'number', value: (min + max) / 2, tolerance: (max - min) / 2 }, warnings };
    }
    default:
      warnings.push(`antwoordsoort ${task.answerType} niet omgezet`);
      return { answer: { type: 'info' }, warnings };
  }
}

// ---------------------------------------------------------------------------
// Koppeltabellen: onze opdracht-id → Loquiz-opdracht-id(s)
// ---------------------------------------------------------------------------

export const MAPPINGS = {
  leeuwarden: {
    loquizGameId: 'PKQYFGCUAJ',
    // Speluitleg 1–12
    sequence: {
      'uitleg-01': 'N6yLe63cW', 'uitleg-02': 'egLXw9uhg', 'uitleg-03': 'RnS-IKJSl', 'uitleg-04': 'aKLVFdxpF',
      'uitleg-05': 'XdfeJFf12', 'uitleg-06': 'e972kNSH6', 'uitleg-07': 'm72w0JtVg', 'uitleg-08': 'tlD7cS9Ow',
      'uitleg-09': '6SJQKC5LZ', 'uitleg-10': 'DCG9AjRpr', 'uitleg-11': 'iSfZj1AKZ', 'uitleg-12': 'S8toayVIw',
    },
    // Puzzels: oplossingsopdracht + losse hintopdrachten (−25, −50, −75)
    puzzles: {
      'puzzel-tangram': { answer: 'Lace7ORRa', hints: ['zWpTPrNy1', 'RNMe3yKU-', 'B_9g9CNN2'] },
      'puzzel-morse': { answer: 'f1pPTeaP1', hints: ['87ePgaU6L', 'LMQJQqXe3', 'Nwq9rLFFP'] },
      'puzzel-blokjes': { answer: 'Jiykzu6AM', hints: ['6NCrCdHeS', 'TC1Y8Zrc8', '4zWBD8Xav'] },
      'puzzel-stratenkaart': { answer: '-JcaQKOb8', hints: ['JsEHTkphI', 'oUaeH6nZG', 'B1ZQ0y1_C'] },
      'puzzel-cryptex': { answer: 'sahN6LFa-', hints: ['xCq5LGffb', 'FVPbUHszu', 'uLY2UCqvQ'] },
      'puzzel-kompas': { answer: 'jbLhTLUrr', hints: ['GsU27TUWG', 'PGvodlqj1', 'e6rVIWUAZ'] },
    },
    // Gewone opdrachten (tekst, antwoord, feedback)
    tasks: { fotomissie: 'pQl7UZx9x', 'lokaal-1': 'kbWrMeL8U', 'lokaal-2': 'n8ex_zoPe' },
    // Extractiepunten: bevestigingsvraag uit Loquiz. In Loquiz is locatie 3 de juiste.
    confirms: { 'extractie-a': 'CvEC1gbXR', 'extractie-b': 'JQzxwvxUY', 'extractie-c': 'NZYTCZcyA' },
    endings: { ontsnapt: 'zTqSbP0Dl', 'verkeerd-extractiepunt': 'o8agHiaP0' },
    // Berichten in regels (tijdlijn en finale)
    ruleMessages: {
      'tijdlijn-10': 'hyAlsLGG1', 'tijdlijn-20': 'LV5VSDqCn', 'tijdlijn-30': 'ievChZ_yC',
      'tijdlijn-40': 'O1GlSFWsk', 'tijdlijn-50': 'JI_3NSOWr', finale: 'CXmfGDdwI',
    },
  },
};

// ---------------------------------------------------------------------------
// Omzetten
// ---------------------------------------------------------------------------

export function convertGame(loquiz, skeleton, mapping) {
  const base = structuredClone(skeleton.base ?? skeleton);
  const variants = skeleton.base ? structuredClone(skeleton.variants ?? []) : undefined;
  const byId = new Map(loquiz.tasks.map((t) => [t.id, t]));
  const used = new Set();
  const report = { filled: [], warnings: [], unused: [] };
  const ours = new Map(base.tasks.map((t) => [t.id, t]));

  const lq = (id) => {
    const t = byId.get(id);
    if (!t) throw new Error(`Loquiz-opdracht ${id} niet gevonden`);
    used.add(id);
    return t;
  };
  // Alleen Nederlands komt uit Loquiz; een oude Engelse plaatshouder halen we weg,
  // zodat de beheeromgeving laat zien wat nog vertaald moet worden.
  const nl = (value) => ({ nl: value });
  const setImage = (task, src) => {
    const img = firstImage(src);
    if (img) task.image = img;
    const extra = [...(src.media ?? []).filter((m) => m?.type === 'image').map((m) => m.url), ...inlineImages(src.text)].filter(
      (u) => u !== img,
    );
    if (extra.length) report.warnings.push(`${task.id}: ${extra.length} extra afbeelding(en) niet overgenomen (één per opdracht)`);
  };
  const need = (id) => {
    const t = ours.get(id);
    if (!t) throw new Error(`Opdracht ${id} staat niet in het skelet`);
    return t;
  };

  // Speluitleg
  for (const [ourId, lqId] of Object.entries(mapping.sequence ?? {})) {
    const task = need(ourId);
    const src = lq(lqId);
    const { title, body } = splitTitle(htmlToText(src.text));
    task.title = nl(title);
    task.body = nl(body);
    setImage(task, src);
    report.filled.push(ourId);
  }

  // Puzzels
  for (const [ourId, { answer, hints }] of Object.entries(mapping.puzzles ?? {})) {
    const task = need(ourId);
    const src = lq(answer);
    const conv = convertAnswer(src);
    task.answer = conv.answer;
    conv.warnings.forEach((w) => report.warnings.push(`${ourId}: ${w}`));
    task.body = nl(htmlToText(src.text));
    if (src.comments?.correct) task.correctComment = nl(htmlToText(src.comments.correct));
    if (src.comments?.incorrect) task.wrongComment = nl(htmlToText(src.comments.incorrect));
    if (src.keepUntilAnsweredCorrectly) task.retryUntilCorrect = true;
    const costs = (task.hints ?? []).map((h) => h.cost);
    task.hints = hints.map((hid, i) => {
      const h = lq(hid);
      const { body } = splitTitle(htmlToText(h.text)); // eerste regel is "… Hint 1"
      const img = firstImage(h);
      return { cost: costs[i] ?? [25, 50, 75][i], text: nl(body), ...(img ? { image: img } : {}) };
    });
    report.filled.push(ourId);
  }
  // De bevestigingsvragen voor hints ("Weten jullie zeker…?") zijn in onze app standaard.
  for (const t of loquiz.tasks) {
    if (/Weten jullie zeker dat je[\s\S]*Hint \d/i.test(htmlToText(t.text))) used.add(t.id);
  }

  // Gewone opdrachten
  for (const [ourId, lqId] of Object.entries(mapping.tasks ?? {})) {
    const task = need(ourId);
    const src = lq(lqId);
    const conv = convertAnswer(src);
    if (task.answer?.type !== conv.answer.type) {
      report.warnings.push(`${ourId}: antwoordsoort ${task.answer?.type} → ${conv.answer.type} (uit Loquiz)`);
    }
    task.answer = conv.answer;
    conv.warnings.forEach((w) => report.warnings.push(`${ourId}: ${w}`));
    const text = htmlToText(src.text);
    const split = splitTitle(text);
    if (ourId === 'fotomissie') {
      task.title = nl(split.title.replace(/^MISSIE:\s*/i, ''));
      task.body = nl(split.body);
    } else {
      task.body = nl(text);
    }
    if (src.comments?.correct) task.correctComment = nl(htmlToText(src.comments.correct));
    if (src.comments?.incorrect) task.wrongComment = nl(htmlToText(src.comments.incorrect));
    setImage(task, src);
    report.filled.push(ourId);
  }

  // Extractiepunten
  for (const [ourId, lqId] of Object.entries(mapping.confirms ?? {})) {
    const task = need(ourId);
    const src = lq(lqId);
    task.confirm = nl(htmlToText(src.text));
    const loc = htmlToText(src.text).match(/Locatie\s*(\d)/i);
    if (loc) task.title = nl(`Extractiepunt locatie ${loc[1]}`);
    report.filled.push(ourId);
  }

  // Eindes
  for (const [endingId, lqId] of Object.entries(mapping.endings ?? {})) {
    const ending = base.endings.find((e) => e.id === endingId);
    if (!ending) throw new Error(`Einde ${endingId} staat niet in het skelet`);
    const { title, body } = splitTitle(htmlToText(lq(lqId).text));
    ending.title = nl(title.replace(/!+$/, '!'));
    ending.body = nl(body);
    report.filled.push(`einde ${endingId}`);
  }

  // Berichten in regels
  for (const [ruleId, lqId] of Object.entries(mapping.ruleMessages ?? {})) {
    const rule = base.rules.find((r) => r.id === ruleId);
    const msg = rule?.then.find((a) => a.kind === 'message');
    if (!msg) throw new Error(`Regel ${ruleId} met bericht staat niet in het skelet`);
    msg.text = nl(htmlToText(lq(lqId).text));
    report.filled.push(`regel ${ruleId}`);
  }

  // Startlocatie: welkomsttekst van het spel
  if (ours.has('start') && loquiz.intro) {
    ours.get('start').body = nl(htmlToText(loquiz.intro));
    report.filled.push('start');
  }

  // Verzamelpunt en kaartoverlay
  const mp = loquiz.afterFinishMeetingPoint?.location;
  if (mp && base.meetingPoint) {
    base.meetingPoint.lat = mp.lat;
    base.meetingPoint.lng = mp.lng;
    if (loquiz.afterFinishMeetingPoint.message) base.meetingPoint.text = nl(htmlToText(loquiz.afterFinishMeetingPoint.message));
    report.filled.push('verzamelpunt');
  }
  const ov = loquiz.mapOverlays?.[0];
  if (ov?.bounds) {
    base.mapOverlay = {
      image: ov.imageUrl,
      bounds: [
        { lat: ov.bounds.top, lng: ov.bounds.left },
        { lat: ov.bounds.bottom, lng: ov.bounds.right },
      ],
    };
    if (ov.rotation) report.warnings.push(`kaartoverlay is ${ov.rotation}° gedraaid in Loquiz`);
    report.filled.push('kaartoverlay');
  }

  for (const t of loquiz.tasks) {
    if (!used.has(t.id)) report.unused.push(`${t.id}: ${htmlToText(t.text).split('\n')[0].slice(0, 80)}`);
  }

  const bundle = variants ? { base, variants } : base;
  return { bundle, report };
}

// ---------------------------------------------------------------------------
// Opdrachtregel
// ---------------------------------------------------------------------------

if (import.meta.url === `file://${process.argv[1]}`) {
  const [gameFile, skeletonFile, outFile, city = 'leeuwarden'] = process.argv.slice(2);
  if (!outFile) {
    console.error('Gebruik: node scripts/loquiz/convert.mjs <loquiz-game.json> <skelet-bundel.json> <uitvoer.json> [stad]');
    process.exit(1);
  }
  const mapping = MAPPINGS[city];
  if (!mapping) throw new Error(`Geen koppeltabel voor ${city}`);
  const loquiz = JSON.parse(await readFile(gameFile, 'utf8'));
  const skeleton = JSON.parse(await readFile(skeletonFile, 'utf8'));
  const { bundle, report } = convertGame(loquiz, skeleton, mapping);
  await writeFile(outFile, JSON.stringify(bundle, null, 2) + '\n');
  console.log(`Ingevuld: ${report.filled.length}`);
  console.log(`Waarschuwingen (${report.warnings.length}):\n  ${report.warnings.join('\n  ')}`);
  console.log(`Niet gebruikte Loquiz-opdrachten (${report.unused.length}):\n  ${report.unused.join('\n  ')}`);
}
