/**
 * Omzetten tussen het gelaagde spelmodel van de engine (BaseGame, Variant) en
 * de rijen in de database (games, tasks, task_locations, rules, playgrounds,
 * overridable_fields, overrides, translations).
 *
 * Alle teksten staan in `translations`, één rij per taal. Zo kan het
 * vertaalscherm alles naast elkaar zetten, en houdt de database een stad of
 * klant tegen die een tekst wil wijzigen die niet aanpasbaar is.
 */
import { MAP_ICONS } from '@hunt/engine';
import type {
  Action,
  AnswerSpec,
  BaseGame,
  Ending,
  FieldRef,
  GameField,
  LatLng,
  MapOverlay,
  MapIcon,
  MapSource,
  PlayBoundary,
  MeetingPoint,
  Playground,
  PlaygroundReveal,
  OverridableField,
  Override,
  Rule,
  Sequence,
  Task,
  TaskField,
  TaskLocation,
  Text,
  Variant,
} from '@hunt/engine';

// ---------------------------------------------------------------------------
// Rijen zoals in de database (zonder id's die de database zelf maakt)
// ---------------------------------------------------------------------------

export type Layer = 'base' | 'city' | 'client';

export interface GameRow {
  id: string;
  layer: Layer;
  slug: string;
  parent_id: string | null;
  languages: string[];
  default_language: string;
  settings: Record<string, unknown>;
  /** Alleen bij een stad: de versie van het basisspel waar die op voortbouwt (null: de werkversie). */
  base_version?: number | null;
}

export interface TaskRow {
  id: string;
  key: string;
  position: number;
  answer: Record<string, unknown>;
  points: number;
  wrong_points: number;
  tags: string[];
  hint_costs: number[];
  has_confirm: boolean;
  retry_until_correct: boolean;
  /** Overige instellingen, zoals de foto bij de tekst (image). */
  settings?: Record<string, unknown>;
}

export interface LocationRow {
  task_id: string;
  track: number | null;
  lat: number;
  lng: number;
  radius: number;
}

export interface RuleRow {
  key: string;
  position: number;
  label: string | null;
  condition: unknown;
  actions: unknown[];
}

export interface PlaygroundRow {
  key: string;
}

export interface OverridableRow {
  task_id: string | null;
  field: string;
  layers: Layer[];
  label: string | null;
}

export interface OverrideRow {
  task_id: string | null;
  field: string;
  value: unknown;
}

export interface TranslationRow {
  entity: 'game' | 'task' | 'rule' | 'ending' | 'playground';
  entity_id: string;
  field: string;
  lang: string;
  text: string;
}

/** Alles van één laag (basisspel, stad of klant). */
export interface LayerRows {
  game: GameRow;
  tasks: TaskRow[];
  locations: LocationRow[];
  rules: RuleRow[];
  playgrounds: PlaygroundRow[];
  overridable: OverridableRow[];
  overrides: OverrideRow[];
  translations: TranslationRow[];
}

/** Wat in games.settings van een basisspel staat. */
interface BaseSettings {
  sequences: Sequence[];
  endings: { id: string; bonus: number }[];
  playgrounds: string[];
  /** Foto die stukje voor stukje zichtbaar wordt, per playground. */
  playgroundReveal?: Record<string, PlaygroundReveal>;
  gps: BaseGame['gps'];
  meetingPoint?: LatLng & { radius?: number };
  mapOverlay?: MapOverlay;
  map?: MapSource;
  boundary?: PlayBoundary;
  briefing?: string;
}

const TASK_TEXT_FIELDS = ['title', 'body', 'confirm', 'correctComment', 'wrongComment'] as const;
const GAME_VALUE_FIELDS: GameField[] = ['meetingPoint', 'mapOverlay', 'map', 'boundary'];

// ---------------------------------------------------------------------------
// Teksten
// ---------------------------------------------------------------------------

class TextBag {
  private readonly map = new Map<string, Text>();

  constructor(rows: readonly TranslationRow[] = []) {
    for (const r of rows) this.add(r.entity, r.entity_id, r.field, r.lang, r.text);
  }

  private static key(entity: string, id: string, field: string) {
    return `${entity}\u0000${id}\u0000${field}`;
  }

  add(entity: string, id: string, field: string, lang: string, text: string) {
    const k = TextBag.key(entity, id, field);
    const value = this.map.get(k) ?? {};
    value[lang] = text;
    this.map.set(k, value);
  }

  get(entity: string, id: string, field: string): Text | undefined {
    return this.map.get(TextBag.key(entity, id, field));
  }

  has(entity: string, id: string, field: string) {
    return this.map.has(TextBag.key(entity, id, field));
  }
}

function pushText(out: TranslationRow[], entity: TranslationRow['entity'], id: string, field: string, text: Text | undefined) {
  if (!text) return;
  for (const [lang, value] of Object.entries(text)) {
    if (typeof value === 'string' && value !== '') out.push({ entity, entity_id: id, field, lang, text: value });
  }
}

// ---------------------------------------------------------------------------
// Antwoord: optieteksten apart, de rest in tasks.answer
// ---------------------------------------------------------------------------

export function answerToRow(answer: AnswerSpec): { answer: Record<string, unknown>; options: Text[] } {
  if (answer.type === 'choice' || answer.type === 'multi') {
    const { options, ...rest } = answer;
    return { answer: { ...rest, optionCount: options.length }, options };
  }
  return { answer: { ...answer }, options: [] };
}

function answerFromRow(row: Record<string, unknown>, texts: TextBag, key: string): AnswerSpec {
  const { optionCount, ...rest } = row as { optionCount?: number } & Record<string, unknown>;
  if (rest.type === 'choice' || rest.type === 'multi') {
    const count = typeof optionCount === 'number' ? optionCount : 0;
    const options = Array.from({ length: count }, (_, i) => texts.get('task', key, `option.${i}`) ?? {});
    return { ...rest, options } as AnswerSpec;
  }
  return rest as AnswerSpec;
}

// ---------------------------------------------------------------------------
// Regels: berichtteksten apart
// ---------------------------------------------------------------------------

export function actionsToRow(rule: Rule, out: TranslationRow[]): unknown[] {
  return rule.then.map((action, i) => {
    if (action.kind !== 'message') return action;
    pushText(out, 'rule', rule.id, `message.${i}`, action.text);
    return { kind: 'message' };
  });
}

function actionsFromRow(row: RuleRow, texts: TextBag): Action[] {
  return (row.actions as Action[]).map((action, i) =>
    action.kind === 'message' ? { kind: 'message', text: texts.get('rule', row.key, `message.${i}`) ?? {} } : action,
  );
}

// ---------------------------------------------------------------------------
// Basisspel
// ---------------------------------------------------------------------------

/**
 * Basisspel → rijen. Opdracht-id's in de rijen zijn de opdrachtsleutels; bij
 * het opslaan vervangt `withTaskIds` ze door de echte database-id's.
 */
export function baseToRows(base: BaseGame, game: Omit<GameRow, 'languages' | 'default_language' | 'settings' | 'layer' | 'parent_id'>): LayerRows {
  const translations: TranslationRow[] = [];
  pushText(translations, 'game', '', 'name', base.name);

  const tasks: TaskRow[] = [];
  const locations: LocationRow[] = [];
  base.tasks.forEach((task, position) => {
    const { answer, options } = answerToRow(task.answer);
    options.forEach((o, i) => pushText(translations, 'task', task.id, `option.${i}`, o));
    for (const field of TASK_TEXT_FIELDS) pushText(translations, 'task', task.id, field, task[field]);
    task.hints.forEach((h, i) => pushText(translations, 'task', task.id, `hint.${i}`, h.text));
    tasks.push({
      id: task.id,
      key: task.id,
      position,
      answer,
      points: task.points,
      wrong_points: task.wrongPoints ?? 0,
      tags: task.tags,
      hint_costs: task.hints.map((h) => h.cost),
      has_confirm: task.confirm !== undefined,
      retry_until_correct: task.retryUntilCorrect ?? false,
      settings: taskSettings(task),
    });
    if (task.location) locations.push({ task_id: task.id, track: null, ...pickLocation(task.location) });
    for (const [track, loc] of Object.entries(task.trackLocations ?? {})) {
      locations.push({ task_id: task.id, track: Number(track), ...pickLocation(loc) });
    }
  });

  const rules: RuleRow[] = base.rules.map((rule, position) => ({
    key: rule.id,
    position,
    label: rule.label ?? null,
    condition: rule.when,
    actions: actionsToRow(rule, translations),
  }));

  for (const e of base.endings) {
    pushText(translations, 'ending', e.id, 'title', e.title);
    pushText(translations, 'ending', e.id, 'body', e.body);
  }
  for (const p of base.playgrounds) {
    pushText(translations, 'playground', p.id, 'name', p.name);
    if (p.body) pushText(translations, 'playground', p.id, 'body', p.body);
  }

  const settings: BaseSettings = {
    sequences: base.sequences,
    endings: base.endings.map((e) => ({ id: e.id, bonus: e.bonus })),
    playgrounds: base.playgrounds.map((p) => p.id),
    gps: base.gps,
  };
  if (base.meetingPoint) {
    const { text, ...point } = base.meetingPoint;
    settings.meetingPoint = point;
    pushText(translations, 'game', '', 'meetingPoint', text);
  }
  if (base.mapOverlay) settings.mapOverlay = base.mapOverlay;
  if (base.map) settings.map = base.map;
  if (base.boundary) settings.boundary = base.boundary;
  if (base.briefing) settings.briefing = base.briefing;
  const reveal = Object.fromEntries(base.playgrounds.filter((p) => p.reveal).map((p) => [p.id, p.reveal!]));
  if (Object.keys(reveal).length) settings.playgroundReveal = reveal;

  return {
    game: {
      ...game,
      layer: 'base',
      parent_id: null,
      languages: base.languages,
      default_language: base.defaultLanguage,
      settings: settings as unknown as Record<string, unknown>,
    },
    tasks,
    locations,
    rules,
    playgrounds: base.playgrounds.map((p) => ({ key: p.id })),
    overridable: base.overridable.map((o) => ({
      task_id: 'task' in o.target ? o.target.task : null,
      field: 'task' in o.target ? o.target.field : o.target.game,
      layers: o.layers,
      label: o.label ?? null,
    })),
    overrides: [],
    translations,
  };
}

function pickLocation(loc: TaskLocation) {
  return { lat: loc.lat, lng: loc.lng, radius: loc.radius };
}

/** Rijen van het basisspel → BaseGame. */
export function rowsToBase(rows: LayerRows): BaseGame {
  const texts = new TextBag(rows.translations);
  const settings = rows.game.settings as unknown as BaseSettings;
  const keyById = new Map(rows.tasks.map((t) => [t.id, t.key]));

  const tasks: Task[] = [...rows.tasks]
    .sort((a, b) => a.position - b.position || a.key.localeCompare(b.key))
    .map((row) => {
      const task: Task = {
        id: row.key,
        title: texts.get('task', row.key, 'title') ?? {},
        body: texts.get('task', row.key, 'body') ?? {},
        answer: answerFromRow(row.answer, texts, row.key),
        points: row.points,
        tags: row.tags,
        hints: row.hint_costs.map((cost, i) => ({ cost, text: texts.get('task', row.key, `hint.${i}`) ?? {} })),
      };
      if (row.wrong_points !== 0) task.wrongPoints = row.wrong_points;
      if (row.has_confirm) task.confirm = texts.get('task', row.key, 'confirm') ?? {};
      if (row.retry_until_correct) task.retryUntilCorrect = true;
      if (typeof row.settings?.image === 'string') task.image = row.settings.image;
      if (typeof row.settings?.mapLabel === 'string') task.mapLabel = row.settings.mapLabel;
      if ((MAP_ICONS as readonly unknown[]).includes(row.settings?.mapIcon)) task.mapIcon = row.settings!.mapIcon as MapIcon;
      const hintImages = row.settings?.hintImages;
      if (Array.isArray(hintImages)) {
        task.hints.forEach((h, i) => {
          if (typeof hintImages[i] === 'string') h.image = hintImages[i];
        });
      }
      for (const field of ['correctComment', 'wrongComment'] as const) {
        const value = texts.get('task', row.key, field);
        if (value) task[field] = value;
      }
      for (const loc of rows.locations.filter((l) => l.task_id === row.id)) {
        const value = pickLocation(loc);
        if (loc.track === null) task.location = value;
        else task.trackLocations = { ...(task.trackLocations ?? {}), [loc.track]: value };
      }
      return task;
    });

  const rules: Rule[] = [...rows.rules]
    .sort((a, b) => a.position - b.position)
    .map((row) => {
      const rule: Rule = { id: row.key, when: row.condition as Rule['when'], then: actionsFromRow(row, texts) };
      if (row.label) rule.label = row.label;
      return rule;
    });

  const endings: Ending[] = (settings.endings ?? []).map((e) => ({
    id: e.id,
    title: texts.get('ending', e.id, 'title') ?? {},
    body: texts.get('ending', e.id, 'body') ?? {},
    bonus: e.bonus,
  }));

  const playgroundKeys = settings.playgrounds ?? rows.playgrounds.map((p) => p.key);
  const base: BaseGame = {
    id: rows.game.slug,
    name: texts.get('game', '', 'name') ?? {},
    languages: rows.game.languages,
    defaultLanguage: rows.game.default_language,
    gps: settings.gps ?? { maxAccuracy: 30 },
    tasks,
    rules,
    sequences: settings.sequences ?? [],
    endings,
    playgrounds: playgroundKeys.map((key) => {
      const p: Playground = { id: key, name: texts.get('playground', key, 'name') ?? {} };
      const body = texts.get('playground', key, 'body');
      if (body && Object.keys(body).length) p.body = body;
      const reveal = settings.playgroundReveal?.[key];
      if (reveal) p.reveal = reveal;
      return p;
    }),
    overridable: rows.overridable.map((o): OverridableField => {
      const target: FieldRef = o.task_id
        ? { task: keyById.get(o.task_id) ?? o.task_id, field: o.field as TaskField }
        : { game: o.field as GameField };
      const field: OverridableField = { target, layers: o.layers.filter((l): l is 'city' | 'client' => l !== 'base') };
      if (o.label) field.label = o.label;
      return field;
    }),
  };
  if (settings.meetingPoint) {
    base.meetingPoint = { ...settings.meetingPoint, text: texts.get('game', '', 'meetingPoint') ?? {} };
  }
  if (settings.mapOverlay) base.mapOverlay = settings.mapOverlay;
  if (settings.map) base.map = settings.map;
  if (settings.boundary) base.boundary = settings.boundary;
  if (settings.briefing) base.briefing = settings.briefing;
  return base;
}

// ---------------------------------------------------------------------------
// Varianten (stad en klant)
// ---------------------------------------------------------------------------

/**
 * Variant → rijen. `taskId` zet een opdrachtsleutel om naar het id van de
 * opdracht in het basisspel.
 */
export function variantToRows(
  variant: Variant,
  game: Omit<GameRow, 'settings' | 'layer'>,
  taskId: (key: string) => string,
): LayerRows {
  const translations: TranslationRow[] = [];
  const overrides: OverrideRow[] = [];
  const locations: LocationRow[] = [];

  for (const o of variant.overrides) {
    if ('game' in o.target) {
      if (o.target.game === 'name') pushText(translations, 'game', '', 'name', o.value as Text);
      else overrides.push({ task_id: null, field: o.target.game, value: o.value });
      continue;
    }
    const { task, field } = o.target;
    if ((TASK_TEXT_FIELDS as readonly string[]).includes(field)) {
      pushText(translations, 'task', task, field, o.value as Text);
    } else if (field === 'hints') {
      (o.value as { text?: Text }[]).forEach((h, i) => pushText(translations, 'task', task, `hint.${i}`, h.text));
    } else if (field === 'location') {
      locations.push({ task_id: taskId(task), track: null, ...pickLocation(o.value as TaskLocation) });
    } else if (field === 'trackLocations') {
      for (const [track, loc] of Object.entries(o.value as Record<string, TaskLocation>)) {
        locations.push({ task_id: taskId(task), track: Number(track), ...pickLocation(loc) });
      }
    } else {
      overrides.push({ task_id: taskId(task), field, value: o.value });
    }
  }

  const settings: Record<string, unknown> = { name: variant.name };
  return {
    game: { ...game, layer: variant.layer, settings },
    tasks: [],
    locations,
    rules: [],
    playgrounds: [],
    overridable: [],
    overrides,
    translations,
  };
}

/**
 * Rijen van een stad of klant → Variant. Heeft de rijen van het basisspel
 * nodig om opdrachtsleutels en hint-aantallen te kennen.
 */
export function rowsToVariant(rows: LayerRows, base: LayerRows): Variant {
  const texts = new TextBag(rows.translations);
  const taskById = new Map(base.tasks.map((t) => [t.id, t]));
  const overrides: Override[] = [];

  // Teksten per opdracht en veld (alle talen samen).
  const seen = new Set<string>();
  for (const r of rows.translations) {
    const id = `${r.entity}|${r.entity_id}|${r.field.startsWith('hint.') ? 'hints' : r.field}`;
    if (seen.has(id)) continue;
    seen.add(id);
    if (r.entity === 'game' && r.field === 'name') {
      overrides.push({ target: { game: 'name' }, value: texts.get('game', '', 'name') });
    } else if (r.entity === 'task' && r.field.startsWith('hint.')) {
      const count = Math.max(
        base.tasks.find((t) => t.key === r.entity_id)?.hint_costs.length ?? 0,
        ...rows.translations
          .filter((x) => x.entity === 'task' && x.entity_id === r.entity_id && x.field.startsWith('hint.'))
          .map((x) => Number(x.field.slice(5)) + 1),
      );
      const hints = Array.from({ length: count }, (_, i) => {
        const text = texts.get('task', r.entity_id, `hint.${i}`);
        return text ? { text } : {};
      });
      overrides.push({ target: { task: r.entity_id, field: 'hints' }, value: hints });
    } else if (r.entity === 'task') {
      overrides.push({ target: { task: r.entity_id, field: r.field as TaskField }, value: texts.get('task', r.entity_id, r.field) });
    }
  }

  for (const o of rows.overrides) {
    if (o.task_id === null) overrides.push({ target: { game: o.field as GameField }, value: o.value });
    else overrides.push({ target: { task: taskById.get(o.task_id)?.key ?? o.task_id, field: o.field as TaskField }, value: o.value });
  }

  const tracks = new Map<string, Record<number, TaskLocation>>();
  for (const loc of rows.locations) {
    const key = taskById.get(loc.task_id)?.key ?? loc.task_id;
    if (loc.track === null) overrides.push({ target: { task: key, field: 'location' }, value: pickLocation(loc) });
    else tracks.set(key, { ...(tracks.get(key) ?? {}), [loc.track]: pickLocation(loc) });
  }
  for (const [key, value] of tracks) overrides.push({ target: { task: key, field: 'trackLocations' }, value });

  return {
    id: rows.game.slug,
    layer: rows.game.layer === 'client' ? 'client' : 'city',
    name: (rows.game.settings.name as Text | undefined) ?? { nl: rows.game.slug },
    overrides,
  };
}

export const GAME_FIELDS = GAME_VALUE_FIELDS;
export type { MeetingPoint };

/** Overige opdrachtvelden in tasks.settings: foto bij de tekst en afbeeldingen bij hints. */
export function taskSettings(task: Task, settings: Record<string, unknown> = {}): Record<string, unknown> {
  const { image: _i, hintImages: _h, mapLabel: _m, mapIcon: _mi, ...rest } = settings;
  const out: Record<string, unknown> = { ...rest };
  if (task.image) out.image = task.image;
  if (task.mapLabel) out.mapLabel = task.mapLabel;
  if (task.mapIcon) out.mapIcon = task.mapIcon;
  if (task.hints.some((h) => h.image)) out.hintImages = task.hints.map((h) => h.image ?? null);
  return out;
}
