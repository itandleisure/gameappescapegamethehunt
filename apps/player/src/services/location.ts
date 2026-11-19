import * as Haptics from 'expo-haptics';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { LOCATION_TASK } from '../config';
import { handleFixes, onFix, type Fix } from './location-handler';
import { IN_EXPO_GO } from './runtime';

/**
 * GPS tijdens het spel, en voor een spelleider om zijn positie te delen. Op de achtergrond (scherm uit, telefoon in de zak)
 * blijven metingen binnenkomen via een achtergrondtaak; op Android met een
 * melding, zoals de regels van Google voorschrijven.
 */

function toFix(location: Location.LocationObject): Fix {
  return {
    lat: location.coords.latitude,
    lng: location.coords.longitude,
    accuracy: location.coords.accuracy ?? 999,
    at: location.timestamp,
  };
}

export { onFix };

const handle = (locations: Location.LocationObject[]) =>
  handleFixes(locations.map(toFix), () => void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));

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
  // Expo Go kan niet op de achtergrond volgen; daar alleen "tijdens gebruik".
  if (IN_EXPO_GO) return 'foreground';
  const background = await Location.requestBackgroundPermissionsAsync();
  return background.status === 'granted' ? 'always' : 'foreground';
}

export async function locationPermission(): Promise<PermissionResult> {
  const foreground = await Location.getForegroundPermissionsAsync();
  if (foreground.status !== 'granted') return 'denied';
  if (IN_EXPO_GO) return 'foreground';
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
