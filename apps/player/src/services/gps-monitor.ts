import { GpsMonitor, type GpsStatus } from '../core/gps-status';

/**
 * Eén GPS-bewaking voor de webapp: location.web.ts meldt metingen, fouten en
 * of de pagina in beeld is; de meldingen op het scherm lezen de status.
 */
export const gpsMonitor = new GpsMonitor();

const watchers = new Set<() => void>();

export function gpsChanged() {
  for (const watch of watchers) watch();
}

/** Status nu en bij elke wijziging (en elke seconde, omdat "weggevallen" vanzelf gebeurt). */
export function onGpsStatus(watch: (status: GpsStatus) => void): () => void {
  const emit = () => watch(gpsMonitor.status(Date.now()));
  watchers.add(emit);
  emit();
  const timer = setInterval(emit, 1_000);
  return () => {
    watchers.delete(emit);
    clearInterval(timer);
  };
}

export function dismissAwayNotice() {
  gpsMonitor.dismissAway();
  gpsChanged();
}
