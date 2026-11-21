import { MAP_ICONS, MAX_HUNTER_ALERT_RADIUS, type Action, type Condition, type GamePackage, type Hint, type Lang, type Selector, type Task, type Text } from './types.js';

/**
 * Gelaagd gamemodel: basisspel → stadsvariant → klantvariant → taal.
 *
 * Het basisspel markeert welke velden een stad of klant mag invullen. Bij
 * publiceren voegt `composeGame` de lagen samen tot één vast spelpakket.
 */

export type Layer = 'city' | 'client';

export type TaskField =
  | 'title'
  | 'body'
  | 'image'
  | 'answer'
  | 'points'
  | 'hints'
  | 'confirm'
  | 'location'
  | 'trackLocations'
  | 'correctComment'
  | 'wrongComment';

export type GameField = 'name' | 'meetingPoint' | 'mapOverlay' | 'map' | 'boundary' | 'playgroundCodes' | 'hunterAlert';

/** Waarde van spelveld `playgroundCodes`: per tabblad de stukjes code, in de volgorde van de vakjes. */
export type PlaygroundCodes = Record<string, string[]>;

export type FieldRef = { task: string; field: TaskField } | { game: GameField };

export interface OverridableField {
  target: FieldRef;
  /** Welke lagen dit veld mogen invullen. */
  layers: Layer[];
  /** Omschrijving voor het formulier in de beheeromgeving. */
  label?: string;
}

export interface BaseGame extends Omit<GamePackage, 'version'> {
  overridable: OverridableField[];
}

export interface Override {
  target: FieldRef;
  value: unknown;
}

export interface Variant {
  id: string;
  layer: Layer;
  name: Text;
  overrides: Override[];
}

export class CompositionError extends Error {
  constructor(readonly issues: string[]) {
    super(`Spel kan niet worden samengesteld:\n- ${issues.join('\n- ')}`);
    this.name = 'CompositionError';
  }
}

const TEXT_TASK_FIELDS = new Set<TaskField>(['title', 'body', 'confirm', 'correctComment', 'wrongComment']);

function sameRef(a: FieldRef, b: FieldRef): boolean {
  if ('task' in a && 'task' in b) return a.task === b.task && a.field === b.field;
  if ('game' in a && 'game' in b) return a.game === b.game;
  return false;
}

function describe(ref: FieldRef): string {
  return 'task' in ref ? `opdracht ${ref.task}.${ref.field}` : `spel.${ref.game}`;
}

/** Spelpakketten zijn pure JSON; zo werkt dit ook in elke JS-omgeving. */
function clone<T>(value: T): T {
  return value === undefined ? value : (JSON.parse(JSON.stringify(value)) as T);
}

/**
 * Voegt het basisspel en de varianten samen tot een gepubliceerd spelpakket.
 * Varianten worden in volgorde toegepast; een stadsvariant moet vóór een
 * klantvariant komen.
 *
 * Een variant die een tekst aanpast, vervangt die tekst in alle talen. Talen
 * die de variant (nog) niet invult, gelden daarna als niet vertaald en komen in
 * `missingTranslations`. Zo krijgt een Engels team nooit de oude vraag uit het
 * basisspel terwijl het Nederlandse team de nieuwe klantvraag ziet.
 */
export function composeGame(
  base: BaseGame,
  variants: Variant[],
  meta: { id: string; version: number; name?: Text },
): GamePackage {
  const issues: string[] = [];
  const { overridable, ...rest } = base;
  const pkg: GamePackage = clone({ ...rest, id: meta.id, version: meta.version });
  const tasks = new Map(pkg.tasks.map((t) => [t.id, t]));

  let seenClient = false;
  for (const variant of variants) {
    if (variant.layer === 'client') seenClient = true;
    else if (seenClient) issues.push(`stadsvariant ${variant.id} staat na een klantvariant`);

    for (const override of variant.overrides) {
      const allowed = overridable.find((o) => sameRef(o.target, override.target));
      if (!allowed || !allowed.layers.includes(variant.layer)) {
        issues.push(`${variant.id}: ${describe(override.target)} mag niet worden aangepast door een ${variant.layer === 'city' ? 'stad' : 'klant'}`);
        continue;
      }
      const value = clone(override.value);
      if ('task' in override.target) {
        const task = tasks.get(override.target.task);
        if (!task) {
          issues.push(`${variant.id}: onbekende opdracht ${override.target.task}`);
          continue;
        }
        applyTaskOverride(task, override.target.field, value);
      } else {
        const field = override.target.game;
        if (field === 'playgroundCodes') applyPlaygroundCodes(pkg, value as PlaygroundCodes);
        else (pkg as unknown as Record<string, unknown>)[field] = value;
      }
    }
  }
  if (meta.name) pkg.name = meta.name;

  issues.push(...validateGame(pkg));
  if (issues.length) throw new CompositionError(issues);
  return pkg;
}

/** Zet de stukjes code van een stad in de vakjes van de tabbladen. Lege stukjes laten het basisspel staan. */
function applyPlaygroundCodes(pkg: GamePackage, codes: PlaygroundCodes): void {
  if (!codes || typeof codes !== 'object') return;
  for (const p of pkg.playgrounds) {
    const values = codes[p.id];
    if (!p.code || !Array.isArray(values)) continue;
    p.code.boxes = p.code.boxes.map((box, i) => {
      const v = values[i];
      return typeof v === 'string' && v.trim() !== '' ? { ...box, value: v.trim() } : box;
    });
  }
}

function applyTaskOverride(task: Task, field: TaskField, value: unknown): void {
  const record = task as unknown as Record<string, unknown>;
  if (TEXT_TASK_FIELDS.has(field)) {
    record[field] = value as Text;
  } else if (field === 'hints') {
    // Per hint: een variant kan alleen de tekst aanpassen; de prijs blijft dan die van het basisspel.
    const incoming = value as Partial<Hint>[];
    task.hints = incoming.map((h, i) => {
      const prev = task.hints[i];
      const hint: Hint = {
        cost: h.cost ?? prev?.cost ?? 0,
        text: h.text ?? prev?.text ?? {},
      };
      const image = h.image ?? prev?.image;
      if (image) hint.image = image;
      return hint;
    });
  } else if (field === 'trackLocations') {
    task.trackLocations = { ...(task.trackLocations ?? {}), ...(value as Task['trackLocations']) };
  } else {
    record[field] = value;
  }
}

// ---------------------------------------------------------------------------
// Controles
// ---------------------------------------------------------------------------

function selectorTasks(select: Selector): string[] {
  if ('task' in select) return [select.task];
  if ('tasks' in select) return select.tasks;
  return [];
}

function conditionTasks(c: Condition): string[] {
  switch (c.kind) {
    case 'completed':
    case 'correct':
    case 'incorrect':
      return selectorTasks(c.select);
    case 'afterCompleted':
      return [c.task];
    case 'and':
    case 'or':
      return c.conditions.flatMap(conditionTasks);
    case 'not':
      return conditionTasks(c.condition);
    default:
      return [];
  }
}

function conditionTags(c: Condition): string[] {
  switch (c.kind) {
    case 'completed':
    case 'correct':
    case 'incorrect':
      return 'tag' in c.select ? [c.select.tag] : [];
    case 'and':
    case 'or':
      return c.conditions.flatMap(conditionTags);
    case 'not':
      return conditionTags(c.condition);
    default:
      return [];
  }
}

/** Controleert een spelpakket op verwijzingen die nergens heen wijzen. */
export function validateGame(game: GamePackage): string[] {
  const issues: string[] = [];
  const taskIds = new Set<string>();
  for (const t of game.tasks) {
    if (taskIds.has(t.id)) issues.push(`opdracht ${t.id} komt dubbel voor`);
    taskIds.add(t.id);
  }
  const tags = new Set(game.tasks.flatMap((t) => t.tags));
  const sequences = new Set(game.sequences.map((s) => s.id));
  const endings = new Set(game.endings.map((e) => e.id));
  const playgrounds = new Set(game.playgrounds.map((p) => p.id));
  const ruleIds = new Set<string>();

  for (const seq of game.sequences) {
    for (const id of seq.tasks) if (!taskIds.has(id)) issues.push(`reeks ${seq.id}: onbekende opdracht ${id}`);
  }
  for (const rule of game.rules) {
    if (ruleIds.has(rule.id)) issues.push(`regel ${rule.id} komt dubbel voor`);
    ruleIds.add(rule.id);
    for (const id of conditionTasks(rule.when)) if (!taskIds.has(id)) issues.push(`regel ${rule.id}: onbekende opdracht ${id}`);
    for (const tag of conditionTags(rule.when)) if (!tags.has(tag)) issues.push(`regel ${rule.id}: geen opdrachten met tag ${tag}`);
    for (const action of rule.then) issues.push(...checkAction(rule.id, action, { taskIds, tags, sequences, endings, playgrounds }));
  }
  for (const p of game.playgrounds) {
    const r = p.reveal;
    if (!r) continue;
    if (!/^https:\/\/\S+$/.test(r.image)) issues.push(`playground ${p.id}: foto moet een https-adres zijn`);
    if (!(r.width > 0 && r.height > 0)) issues.push(`playground ${p.id}: afmetingen van de foto ontbreken`);
    r.pieces.forEach((piece, i) => {
      if (!taskIds.has(piece.task)) issues.push(`playground ${p.id}: vak ${i + 1} hoort bij onbekende opdracht ${piece.task}`);
      const inside = piece.x >= 0 && piece.y >= 0 && piece.w > 0 && piece.h > 0 && piece.x + piece.w <= r.width && piece.y + piece.h <= r.height;
      if (!inside) issues.push(`playground ${p.id}: vak ${i + 1} valt buiten de foto`);
    });
  }
  for (const p of game.playgrounds) {
    const c = p.code;
    if (!c) continue;
    c.boxes.forEach((box, i) => {
      if (!taskIds.has(box.task)) issues.push(`playground ${p.id}: vakje ${i + 1} hoort bij onbekende opdracht ${box.task}`);
      if (typeof box.value !== 'string') issues.push(`playground ${p.id}: vakje ${i + 1} heeft geen code`);
    });
    if (c.hint !== undefined && !taskIds.has(c.hint)) issues.push(`playground ${p.id}: hintveld hoort bij onbekende opdracht ${c.hint}`);
  }
  if (game.briefing !== undefined && !sequences.has(game.briefing)) issues.push(`speluitleg: onbekende reeks ${game.briefing}`);
  if (game.boundary) {
    const b = game.boundary;
    if (!Array.isArray(b.points) || b.points.length < 3) issues.push('speelveldgrens: minstens 3 punten nodig');
    else if (b.points.some((p) => [p, ...(p.curve ? [p.curve] : [])].some((q) => !(Math.abs(q.lat) <= 90 && Math.abs(q.lng) <= 180))))
      issues.push('speelveldgrens: ongeldig punt');
    if (b.color !== undefined && !/^#[0-9a-f]{6}$/i.test(b.color)) issues.push('speelveldgrens: kleur moet #rrggbb zijn');
  }
  const mr = game.meetingPoint?.radius;
  if (mr !== undefined && !(mr > 0 && mr <= 1000)) issues.push('verzamelpunt: straal moet tussen 0 en 1000 meter liggen');
  const hr = game.hunterAlert?.radius;
  if (game.hunterAlert !== undefined && !(typeof hr === 'number' && hr >= 0 && hr <= MAX_HUNTER_ALERT_RADIUS))
    issues.push(`hunter in de buurt: afstand moet tussen 0 en ${MAX_HUNTER_ALERT_RADIUS} meter liggen`);
  for (const t of game.tasks) {
    if (t.image !== undefined && !/^https:\/\/\S+$/.test(t.image)) issues.push(`opdracht ${t.id}: foto moet een https-adres zijn`);
    if (t.mapIcon !== undefined && !(MAP_ICONS as readonly string[]).includes(t.mapIcon)) issues.push(`opdracht ${t.id}: onbekend kaarticoon ${String(t.mapIcon)}`);
    if (t.mapLabel !== undefined && (t.mapLabel.trim() === '' || t.mapLabel.length > 3)) issues.push(`opdracht ${t.id}: kaarticoon mag 1 tot 3 tekens hebben`);
    t.hints.forEach((h, i) => {
      if (h.image !== undefined && !/^https:\/\/\S+$/.test(h.image)) issues.push(`opdracht ${t.id}: afbeelding bij hint ${i + 1} moet een https-adres zijn`);
    });
    if (t.answer.type === 'choice' && (t.answer.correct < 0 || t.answer.correct >= t.answer.options.length)) {
      issues.push(`opdracht ${t.id}: juiste optie bestaat niet`);
    }
  }
  return issues;
}

function checkAction(
  ruleId: string,
  action: Action,
  known: { taskIds: Set<string>; tags: Set<string>; sequences: Set<string>; endings: Set<string>; playgrounds: Set<string> },
): string[] {
  const issues: string[] = [];
  const checkSelect = (s: Selector) => {
    for (const id of selectorTasks(s)) if (!known.taskIds.has(id)) issues.push(`regel ${ruleId}: onbekende opdracht ${id}`);
    if ('tag' in s && !known.tags.has(s.tag)) issues.push(`regel ${ruleId}: geen opdrachten met tag ${s.tag}`);
  };
  switch (action.kind) {
    case 'show':
      checkSelect(action.select);
      if (typeof action.on === 'object' && !known.playgrounds.has(action.on.playground)) {
        issues.push(`regel ${ruleId}: onbekende playground ${action.on.playground}`);
      }
      break;
    case 'deactivate':
      checkSelect(action.select);
      break;
    case 'open':
      if (!known.taskIds.has(action.task)) issues.push(`regel ${ruleId}: onbekende opdracht ${action.task}`);
      break;
    case 'startSequence':
      if (!known.sequences.has(action.sequence)) issues.push(`regel ${ruleId}: onbekende reeks ${action.sequence}`);
      break;
    case 'end':
      if (!known.endings.has(action.ending)) issues.push(`regel ${ruleId}: onbekend einde ${action.ending}`);
      break;
    default:
      break;
  }
  return issues;
}

// ---------------------------------------------------------------------------
// Vertalingen
// ---------------------------------------------------------------------------

export interface MissingTranslation {
  /** Waar de tekst staat, bijvoorbeeld `opdracht puzzel-1 · hint 2`. */
  where: string;
  lang: Lang;
}

/**
 * Lijst van teksten die in een of meer talen van het spel nog ontbreken.
 * De beheeromgeving toont dit als "nog niet vertaald"; publiceren geeft een
 * waarschuwing zolang de lijst niet leeg is.
 */
export function missingTranslations(game: GamePackage, languages: Lang[] = game.languages): MissingTranslation[] {
  const missing: MissingTranslation[] = [];
  const check = (where: string, text: Text | undefined, required = true) => {
    if (!text) {
      if (required) for (const lang of languages) missing.push({ where, lang });
      return;
    }
    const hasAny = Object.values(text).some((v) => v && v.trim());
    if (!hasAny && !required) return;
    for (const lang of languages) if (!text[lang]?.trim()) missing.push({ where, lang });
  };

  check('spel · naam', game.name);
  for (const task of game.tasks) {
    const w = `opdracht ${task.id}`;
    check(`${w} · titel`, task.title);
    check(`${w} · tekst`, task.body, false);
    check(`${w} · bevestiging`, task.confirm, false);
    check(`${w} · commentaar goed`, task.correctComment, false);
    check(`${w} · commentaar fout`, task.wrongComment, false);
    task.hints.forEach((h, i) => check(`${w} · hint ${i + 1}`, h.text));
    if (task.answer.type === 'choice' || task.answer.type === 'multi') {
      task.answer.options.forEach((o, i) => check(`${w} · optie ${i + 1}`, o));
    }
  }
  for (const ending of game.endings) {
    check(`einde ${ending.id} · titel`, ending.title);
    check(`einde ${ending.id} · tekst`, ending.body, false);
  }
  for (const pg of game.playgrounds) check(`playground ${pg.id} · naam`, pg.name);
  for (const rule of game.rules) {
    for (const action of rule.then) if (action.kind === 'message') check(`regel ${rule.id} · bericht`, action.text);
  }
  if (game.meetingPoint) check('verzamelpunt · tekst', game.meetingPoint.text);
  return missing;
}
