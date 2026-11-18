'use client';
/**
 * Spellen lezen, importeren en publiceren via Supabase. De omzetting tussen
 * engine-model en rijen staat in game-model.ts.
 */
import { composeGame, type BaseGame, type GamePackage, type Variant } from '@hunt/engine';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  baseToRows,
  rowsToBase,
  rowsToVariant,
  variantToRows,
  type GameRow,
  type LayerRows,
  type TaskRow,
} from './game-model';
import { mediaPath } from './map-settings';
import { t as tr } from './i18n';

const GAME_COLUMNS = 'id, layer, slug, parent_id, languages, default_language, settings, base_version';

function check<T>(result: { data: T | null; error: { message: string } | null }): T {
  if (result.error) throw new Error(result.error.message);
  return result.data as T;
}

/** Alle rijen van één laag. */
export async function loadLayer(db: SupabaseClient, gameId: string): Promise<LayerRows> {
  const by = <T>(table: string, columns: string) =>
    db.from(table).select(columns).eq('game_id', gameId).then((r) => check<T[]>(r as never));
  const [game, tasks, locations, rules, playgrounds, overridable, overrides, translations] = await Promise.all([
    db.from('games').select(GAME_COLUMNS).eq('id', gameId).single().then((r) => check<GameRow>(r as never)),
    by<TaskRow>('tasks', 'id, key, position, answer, points, wrong_points, tags, hint_costs, has_confirm, retry_until_correct, settings'),
    by<LayerRows['locations'][number]>('task_locations', 'task_id, track, lat, lng, radius'),
    by<LayerRows['rules'][number]>('rules', 'key, position, label, condition, actions'),
    by<LayerRows['playgrounds'][number]>('playgrounds', 'key'),
    by<LayerRows['overridable'][number]>('overridable_fields', 'task_id, field, layers, label'),
    by<LayerRows['overrides'][number]>('overrides', 'task_id, field, value'),
    by<LayerRows['translations'][number]>('translations', 'entity, entity_id, field, lang, text'),
  ]);
  return { game, tasks, locations, rules, playgrounds, overridable, overrides, translations };
}

/**
 * Basisspel → (stad) → (klant): de keten tot en met dit spel. Is de stad
 * gekoppeld aan een vaste versie van het basisspel, dan staat die versie
 * vooraan in plaats van het basisspel zoals het nu is.
 */
export async function loadChain(db: SupabaseClient, gameId: string): Promise<LayerRows[]> {
  const chain: LayerRows[] = [];
  let id: string | null = gameId;
  while (id) {
    const layer = await loadLayer(db, id);
    chain.unshift(layer);
    id = layer.game.parent_id;
  }
  const city = chain.find((c) => c.game.layer === 'city');
  if (city && city.game.base_version != null && city.game.parent_id) {
    const snapshot = check<{ snapshot: LayerRows }>(
      (await db
        .from('base_versions')
        .select('snapshot')
        .eq('game_id', city.game.parent_id)
        .eq('version', city.game.base_version)
        .single()) as never,
    ).snapshot;
    chain[0] = snapshotToLayer(snapshot);
  }
  return chain;
}

/** Een vastgezette versie in dezelfde vorm als loadLayer, ook als er later kolommen bijkomen. */
export function snapshotToLayer(snapshot: LayerRows): LayerRows {
  return {
    ...snapshot,
    game: { ...snapshot.game, base_version: null },
    tasks: snapshot.tasks ?? [],
    locations: snapshot.locations ?? [],
    rules: snapshot.rules ?? [],
    playgrounds: snapshot.playgrounds ?? [],
    overridable: snapshot.overridable ?? [],
    overrides: snapshot.overrides ?? [],
    translations: snapshot.translations ?? [],
  };
}

// ---------------------------------------------------------------------------
// Versies van het basisspel
// ---------------------------------------------------------------------------

export interface BaseVersion {
  version: number;
  note: string | null;
  created_at: string;
}

/** De vastgezette versies van een basisspel, nieuwste eerst. */
export async function loadBaseVersions(db: SupabaseClient, baseId: string): Promise<BaseVersion[]> {
  return check<BaseVersion[]>(
    (await db
      .from('base_versions')
      .select('version, note, created_at')
      .eq('game_id', baseId)
      .order('version', { ascending: false })) as never,
  );
}

/** Zet het basisspel zoals het nu is vast als nieuwe versie. Geeft het versienummer. */
export async function createBaseVersion(db: SupabaseClient, baseId: string, note: string): Promise<number> {
  const row = check<{ version: number }>(await db.rpc('create_base_version', { p_game: baseId, p_note: note }));
  return row.version;
}

/** Koppelt een stad aan een versie van het basisspel (null: altijd de werkversie). */
export async function setCityBaseVersion(db: SupabaseClient, cityId: string, version: number | null): Promise<void> {
  check(await db.from('games').update({ base_version: version }).eq('id', cityId).select('id').single());
}

/** Stelt het spel samen zoals het gespeeld wordt. Gooit een CompositionError bij fouten. */
export function composeChain(chain: LayerRows[], version = 0): GamePackage {
  const [baseRows, ...variantRows] = chain;
  if (!baseRows) throw new Error(tr('Geen basisspel gevonden.'));
  const base = rowsToBase(baseRows);
  const variants = variantRows.map((rows) => rowsToVariant(rows, baseRows));
  const last = chain[chain.length - 1]!;
  return composeGame(base, variants, { id: last.game.slug, version });
}

export async function publish(db: SupabaseClient, gameId: string): Promise<number> {
  const pkg = composeChain(await loadChain(db, gameId));
  const row = check<{ version: number }>(await db.rpc('publish_game_version', { p_game: gameId, p_package: pkg }));
  return row.version;
}

// ---------------------------------------------------------------------------
// Importeren
// ---------------------------------------------------------------------------

export interface GameBundle {
  base: BaseGame;
  variants: Variant[];
}

async function insertLayer(db: SupabaseClient, rows: LayerRows, orgId: string, taskIds: Map<string, string>) {
  const { id: _ignore, ...game } = rows.game;
  const created = check<{ id: string }>(
    await db.from('games').insert({ ...game, org_id: orgId }).select('id').single(),
  );
  const gameId = created.id;

  if (rows.tasks.length > 0) {
    const inserted = check<{ id: string; key: string }[]>(
      await db
        .from('tasks')
        .insert(rows.tasks.map(({ id: _id, ...t }) => ({ ...t, game_id: gameId })))
        .select('id, key'),
    );
    for (const t of inserted) taskIds.set(t.key, t.id);
  }
  const task = (key: string | null) => (key === null ? null : (taskIds.get(key) ?? key));
  const insert = async (table: string, list: object[]) => {
    if (list.length > 0) check(await db.from(table).insert(list.map((r) => ({ ...r, game_id: gameId }))));
  };
  await insert('overridable_fields', rows.overridable.map((o) => ({ ...o, task_id: task(o.task_id) })));
  await insert('rules', rows.rules);
  await insert('playgrounds', rows.playgrounds);
  await insert('task_locations', rows.locations.map((l) => ({ ...l, task_id: task(l.task_id) })));
  await insert('overrides', rows.overrides.map((o) => ({ ...o, task_id: task(o.task_id) })));
  await insert('translations', rows.translations);
  return gameId;
}

/**
 * Zet een basisspel met stads- en klantvarianten in de database. Een
 * klantvariant komt onder de laatste stadsvariant ervoor. Mislukt er iets,
 * dan wordt wat al was aangemaakt weer verwijderd.
 */
export async function importBundle(db: SupabaseClient, orgId: string, bundle: GameBundle): Promise<string> {
  const created: string[] = [];
  const taskIds = new Map<string, string>();
  try {
    const baseId = await insertLayer(db, baseToRows(bundle.base, { id: '', slug: bundle.base.id }), orgId, taskIds);
    created.push(baseId);
    let city: string | null = null;
    for (const variant of bundle.variants) {
      const parent = variant.layer === 'city' ? baseId : (city ?? baseId);
      if (variant.layer === 'client' && !city) throw new Error(tr('Klantvariant {id} heeft geen stad ervoor.', { id: variant.id }));
      const rows = variantToRows(
        variant,
        { id: '', slug: variant.id, parent_id: parent, languages: bundle.base.languages, default_language: bundle.base.defaultLanguage },
        (key) => key,
      );
      const id = await insertLayer(db, rows, orgId, taskIds);
      created.push(id);
      if (variant.layer === 'city') city = id;
    }
    // Het geïmporteerde basisspel wordt versie 1, en elke stad begint daarop.
    await createBaseVersion(db, baseId, '');
    check(await db.from('games').update({ base_version: 1 }).eq('parent_id', baseId).eq('layer', 'city'));
    return baseId;
  } catch (err) {
    for (const id of created.reverse()) await db.from('games').delete().eq('id', id);
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Foto's van buiten (bijvoorbeeld Loquiz) naar de eigen opslag kopiëren
// ---------------------------------------------------------------------------

/** Staat de afbeelding al in onze eigen bucket media? */
export function isOwnMedia(url: string, publicBase: string): boolean {
  return url.startsWith(publicBase);
}

/**
 * Kopieert foto's bij opdrachten die nog naar een andere site wijzen naar de
 * bucket media, voor het basisspel en alle varianten eronder. Lukt dat voor
 * een foto niet (bijvoorbeeld omdat de site dat blokkeert), dan blijft het
 * oude adres staan en komt hij in `failed`.
 */
export async function copyExternalImages(db: SupabaseClient, baseId: string): Promise<{ copied: number; failed: string[] }> {
  const publicBase = db.storage.from('media').getPublicUrl('').data.publicUrl;
  const tasks = check<{ id: string; key: string; settings: Record<string, unknown> | null }[]>(
    (await db.from('tasks').select('id, key, settings').eq('game_id', baseId)) as never,
  );
  const keyById = new Map(tasks.map((t) => [t.id, t.key]));
  const cities = check<{ id: string }[]>((await db.from('games').select('id').eq('parent_id', baseId)) as never).map((g) => g.id);
  const clients = cities.length
    ? check<{ id: string }[]>((await db.from('games').select('id').in('parent_id', cities)) as never).map((g) => g.id)
    : [];
  const variants = [...cities, ...clients];
  const overrides = variants.length
    ? check<{ game_id: string; task_id: string; value: unknown }[]>(
        (await db.from('overrides').select('game_id, task_id, value').eq('field', 'image').in('game_id', variants)) as never,
      )
    : [];

  let copied = 0;
  const failed: string[] = [];
  const copy = async (url: string, gameId: string, key: string): Promise<string | null> => {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(String(res.status));
      const blob = await res.blob();
      const type = blob.type.split(';')[0] ?? '';
      const path = mediaPath(gameId, key.startsWith('playground-') ? key : `opdracht-${key}`, type);
      const up = await db.storage.from('media').upload(path, blob, { contentType: type });
      if (up.error) throw new Error(up.error.message);
      copied++;
      return db.storage.from('media').getPublicUrl(path).data.publicUrl;
    } catch {
      failed.push(`${key}: ${url}`);
      return null;
    }
  };

  for (const t of tasks) {
    const settings = { ...(t.settings ?? {}) };
    let changed = false;
    if (typeof settings.image === 'string' && !isOwnMedia(settings.image, publicBase)) {
      const next = await copy(settings.image, baseId, t.key);
      if (next) [settings.image, changed] = [next, true];
    }
    if (Array.isArray(settings.hintImages)) {
      const list = [...(settings.hintImages as unknown[])];
      for (const [i, url] of list.entries()) {
        if (typeof url !== 'string' || isOwnMedia(url, publicBase)) continue;
        const next = await copy(url, baseId, `${t.key}-hint-${i + 1}`);
        if (next) [list[i], changed] = [next, true];
      }
      settings.hintImages = list;
    }
    if (changed) check(await db.from('tasks').update({ settings }).eq('id', t.id));
  }
  // De foto van een playground die stukje voor stukje zichtbaar wordt (zoals het extractiepunt).
  const game = check<{ settings: Record<string, unknown> | null }>((await db.from('games').select('settings').eq('id', baseId).single()) as never);
  const reveals = { ...((game.settings?.playgroundReveal ?? {}) as Record<string, { image?: unknown }>) };
  let revealChanged = false;
  for (const [key, reveal] of Object.entries(reveals)) {
    if (typeof reveal.image !== 'string' || isOwnMedia(reveal.image, publicBase)) continue;
    const next = await copy(reveal.image, baseId, `playground-${key}`);
    if (next) [reveals[key], revealChanged] = [{ ...reveal, image: next }, true];
  }
  if (revealChanged) check(await db.from('games').update({ settings: { ...game.settings, playgroundReveal: reveals } }).eq('id', baseId));

  for (const o of overrides) {
    if (typeof o.value !== 'string' || isOwnMedia(o.value, publicBase)) continue;
    const key = keyById.get(o.task_id) ?? o.task_id;
    const next = await copy(o.value, o.game_id, key);
    if (next) {
      check(await db.from('overrides').update({ value: next }).eq('game_id', o.game_id).eq('task_id', o.task_id).eq('field', 'image'));
    }
  }
  return { copied, failed };
}
