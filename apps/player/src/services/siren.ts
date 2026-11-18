import * as Haptics from 'expo-haptics';

/**
 * Seintje bij een popup (nieuwe opdracht of bericht): alleen een tril.
 * De sirene is op verzoek weggehaald.
 */
export async function playSiren(): Promise<void> {
  await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => undefined);
}
