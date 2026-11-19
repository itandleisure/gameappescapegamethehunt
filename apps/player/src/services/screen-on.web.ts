import { useEffect, useState } from 'react';
import type { ScreenOn } from './screen-on';

/**
 * Webapp: scherm aan houden met de Wake Lock-functie van de browser (iPhone
 * vanaf iOS 16.4, Android Chrome). De browser laat het los zodra de pagina
 * uit beeld gaat; bij terugkomen vragen we het opnieuw. Sommige browsers
 * willen eerst een tik op het scherm, dus ook bij de eerstvolgende tik.
 */
export type { ScreenOn };

type Sentinel = { released: boolean; release: () => Promise<void>; addEventListener: (type: 'release', fn: () => void) => void };
type WakeLockNavigator = Navigator & { wakeLock?: { request: (type: 'screen') => Promise<Sentinel> } };

export function useScreenOn(): ScreenOn {
  const supported = typeof navigator !== 'undefined' && !!(navigator as WakeLockNavigator).wakeLock;
  const [state, setState] = useState<ScreenOn>(supported ? 'pending' : 'unsupported');

  useEffect(() => {
    if (!supported) return;
    let sentinel: Sentinel | null = null;
    let alive = true;
    let asking = false;
    const acquire = async () => {
      if (!alive || asking || document.visibilityState !== 'visible' || (sentinel && !sentinel.released)) return;
      asking = true;
      try {
        sentinel = await (navigator as WakeLockNavigator).wakeLock!.request('screen');
        if (!alive) {
          void sentinel.release();
          return;
        }
        setState('on');
        sentinel.addEventListener('release', () => alive && setState('pending'));
      } catch {
        if (alive) setState('pending');
      } finally {
        asking = false;
      }
    };
    void acquire();
    const onVisible = () => void acquire();
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('pointerdown', onVisible, true);
    return () => {
      alive = false;
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('pointerdown', onVisible, true);
      void sentinel?.release().catch(() => undefined);
    };
  }, [supported]);

  return state;
}
