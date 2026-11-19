/** Kleuren en maten van de app. Kleurenpalet van badassgames.nl: donker leisteenblauw met oranje accent. */
export const colors = {
  background: '#252f3d',
  surface: '#2e3845',
  surfaceRaised: '#38434f',
  text: '#f4f5f6',
  textMuted: '#b4bcc6',
  accent: '#e5963f',
  accentText: '#1f2733',
  success: '#3fb950',
  danger: '#f85149',
  border: '#455262',
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
