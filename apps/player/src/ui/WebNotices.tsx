/**
 * Uitleg en meldingen die alleen de webapp nodig heeft (zie
 * WebNotices.web.tsx). In de app op de telefoon tonen ze niets: daar loopt de
 * GPS ook met het scherm uit.
 */
export function WebStartInfo(_props: { lang: string }) {
  return null;
}

export function WebPlayBanners(_props: { lang: string }) {
  return null;
}

/** Uitleg als de locatie geweigerd is; null in de app (die heeft de knop "Instellingen openen"). */
export function webLocationHelp(_lang: string): string | null {
  return null;
}
