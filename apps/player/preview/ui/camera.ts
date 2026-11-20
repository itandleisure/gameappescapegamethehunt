import type { Photo, Video } from '../../src/ui/camera';
import { testImage } from '../scenes';

/** Schermvoorbeeld: een staande "foto" van 3000 × 4000 in plaats van de camera. */
export async function takePhoto(): Promise<Photo | null> {
  return { uri: testImage(3000, 4000, 'camera'), width: 3000, height: 4000 };
}

/** Schermvoorbeeld: een video van 12 seconden in plaats van de camera. */
export async function recordVideo(): Promise<Video | null> {
  return { uri: 'preview://video.mp4', seconds: 12, contentType: 'video/mp4' };
}
