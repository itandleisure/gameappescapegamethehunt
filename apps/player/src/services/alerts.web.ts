/**
 * Webapp: alleen trillen (Android; een iPhone kent trillen in de browser
 * niet). Meldingen met het scherm uit kan de webapp niet: daar stopt de GPS.
 */
function vibrate(pattern: number[]) {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    // niet ondersteund
  }
}

export type NotifyPermission = 'granted' | 'denied' | 'undetermined';

export async function notificationPermission(): Promise<NotifyPermission> {
  return 'denied';
}

export async function requestNotificationPermission(): Promise<boolean> {
  return false;
}

export async function alertOpened(_title: string, _body: string): Promise<void> {
  vibrate([120, 60, 120]);
}

export async function alertNear(_title: string, _body: string): Promise<void> {
  vibrate([80, 60, 80]);
}

export async function alertHunter(_title: string, _body: string): Promise<void> {
  vibrate([500, 150, 500, 150, 500]);
}
