// Opmaak van de resultaten voor export (fotoboek, low-code tools, Excel).
// Zonder afhankelijkheden, zodat het zowel in de edge function (Deno) als in tests (Node) draait.

export interface ResultPhoto {
  task: string;
  path: string;
  taken_at: string;
  url?: string;
}

export interface ResultTeam {
  rank: number;
  id: string;
  name: string;
  track: number;
  language: string;
  score: number;
  outcome: string | null;
  started_at: string | null;
  ended_at: string | null;
  duration_seconds: number | null;
  distance_m: number;
  photos: ResultPhoto[];
}

export interface SessionResults {
  session: { id: string; name: string; starts_at: string | null; organization: string; logo_path: string | null };
  teams: ResultTeam[];
}

/** 3780 → "63:00" */
export function formatDuration(seconds: number | null): string {
  if (seconds === null || seconds < 0) return '';
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

function csvCell(value: unknown): string {
  const text = value === null || value === undefined ? '' : String(value);
  return /[";\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/**
 * CSV met puntkomma's (opent direct goed in Nederlandse Excel), één rij per team.
 * Foto-links staan in aparte kolommen, zodat een fotoboek-tool ze per team kan ophalen.
 */
export function resultsToCsv(results: SessionResults): string {
  const maxPhotos = Math.max(0, ...results.teams.map((t) => t.photos.length));
  const header = [
    'plaats', 'team', 'punten', 'speeltijd', 'speeltijd_seconden', 'afstand_km', 'uitkomst', 'track', 'taal',
    ...Array.from({ length: maxPhotos }, (_, i) => `foto_${i + 1}`),
  ];
  const rows = results.teams.map((t) => [
    t.rank, t.name, t.score, formatDuration(t.duration_seconds), t.duration_seconds ?? '',
    (t.distance_m / 1000).toFixed(2).replace('.', ','), t.outcome ?? '', t.track, t.language,
    ...Array.from({ length: maxPhotos }, (_, i) => t.photos[i]?.url ?? t.photos[i]?.path ?? ''),
  ]);
  return '﻿' + [header, ...rows].map((r) => r.map(csvCell).join(';')).join('\r\n') + '\r\n';
}
