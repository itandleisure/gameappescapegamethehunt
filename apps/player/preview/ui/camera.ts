import type { Photo } from '../../src/ui/camera';
import { testImage } from '../scenes';

/** Schermvoorbeeld: een staande "foto" van 3000 × 4000 in plaats van de camera. */
export async function takePhoto(): Promise<Photo | null> {
  return { uri: testImage(3000, 4000, 'camera'), width: 3000, height: 4000 };
}
