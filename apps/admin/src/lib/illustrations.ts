/**
 * Vaste illustraties bij opdrachten, zoals de infographics van de speluitleg.
 *
 * Een opdracht met `illustration: '<naam>'` toont als foto een tekening uit
 * public/illustraties van de beheeromgeving. Bij het publiceren zet de
 * beheeromgeving die tekening in de bucket media van het spel en zet het adres
 * als foto in het spelpakket. Zo is het een gewone foto voor de speler-app (ook
 * in de app op de telefoon, en offline).
 *
 * Er zijn twee soorten:
 * - zonder tekst (zoals 'extractiepunt'): één bestand <naam>.png voor elke taal;
 * - met tekst (de infographics 'uitleg-…'): één bestand per taal in de map
 *   <naam>/<taal>.png. Het pakket krijgt dan `images` met een adres per taal
 *   van het spel, en `image` in de standaardtaal. Ontbreekt een taal, dan
 *   krijgt die het Nederlandse bestand.
 *
 * Verandert een tekening, verhoog dan ILLUSTRATION_VERSION: dan krijgt elk
 * spel bij het volgende publiceren de nieuwe.
 */
import type { GamePackage } from '@hunt/engine';
import type { SupabaseClient } from '@supabase/supabase-js';
import { tKey } from './i18n';

/** De infographics van de speluitleg, in de volgorde van de uitleg. */
export const INFOGRAPHICS = [
  'uitleg-speluitleg',
  'uitleg-speelveld',
  'uitleg-rugtas',
  'uitleg-gameapp',
  'uitleg-puzzels',
  'uitleg-extractiepunt',
  'uitleg-hunters-zien-jullie',
  'uitleg-hunters-in-de-buurt',
  'uitleg-gepakt',
  'uitleg-tijdlijn',
  'uitleg-belangrijk',
  'uitleg-batterij',
  'uitleg-start',
] as const;

/** De tekeningen die er zijn (bestanden in public/illustraties). */
export const ILLUSTRATIONS = ['extractiepunt', ...INFOGRAPHICS] as const;
export type Illustration = (typeof ILLUSTRATIONS)[number];
export const ILLUSTRATION_VERSION = 2;

/** De talen waarin de infographics bestaan (map public/illustraties/<naam>). */
export const INFOGRAPHIC_LANGUAGES = [
  'nl', 'en', 'de', 'fr', 'es', 'it', 'pt', 'da', 'sv', 'no', 'fi', 'pl', 'cs',
  'sk', 'hu', 'ro', 'bg', 'el', 'hr', 'sl', 'et', 'lv', 'lt', 'ga', 'mt',
] as const;

/** Naam van elke tekening in de beheeromgeving (wordt vertaald). */
export const ILLUSTRATION_LABELS: Record<Illustration, string> = {
  extractiepunt: tKey('Extractiepunt (zonder tekst)'),
  'uitleg-speluitleg': tKey('Infographic: Speluitleg'),
  'uitleg-speelveld': tKey('Infographic: Speelveld'),
  'uitleg-rugtas': tKey('Infographic: Rugtas'),
  'uitleg-gameapp': tKey('Infographic: Gameapp'),
  'uitleg-puzzels': tKey('Infographic: Puzzels oplossen'),
  'uitleg-extractiepunt': tKey('Infographic: Extractiepunt'),
  'uitleg-hunters-zien-jullie': tKey('Infographic: Hunters zien jullie'),
  'uitleg-hunters-in-de-buurt': tKey('Infographic: Hunters in de buurt'),
  'uitleg-gepakt': tKey('Infographic: Word je gepakt?'),
  'uitleg-tijdlijn': tKey('Infographic: Tijdlijn puzzels'),
  'uitleg-belangrijk': tKey('Infographic: Belangrijk'),
  'uitleg-batterij': tKey('Infographic: Batterij leeg?'),
  'uitleg-start': tKey('Infographic: Start van het spel'),
};

export function isIllustration(value: unknown): value is Illustration {
  return (ILLUSTRATIONS as readonly unknown[]).includes(value);
}

/** Heeft de tekening tekst, en dus een bestand per taal? */
export function isLocalized(name: Illustration): boolean {
  return (INFOGRAPHICS as readonly string[]).includes(name);
}

/** De taal waarvan het bestand gebruikt wordt: de taal zelf, of anders Nederlands. */
export function fileLanguage(lang: string): string {
  return (INFOGRAPHIC_LANGUAGES as readonly string[]).includes(lang) ? lang : 'nl';
}

/** Adres van de tekening in de beheeromgeving zelf. */
export function illustrationSource(name: Illustration, lang = 'nl'): string {
  return isLocalized(name) ? `/illustraties/${name}/${fileLanguage(lang)}.png` : `/illustraties/${name}.png`;
}

/** Pad in de bucket media; per spel, zodat de toegangsregels van het spel gelden. */
export function illustrationPath(gameId: string, name: Illustration, lang = 'nl'): string {
  return isLocalized(name)
    ? `${gameId}/illustratie-${name}-${fileLanguage(lang)}-v${ILLUSTRATION_VERSION}.png`
    : `${gameId}/illustratie-${name}-v${ILLUSTRATION_VERSION}.png`;
}

/** Adressen per tekening en per taal ('' = de tekening zonder tekst). */
export type IllustrationUrls = Partial<Record<Illustration, Record<string, string>>>;

/**
 * Zet de foto's bij de opdrachten met een illustratie. Een tekening met tekst
 * krijgt `images` per taal en `image` in de standaardtaal van het spel.
 */
export function applyIllustrations(pkg: GamePackage, urls: IllustrationUrls): GamePackage {
  const def = pkg.defaultLanguage ?? 'nl';
  return {
    ...pkg,
    tasks: pkg.tasks.map((t) => {
      const name = t.illustration;
      if (!isIllustration(name)) return t;
      const byLang = urls[name];
      if (!byLang) return t;
      if (!isLocalized(name)) return byLang[''] ? { ...t, image: byLang[''] } : t;
      const images: Record<string, string> = {};
      for (const lang of pkg.languages ?? [def]) if (byLang[lang]) images[lang] = byLang[lang]!;
      const main = images[def] ?? Object.values(images)[0];
      return main ? { ...t, image: main, images } : t;
    }),
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
  const langs = [...new Set([pkg.defaultLanguage ?? 'nl', ...(pkg.languages ?? [])])];
  const urls: IllustrationUrls = {};
  for (const name of names) {
    const byLang: Record<string, string> = {};
    for (const lang of isLocalized(name) ? langs : ['']) {
      const path = illustrationPath(gameId, name, lang || 'nl');
      const url = db.storage.from('media').getPublicUrl(path).data.publicUrl;
      try {
        const head = await fetch(url, { method: 'HEAD', cache: 'no-store' }).catch(() => null);
        if (!head?.ok) {
          const res = await fetch(illustrationSource(name, lang || 'nl'));
          if (!res.ok) throw new Error(String(res.status));
          const up = await db.storage.from('media').upload(path, await res.blob(), { contentType: 'image/png', upsert: true });
          if (up.error) throw new Error(up.error.message);
        }
        byLang[lang] = url;
      } catch (err) {
        console.warn(`Illustratie ${name} (${lang || 'alle talen'}) niet gezet:`, err);
      }
    }
    urls[name] = byLang;
  }
  return applyIllustrations(pkg, urls);
}
