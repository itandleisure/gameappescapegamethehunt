import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { LOCATION_TASK } from '../config';
import { AppState, Platform } from 'react-native';
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

/**
 * Android volgt met het scherm uit via een voorgrondservice (met melding).
 * Die mag met alleen "tijdens gebruik" zolang hij start terwijl de app open
 * is. Daarom vragen we op Android geen "Altijd toestaan": die vraag springt
 * naar de Instellingen van Android, en dat liep vast (zie docs/toestemmingen.md).
 */
const ANDROID_SERVICE = Platform.OS === 'android' && !IN_EXPO_GO;

/**
 * Is er een tweede vraag ("Altijd toestaan") nodig om met het scherm uit te
 * volgen? Alleen op de iPhone; niet in Expo Go (kan het niet) en niet op
 * Android (voorgrondservice, zie boven).
 */
export const BACKGROUND_LOCATION = Platform.OS === 'ios' && !IN_EXPO_GO;

async function askForeground(): Promise<boolean> {
  const foreground = await Location.requestForegroundPermissionsAsync();
  if (foreground.status !== 'granted') {
    logIssue('warn', 'locatie_geweigerd', 'Locatietoestemming geweigerd', { status: foreground.status, opnieuw_vragen: foreground.canAskAgain });
    return false;
  }
  return true;
}

/** Vraagt "tijdens gebruik" en op de iPhone daarna "altijd" (spelleider). */
export async function requestLocationPermission(): Promise<PermissionResult> {
  if (!(await askForeground())) return 'denied';
  return requestAlwaysLocation();
}

/** Stap 1 bij de start: alleen "tijdens gebruik" (na het eigen uitlegscherm). */
export async function requestForegroundLocation(): Promise<PermissionResult> {
  if (!(await askForeground())) return 'denied';
  return locationPermission();
}

/**
 * Stap 2 bij de start (alleen iPhone): "Altijd toestaan", zodat het spel
 * doorgaat met het scherm uit (na het eigen uitlegscherm). Weigeren mag: dan
 * werkt GPS alleen met de app open.
 */
export async function requestAlwaysLocation(): Promise<PermissionResult> {
  if (!BACKGROUND_LOCATION) return locationPermission();
  try {
    const background = await Location.requestBackgroundPermissionsAsync();
    if (background.status !== 'granted') {
      logIssue('info', 'locatie_alleen_voorgrond', 'Locatie alleen met de app open (niet "altijd"); GPS stopt met scherm uit');
    }
  } catch (error) {
    logError('locatie_altijd_vragen_mislukt', error, undefined, 'warn');
  }
  return locationPermission();
}

export async function locationPermission(): Promise<PermissionResult> {
  const foreground = await Location.getForegroundPermissionsAsync();
  if (foreground.status !== 'granted') return 'denied';
  if (IN_EXPO_GO) return 'foreground';
  if (ANDROID_SERVICE) return 'always';
  const background = await Location.getBackgroundPermissionsAsync().catch(() => null);
  return background?.status === 'granted' ? 'always' : 'foreground';
}

let foregroundWatch: Location.LocationSubscription | null = null;

const OPTIONS: Location.LocationOptions = {
  accuracy: Location.Accuracy.BestForNavigation,
  timeInterval: 1_000,
  distanceInterval: 0,
};

async function watchWhileOpen(): Promise<void> {
  if (foregroundWatch) return;
  foregroundWatch = await Location.watchPositionAsync(OPTIONS, (location) => void handle([location]));
}

/**
 * Start GPS: ook met het scherm uit als dat kan, anders alleen met de app
 * open. Lukt het volgen op de achtergrond niet (bijvoorbeeld omdat Android
 * de service niet toestaat), dan valt hij terug op GPS met de app open in
 * plaats van te crashen.
 */
export async function startTracking(notificationTitle: string, notificationBody: string): Promise<PermissionResult> {
  const permission = await locationPermission().catch(() => 'denied' as const);
  if (permission === 'denied') {
    logIssue('warn', 'locatie_geweigerd', 'GPS kan niet starten: geen locatietoestemming');
    return permission;
  }
  if (!(await Location.hasServicesEnabledAsync().catch(() => true))) {
    logIssue('warn', 'gps_uit', 'Locatievoorzieningen staan uit op de telefoon');
  }

  // Android start een voorgrondservice alleen terwijl de app in beeld is.
  const canStartService = permission === 'always' && (!ANDROID_SERVICE || AppState.currentState === 'active');
  if (canStartService) {
    try {
      if (!(await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK))) {
        await Location.startLocationUpdatesAsync(LOCATION_TASK, {
          ...OPTIONS,
          activityType: Location.ActivityType.Fitness,
          pausesUpdatesAutomatically: false,
          showsBackgroundLocationIndicator: true,
          foregroundService: { notificationTitle, notificationBody, killServiceOnDestroy: false },
        });
      }
      foregroundWatch?.remove();
      foregroundWatch = null;
      return permission;
    } catch (error) {
      logError('gps_achtergrond_start_mislukt', error, undefined, 'warn');
    }
  }
  try {
    await watchWhileOpen();
  } catch (error) {
    logError('gps_start_mislukt', error, undefined, 'warn');
  }
  // Android, app niet in beeld: de service starten zodra de app weer open is.
  if (permission === 'always' && !canStartService) {
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      sub.remove();
      void startTracking(notificationTitle, notificationBody);
    });
  }
  return 'foreground';
}

export async function stopTracking(): Promise<void> {
  gpsQuality.reset();
  foregroundWatch?.remove();
  foregroundWatch = null;
  if (await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK).catch(() => false)) {
    await Location.stopLocationUpdatesAsync(LOCATION_TASK);
  }
}
