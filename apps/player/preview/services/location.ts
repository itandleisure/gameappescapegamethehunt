import { leeuwardenPoints } from '../../../../packages/engine/test/fixtures/the-hunt.js';

/** Schermvoorbeeld: vaste positie bij de start, toestemming altijd gegeven. */
type Fix = { lat: number; lng: number; accuracy: number; at: number };
export type PermissionResult = 'always' | 'foreground' | 'denied';

export function onFix(watch: (fix: Fix) => void): () => void {
  watch({ ...leeuwardenPoints.start, accuracy: 8, at: Date.now() });
  return () => undefined;
}
export async function requestLocationPermission(): Promise<PermissionResult> {
  return 'always';
}
export async function locationPermission(): Promise<PermissionResult> {
  return 'always';
}
export async function startTracking(): Promise<PermissionResult> {
  return 'always';
}
export async function stopTracking(): Promise<void> {}
export const BACKGROUND_LOCATION = true;
export const requestForegroundLocation = requestLocationPermission;
export const requestAlwaysLocation = requestLocationPermission;
