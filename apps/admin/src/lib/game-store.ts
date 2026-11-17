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

const GAME_COLUMNS = 'id, layer, slug, parent_id, languages, default_language, settings';

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
    by<TaskRow>('tasks', 'id, key, position, answer, points, wrong_points, tags, hint_costs, has_confirm, retry_until_correct'),
    by<LayerRows['locations'][number]>('task_locations', 'task_id, track, lat, lng, radius'),
    by<LayerRows['rules'][number]>('rules', 'key, position, label, condition, actions'),
    by<LayerRows['playgrounds'][number]>('playgrounds', 'key'),
    by<LayerRows['overridable'][number]>('overridable_fields', 'task_id, field, layers, label'),
    by<LayerRows['overrides'][number]>('overrides', 'task_id, field, value'),
    by<LayerRows['translations'][number]>('translations', 'entity, entity_id, field, lang, text'),
  ]);
  return { game, tasks, locations, rules, playgrounds, overridable, overrides, translations };
}

/** Basisspel → (stad) → (klant): de keten tot en met dit spel. */
export async function loadChain(db: SupabaseClient, gameId: string): Promise<LayerRows[]> {
  const chain: LayerRows[] = [];
  let id: string | null = gameId;
  while (id) {
    const layer = await loadLayer(db, id);
    chain.unshift(layer);
    id = layer.game.parent_id;
  }
  return chain;
}

/** Stelt het spel samen zoals het gespeeld wordt. Gooit een CompositionError bij fouten. */
export function composeChain(chain: LayerRows[], version = 0): GamePackage {
  const [baseRows, ...variantRows] = chain;
  if (!baseRows) throw new Error('Geen basisspel gevonden.');
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
      if (variant.layer === 'client' && !city) throw new Error(`Klantvariant ${variant.id} heeft geen stad ervoor.`);
      const rows = variantToRows(
        variant,
        { id: '', slug: variant.id, parent_id: parent, languages: bundle.base.languages, default_language: bundle.base.defaultLanguage },
        (key) => key,
      );
      const id = await insertLayer(db, rows, orgId, taskIds);
      created.push(id);
      if (variant.layer === 'city') city = id;
    }
    return baseId;
  } catch (err) {
    for (const id of created.reverse()) await db.from('games').delete().eq('id', id);
    throw err;
  }
}
