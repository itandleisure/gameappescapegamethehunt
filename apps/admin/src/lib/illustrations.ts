/**
 * Vaste illustraties bij opdrachten, zoals de uitleg "Extractiepunt".
 *
 * Een opdracht met `illustration: '<naam>'` toont als foto de tekening
 * public/illustraties/<naam>.png van de beheeromgeving. Bij het publiceren
 * zet de beheeromgeving die tekening in de bucket media van het spel en zet
 * het adres als foto in het spelpakket. Zo is het een gewone foto voor de
 * speler-app (ook in de app op de telefoon, en offline).
 *
 * Verandert een tekening, verhoog dan ILLUSTRATION_VERSION: dan krijgt elk
 * spel bij het volgende publiceren de nieuwe.
 */
import type { GamePackage } from '@hunt/engine';
import type { SupabaseClient } from '@supabase/supabase-js';

/** De tekeningen die er zijn (bestanden in public/illustraties). */
export const ILLUSTRATIONS = ['extractiepunt'] as const;
export type Illustration = (typeof ILLUSTRATIONS)[number];
export const ILLUSTRATION_VERSION = 1;

export function isIllustration(value: unknown): value is Illustration {
  return (ILLUSTRATIONS as readonly unknown[]).includes(value);
}

/** Adres van de tekening in de beheeromgeving zelf. */
export const illustrationSource = (name: Illustration) => `/illustraties/${name}.png`;

/** Pad in de bucket media; per spel, zodat de toegangsregels van het spel gelden. */
export function illustrationPath(gameId: string, name: Illustration): string {
  return `${gameId}/illustratie-${name}-v${ILLUSTRATION_VERSION}.png`;
}

/** Zet de foto's bij de opdrachten met een illustratie. */
export function applyIllustrations(pkg: GamePackage, urls: Partial<Record<Illustration, string>>): GamePackage {
  return {
    ...pkg,
    tasks: pkg.tasks.map((t) => (t.illustration && urls[t.illustration as Illustration] ? { ...t, image: urls[t.illustration as Illustration] } : t)),
  };
}

/**
 * Zorgt bij het publiceren voor de illustraties in de bucket media en zet ze
 * in het pakket. Lukt dat niet (bijvoorbeeld buiten de browser), dan blijft de
 * gewone foto van de opdracht staan.
 */
export async function withIllustrations(db: SupabaseClient, gameId: string, pkg: GamePackage): Promise<GamePackage> {
  if (typeof window === 'undefined') return pkg;
  const names = [...new Set(pkg.tasks.map((t) => t.illustration).filter(isIllustration))];
  const urls: Partial<Record<Illustration, string>> = {};
  for (const name of names) {
    const path = illustrationPath(gameId, name);
    const url = db.storage.from('media').getPublicUrl(path).data.publicUrl;
    try {
      const head = await fetch(url, { method: 'HEAD', cache: 'no-store' }).catch(() => null);
      if (!head?.ok) {
        const res = await fetch(illustrationSource(name));
        if (!res.ok) throw new Error(String(res.status));
        const up = await db.storage.from('media').upload(path, await res.blob(), { contentType: 'image/png', upsert: true });
        if (up.error) throw new Error(up.error.message);
      }
      urls[name] = url;
    } catch (err) {
      console.warn(`Illustratie ${name} niet gezet:`, err);
    }
  }
  return applyIllustrations(pkg, urls);
}
