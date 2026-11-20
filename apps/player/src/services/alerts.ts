import * as Haptics from 'expo-haptics';
import { AppState, Platform, Vibration } from 'react-native';
import { logIssue } from './diagnostics';
import { IN_EXPO_GO } from './runtime';

/**
 * Seintjes tijdens het spel: trillen als het team een opdracht nadert of als
 * er een opdracht opengaat. Met de app open trilt de telefoon gewoon. Met het
 * scherm uit (telefoon in de zak) kan dat alleen via een melding op de
 * telefoon zelf; daar is toestemming voor meldingen voor nodig, die de app
 * bij de start vraagt (na de locatie, met eigen uitleg ervoor). Alles blijft
 * op de telefoon: geen pushserver.
 */

const CHANNEL = 'opdrachten';

// Expo Go kan niet volgen met het scherm uit; daar ook geen meldingen (de module laden we dan niet eens).
type NotificationsModule = typeof import('expo-notifications');
const Notifications: NotificationsModule | null = IN_EXPO_GO ? null : require('expo-notifications');

// Met de app open toont de app zelf de opdracht (met sirene); dan geen melding erbovenop.
Notifications?.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: false, shouldShowList: false, shouldPlaySound: false, shouldSetBadge: false }),
});

async function ensureChannel(): Promise<void> {
  if (Platform.OS !== 'android' || !Notifications) return;
  await Notifications.setNotificationChannelAsync(CHANNEL, {
    name: 'Opdrachten',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 300, 150, 300],
    enableVibrate: true,
  });
}

export type NotifyPermission = 'granted' | 'denied' | 'undetermined';

export async function notificationPermission(): Promise<NotifyPermission> {
  if (!Notifications) return 'denied';
  const current = await Notifications.getPermissionsAsync().catch(() => null);
  if (!current) return 'denied';
  return current.granted ? 'granted' : current.canAskAgain ? 'undetermined' : 'denied';
}

/** Vraagt toestemming voor meldingen (alleen lokale meldingen, geen push). */
export async function requestNotificationPermission(): Promise<boolean> {
  if (!Notifications) return false;
  try {
    // Op Android 13+ verschijnt de vraag pas als er een kanaal is.
    await ensureChannel();
    const result = await Notifications.requestPermissionsAsync({
      ios: { allowAlert: true, allowSound: true, allowBadge: false },
    });
    if (!result.granted) logIssue('info', 'meldingen_geweigerd', 'Geen meldingen: met het scherm uit trilt de telefoon niet');
    return result.granted;
  } catch (error) {
    logIssue('warn', 'meldingen_vragen_mislukt', error instanceof Error ? error.message : String(error));
    return false;
  }
}

const inForeground = () => AppState.currentState === 'active';

async function notify(title: string, body: string): Promise<void> {
  if (!Notifications || (await notificationPermission()) !== 'granted') return;
  await ensureChannel();
  await Notifications.scheduleNotificationAsync({
    content: { title, body, sound: true, ...(Platform.OS === 'android' ? { vibrate: [0, 300, 150, 300] } : {}) },
    trigger: Platform.OS === 'android' ? { channelId: CHANNEL } : null,
  });
}

/** Er ging een opdracht open op locatie. */
export async function alertOpened(title: string, body: string): Promise<void> {
  if (inForeground()) {
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
    return;
  }
  await notify(title, body).catch((error) => logIssue('warn', 'melding_mislukt', String(error)));
}

/** Het team nadert een opdracht: kort dubbel trillen. */
export async function alertNear(title: string, body: string): Promise<void> {
  if (inForeground()) {
    if (Platform.OS === 'android') Vibration.vibrate([0, 120, 80, 120]);
    else await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => undefined);
    return;
  }
  await notify(title, body).catch((error) => logIssue('warn', 'melding_mislukt', String(error)));
}
