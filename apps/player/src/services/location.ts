import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { LOCATION_TASK } from '../config';
import { gpsQuality, logError, logIssue } from './diagnostics';
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

const handle = (locations: Location.LocationObject[]) => handleFixes(locations.map(toFix));

// Moet bovenaan in de bundel gedefinieerd zijn, ook als de app op de
// achtergrond wordt gestart door het besturingssysteem.
TaskManager.defineTask<{ locations: Location.LocationObject[] }>(LOCATION_TASK, async ({ data, error }) => {
  if (error) logError('gps_achtergrond_fout', error, undefined, 'warn');
  if (error || !data) return;
  await handle(data.locations);
});

export type PermissionResult = 'always' | 'foreground' | 'denied';

/** Vraagt eerst "tijdens gebruik" en daarna "altijd". */
export async function requestLocationPermission(): Promise<PermissionResult> {
  const foreground = await Location.requestForegroundPermissionsAsync();
  if (foreground.status !== 'granted') {
    logIssue('warn', 'locatie_geweigerd', 'Locatietoestemming geweigerd', { status: foreground.status, opnieuw_vragen: foreground.canAskAgain });
    return 'denied';
  }
  // Expo Go kan niet op de achtergrond volgen; daar alleen "tijdens gebruik".
  if (IN_EXPO_GO) return 'foreground';
  const background = await Location.requestBackgroundPermissionsAsync();
  if (background.status !== 'granted') {
    logIssue('info', 'locatie_alleen_voorgrond', 'Locatie alleen met de app open (niet "altijd"); GPS stopt met scherm uit');
  }
  return background.status === 'granted' ? 'always' : 'foreground';
}

/**
 * Kan de app de locatie volgen met het scherm uit? Niet in Expo Go. Dan is
 * er ook geen tweede vraag ("Altijd toestaan") nodig.
 */
export const BACKGROUND_LOCATION = !IN_EXPO_GO;

/** Stap 1 bij de start: alleen "tijdens gebruik" (na het eigen uitlegscherm). */
export async function requestForegroundLocation(): Promise<PermissionResult> {
  const foreground = await Location.requestForegroundPermissionsAsync();
  if (foreground.status !== 'granted') {
    logIssue('warn', 'locatie_geweigerd', 'Locatietoestemming geweigerd', { status: foreground.status, opnieuw_vragen: foreground.canAskAgain });
    return 'denied';
  }
  return locationPermission();
}

/**
 * Stap 2 bij de start: "Altijd toestaan", zodat het spel doorgaat met het
 * scherm uit (na het eigen uitlegscherm). Weigeren mag: dan werkt GPS alleen
 * met de app open.
 */
export async function requestAlwaysLocation(): Promise<PermissionResult> {
  if (!BACKGROUND_LOCATION) return locationPermission();
  const background = await Location.requestBackgroundPermissionsAsync();
  if (background.status !== 'granted') {
    logIssue('info', 'locatie_alleen_voorgrond', 'Locatie alleen met de app open (niet "altijd"); GPS stopt met scherm uit');
  }
  return locationPermission();
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
  if (permission === 'denied') {
    logIssue('warn', 'locatie_geweigerd', 'GPS kan niet starten: geen locatietoestemming');
    return permission;
  }
  if (!(await Location.hasServicesEnabledAsync().catch(() => true))) {
    logIssue('warn', 'gps_uit', 'Locatievoorzieningen staan uit op de telefoon');
  }

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
  gpsQuality.reset();
  foregroundWatch?.remove();
  foregroundWatch = null;
  if (await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK).catch(() => false)) {
    await Location.stopLocationUpdatesAsync(LOCATION_TASK);
  }
}
