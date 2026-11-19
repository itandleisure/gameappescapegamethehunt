import { useKeepAwake } from 'expo-keep-awake';

/** 'on': scherm blijft aan; 'unsupported': de browser kan dat niet; 'pending': nog niet gelukt (webapp). */
export type ScreenOn = 'on' | 'unsupported' | 'pending';

/** Houdt het scherm aan zolang dit scherm open is. */
export function useScreenOn(): ScreenOn {
  useKeepAwake();
  return 'on';
}
