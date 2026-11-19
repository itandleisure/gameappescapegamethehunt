import { gpsChanged, gpsMonitor } from './gps-monitor';
import { handleFixes, onFix, type Fix } from './location-handler';

/**
 * GPS in de webapp (browser). Anders dan in de app kan een browser de locatie
 * alleen volgen zolang de pagina in beeld is en het scherm aan staat: gaat
 * het scherm uit of opent de speler een andere app, dan stopt de browser de
 * GPS. Daarom houdt de webapp het scherm aan (screen-on.web.ts) en ziet het
 * team een melding als er geen metingen meer komen (gps-monitor.ts).
 */

export { onFix };
export type PermissionResult = 'always' | 'foreground' | 'denied';

const geo = (): Geolocation | null => (typeof navigator !== 'undefined' && navigator.geolocation ? navigator.geolocation : null);

function toFix(position: GeolocationPosition): Fix {
  return {
    lat: position.coords.latitude,
    lng: position.coords.longitude,
    accuracy: position.coords.accuracy ?? 999,
    at: position.timestamp || Date.now(),
  };
}

function vibrate() {
  try {
    navigator.vibrate?.([120, 60, 120]);
  } catch {
    // iPhone kent trillen in de browser niet
  }
}

/** Toestemming zoals de browser hem nu kent, zonder te vragen. */
async function browserPermission(): Promise<PermissionState | 'unknown'> {
  try {
    const status = await navigator.permissions?.query({ name: 'geolocation' as PermissionName });
    return status?.state ?? 'unknown';
  } catch {
    return 'unknown';
  }
}

/** Vraagt de browser om de locatie (de browser toont dan zijn eigen vraag). */
export function requestLocationPermission(): Promise<PermissionResult> {
  const g = geo();
  if (!g) return Promise.resolve('denied');
  return new Promise((resolve) => {
    g.getCurrentPosition(
      (position) => {
        void handleFixes([toFix(position)], vibrate);
        resolve('foreground');
      },
      (error) => {
        if (error.code !== error.PERMISSION_DENIED) return resolve('foreground');
        // Ook in de meldingen tijdens het spel tonen hoe je het toestaat.
        gpsMonitor.start(Date.now());
        gpsMonitor.deny();
        gpsChanged();
        resolve('denied');
      },
      { enableHighAccuracy: true, timeout: 20_000, maximumAge: 10_000 },
    );
  });
}

export async function locationPermission(): Promise<PermissionResult> {
  if (!geo()) return 'denied';
  return (await browserPermission()) === 'denied' ? 'denied' : 'foreground';
}

let watchId: number | null = null;
let tracking = false;

function watch() {
  const g = geo();
  if (!g || watchId !== null) return;
  watchId = g.watchPosition(
    (position) => {
      gpsMonitor.fix(Date.now());
      gpsChanged();
      void handleFixes([toFix(position)], vibrate);
    },
    (error) => {
      if (error.code === error.PERMISSION_DENIED) {
        gpsMonitor.deny();
        gpsChanged();
      }
      // Geen signaal of te lang gewacht: de browser blijft zoeken; de melding komt vanzelf na 30 seconden.
    },
    { enableHighAccuracy: true, maximumAge: 0, timeout: 30_000 },
  );
}

function unwatch() {
  if (watchId !== null) geo()?.clearWatch(watchId);
  watchId = null;
}

/** Scherm uit of andere app: de browser stopt de GPS. Terug: opnieuw starten (iPhone herstart hem niet altijd zelf). */
function onVisibility() {
  if (!tracking) return;
  if (document.visibilityState === 'hidden') {
    gpsMonitor.hide(Date.now());
  } else {
    gpsMonitor.show(Date.now());
    unwatch();
    watch();
  }
  gpsChanged();
}

export async function startTracking(_title?: string, _body?: string): Promise<PermissionResult> {
  if (!geo()) return 'denied';
  if ((await browserPermission()) === 'denied') {
    gpsMonitor.start(Date.now());
    gpsMonitor.deny();
    gpsChanged();
    return 'denied';
  }
  if (!tracking) {
    tracking = true;
    gpsMonitor.start(Date.now());
    document.addEventListener('visibilitychange', onVisibility);
    // iPhone: bij terugkomen via de app-wisselaar komt soms alleen pageshow.
    window.addEventListener('pageshow', onVisibility);
    gpsChanged();
  }
  watch();
  return 'foreground';
}

export async function stopTracking(): Promise<void> {
  tracking = false;
  unwatch();
  document.removeEventListener('visibilitychange', onVisibility);
  window.removeEventListener('pageshow', onVisibility);
  gpsMonitor.stop();
  gpsChanged();
}
