/**
 * Wat zit er in een templateversie (een vastgezette versie van het
 * basisspel), en wat is er anders dan in de versie ervoor.
 */
import type { LayerRows } from './game-model';
import { tKey } from './i18n';

const TYPE_LABEL: Record<string, string> = {
  info: tKey('Info'),
  choice: tKey('Meerkeuze'),
  multi: tKey('Meerdere goed'),
  text: tKey('Tekst'),
  number: tKey('Getal'),
  photo: tKey('Foto'),
};

/** Namen van velden die een stad mag aanpassen. */
const FIELD_LABEL: Record<string, string> = {
  title: tKey('Titel'),
  body: tKey('Vraagtekst'),
  answer: tKey('Antwoord'),
  location: tKey('Locatie'),
  trackLocations: tKey('Locaties per track'),
  image: tKey('Foto'),
  hints: tKey('Hints'),
};

export interface VersionTask {
  key: string;
  title: string;
  /** Nederlandse sleutel voor t(), bijvoorbeeld "Meerkeuze". */
  type: string;
  points: number;
  /** Velden die een stad mag aanpassen (Nederlandse sleutels voor t()). */
  cityFields: string[];
  /** Ten opzichte van de vorige versie. */
  status: 'same' | 'new' | 'changed';
}

export interface VersionContents {
  tasks: VersionTask[];
  rules: number;
  locations: number;
  languages: string[];
  /** Is er met een vorige versie vergeleken? */
  compared: boolean;
  added: string[];
  changed: string[];
  removed: string[];
}

/** Alles van één opdracht in een versie, om te vergelijken. */
function fingerprint(rows: LayerRows, key: string): string {
  const task = rows.tasks.find((t) => t.key === key);
  if (!task) return '';
  const { id: _id, position: _p, ...rest } = task;
  const texts = rows.translations
    .filter((r) => r.entity === 'task' && r.entity_id === key)
    .map((r) => `${r.field}|${r.lang}|${r.text}`)
    .sort();
  const locs = rows.locations
    .filter((l) => l.task_id === task.id)
    .map((l) => `${l.track}|${l.lat}|${l.lng}|${l.radius}`)
    .sort();
  return JSON.stringify([rest, texts, locs]);
}

export function versionContents(rows: LayerRows, previous: LayerRows | null): VersionContents {
  const lang = rows.game.default_language;
  const title = (key: string) => {
    const list = rows.translations.filter((r) => r.entity === 'task' && r.entity_id === key && r.field === 'title');
    return (list.find((r) => r.lang === lang) ?? list[0])?.text || key;
  };
  const before = new Set(previous?.tasks.map((t) => t.key) ?? []);
  const tasks: VersionTask[] = [...rows.tasks]
    .sort((a, b) => a.position - b.position)
    .map((t) => {
      const status: VersionTask['status'] = !previous
        ? 'same'
        : !before.has(t.key)
          ? 'new'
          : fingerprint(rows, t.key) !== fingerprint(previous, t.key)
            ? 'changed'
            : 'same';
      return {
        key: t.key,
        title: title(t.key),
        type: TYPE_LABEL[String(t.answer?.type)] ?? String(t.answer?.type ?? ''),
        points: t.points,
        cityFields: rows.overridable
          .filter((o) => o.task_id === t.id && o.layers.includes('city'))
          .map((o) => FIELD_LABEL[o.field] ?? o.field),
        status,
      };
    });
  const now = new Set(rows.tasks.map((t) => t.key));
  return {
    tasks,
    rules: rows.rules.length,
    locations: rows.locations.length,
    languages: rows.game.languages ?? [],
    compared: previous !== null,
    added: tasks.filter((t) => t.status === 'new').map((t) => t.key),
    changed: tasks.filter((t) => t.status === 'changed').map((t) => t.key),
    removed: [...before].filter((k) => !now.has(k)),
  };
}
