import { describe, expect, it } from 'vitest';
import { leeuwarden, theHuntBase } from '../../../packages/engine/test/fixtures/the-hunt.js';
import { baseToRows, variantToRows } from '../src/lib/game-model.js';
import { baseName, cleanName, displayName, variantName, withCurrentName } from '../src/lib/game-name.js';
import { composeChain } from '../src/lib/game-store.js';

const baseRows = baseToRows(theHuntBase, { id: 'base', slug: 'the-hunt' });
const cityRows = variantToRows(
  leeuwarden,
  { id: 'lwd', slug: leeuwarden.id, parent_id: 'base', languages: ['nl', 'en'], default_language: 'nl' },
  (k) => k,
);

const renamed = (rows: typeof baseRows, name: Record<string, string>) => ({
  ...rows,
  translations: [
    ...rows.translations.filter((r) => !(r.entity === 'game' && r.field === 'name')),
    ...Object.entries(name).map(([lang, text]) => ({ entity: 'game' as const, entity_id: '', field: 'name', lang, text })),
  ],
});

describe('naam van een spel', () => {
  it('leest de naam van het basisspel en van een variant', () => {
    expect(baseName(baseRows)).toEqual(theHuntBase.name);
    expect(variantName(cityRows.game)).toEqual(leeuwarden.name);
    expect(variantName({ settings: { name: 'Parteon' }, languages: ['nl', 'en'] })).toEqual({ nl: 'Parteon', en: 'Parteon' });
    expect(displayName({ layer: 'city', slug: 'x', settings: {} })).toBe('x');
  });

  it('haalt spaties en lege talen weg', () => {
    expect(cleanName({ nl: ' De Jacht ', en: '  ', de: 'Die Jagd' }, ['nl', 'en'])).toEqual({ nl: 'De Jacht' });
  });

  it('een nieuwe naam van het basisspel komt bij publiceren in het pakket', () => {
    const pkg = composeChain([renamed(baseRows, { nl: 'De Jacht', en: 'The Chase' }), cityRows]);
    expect(pkg.name).toEqual({ nl: 'De Jacht', en: 'The Chase' });
  });

  it('een stad op een vastgezette versie krijgt toch de huidige naam', () => {
    const live = renamed(baseRows, { nl: 'De Jacht' });
    const pkg = composeChain([withCurrentName(baseRows, live), cityRows]);
    expect(pkg.name).toEqual({ nl: 'De Jacht' });
    // Verder blijft de vastgezette versie zoals hij was.
    expect(withCurrentName(baseRows, live).tasks).toBe(baseRows.tasks);
  });
});
