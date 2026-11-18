/** Kleuren en maten van de app. Later af te stemmen op de huisstijl van Escape Game The Hunt. */
export const colors = {
  background: '#101214',
  surface: '#1b1f23',
  surfaceRaised: '#262b31',
  text: '#f4f5f6',
  textMuted: '#a3abb4',
  accent: '#f5a524',
  accentText: '#101214',
  success: '#3fb950',
  danger: '#f85149',
  border: '#33393f',
};

export const space = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 };
export const radius = { sm: 6, md: 12, lg: 20 };

/**
 * Maximale breedte van de inhoud. Op een tablet staan tekst en knoppen dan
 * niet over de hele breedte, maar in een kolom in het midden.
 */
export const CONTENT_MAX_WIDTH = 600;

/** Stijl voor de inhoud van een scherm: op telefoons de hele breedte, op tablets een kolom in het midden. */
export const contentColumn = { width: '100%', maxWidth: CONTENT_MAX_WIDTH, alignSelf: 'center' } as const;
