import * as Haptics from 'expo-haptics';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { LOCATION_TASK } from '../config';
import { currentGame, resumeGame } from './game';

/**
 * GPS tijdens het spel. Op de achtergrond (scherm uit, telefoon in de zak)
 * blijven metingen binnenkomen via een achtergrondtaak; op Android met een
 * melding, zoals de regels van Google voorschrijven.
 */

type Fix = { lat: number; lng: number; accuracy: number; at: number };

function toFix(location: Location.LocationObject): Fix {
  return {
    lat: location.coords.latitude,
    lng: location.coords.longitude,
    accuracy: location.coords.accuracy ?? 999,
    at: location.timestamp,
  };
}

let lastFix: Fix | null = null;
const fixWatchers = new Set<(fix: Fix) => void>();

/** Laatste meting, voor de GPS-indicator op het scherm. */
export function onFix(watch: (fix: Fix) => void): () => void {
  fixWatchers.add(watch);
  if (lastFix) watch(lastFix);
  return () => fixWatchers.delete(watch);
}

async function handle(locations: Location.LocationObject[]) {
  const game = currentGame() ?? (await resumeGame());
  if (!game) return;
  const sorted = [...locations].sort((a, b) => a.timestamp - b.timestamp);
  for (const location of sorted) {
    const fix = toFix(location);
    lastFix = fix;
    for (const watch of fixWatchers) watch(fix);
    const opened = await game.onLocation(fix);
    if (opened.length > 0) void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }
  void game.tick();
}

// Moet bovenaan in de bundel gedefinieerd zijn, ook als de app op de
// achtergrond wordt gestart door het besturingssysteem.
TaskManager.defineTask<{ locations: Location.LocationObject[] }>(LOCATION_TASK, async ({ data, error }) => {
  if (error || !data) return;
  await handle(data.locations);
});

export type PermissionResult = 'always' | 'foreground' | 'denied';

/** Vraagt eerst "tijdens gebruik" en daarna "altijd". */
export async function requestLocationPermission(): Promise<PermissionResult> {
  const foreground = await Location.requestForegroundPermissionsAsync();
  if (foreground.status !== 'granted') return 'denied';
  const background = await Location.requestBackgroundPermissionsAsync();
  return background.status === 'granted' ? 'always' : 'foreground';
}

export async function locationPermission(): Promise<PermissionResult> {
  const foreground = await Location.getForegroundPermissionsAsync();
  if (foreground.status !== 'granted') return 'denied';
  const background = await Location.getBackgroundPermissionsAsync();
  return background.status === 'granted' ? 'always' : 'foreground';
}

let foregroundWatch: Location.LocationSubscription | null = null;

/** Start GPS: op de achtergrond als dat mag, anders alleen met de app open. */
export async function startTracking(notificationTitle: string, notificationBody: string): Promise<PermissionResult> {
  const permission = await locationPermission();
  if (permission === 'denied') return permission;

  const options: Location.LocationOptions = {
    accuracy: Location.Accuracy.BestForNavigation,
    timeInterval: 1_000,
    distanceInterval: 0,
  };

  if (permission === 'always') {
    if (!(await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK))) {
      await Location.startLocationUpdatesAsync(LOCATION_TASK, {
        ...options,
        activityType: Location.ActivityType.Fitness,
        pausesUpdatesAutomatically: false,
        showsBackgroundLocationIndicator: true,
        foregroundService: { notificationTitle, notificationBody, killServiceOnDestroy: false },
      });
    }
  } else if (!foregroundWatch) {
    foregroundWatch = await Location.watchPositionAsync(options, (location) => void handle([location]));
  }
  return permission;
}

export async function stopTracking(): Promise<void> {
  foregroundWatch?.remove();
  foregroundWatch = null;
  if (await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK).catch(() => false)) {
    await Location.stopLocationUpdatesAsync(LOCATION_TASK);
  }
}
