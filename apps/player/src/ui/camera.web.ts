import { photoResize } from '../core/photo';
import { savePhoto } from '../web/photo-store';
import type { Photo, Video } from './camera';

/**
 * Webapp: foto maken via de camera van de telefoon (het bestandsveld met
 * "capture" opent op iPhone en Android direct de camera). Daarna, net als in
 * de app, verkleind tot maximaal 2048 px als JPEG en bewaard in de browser tot
 * hij verstuurd is.
 */
export type { Photo, Video };

function pickFile(camera: boolean, accept = 'image/*'): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    if (camera) input.setAttribute('capture', 'environment');
    input.style.display = 'none';
    let done = false;
    const finish = (file: File | null) => {
      if (done) return;
      done = true;
      window.removeEventListener('focus', onFocus);
      input.remove();
      resolve(file);
    };
    input.addEventListener('change', () => finish(input.files?.[0] ?? null));
    input.addEventListener('cancel', () => finish(null));
    // Oudere browsers melden annuleren niet: terug in beeld zonder foto is annuleren.
    const onFocus = () => setTimeout(() => finish(input.files?.[0] ?? null), 1_500);
    window.addEventListener('focus', onFocus);
    document.body.appendChild(input);
    input.click();
  });
}

async function decode(file: File): Promise<{ source: CanvasImageSource; width: number; height: number; close: () => void }> {
  // Rechtop zetten zoals de camera hem bedoelde (EXIF).
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
      return { source: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close() };
    } catch {
      // val terug op een <img>
    }
  }
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.src = url;
  await img.decode();
  return { source: img, width: img.naturalWidth, height: img.naturalHeight, close: () => URL.revokeObjectURL(url) };
}

export function takePhoto(): Promise<Photo | null> {
  return fromFile(pickFile(true));
}

/** Een foto kiezen die al op de telefoon staat (zonder "capture" toont de telefoon de fotobibliotheek). */
export function pickPhoto(): Promise<Photo | null> {
  return fromFile(pickFile(false));
}

async function fromFile(picked: Promise<File | null>): Promise<Photo | null> {
  const file = await picked;
  if (!file) return null;
  const image = await decode(file);
  const resize = photoResize(image.width, image.height);
  const scale = !resize ? 1 : 'width' in resize ? resize.width / image.width : resize.height / image.height;
  const width = Math.round(image.width * scale);
  const height = Math.round(image.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.getContext('2d')!.drawImage(image.source, 0, 0, width, height);
  image.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.8));
  if (!blob) return null;
  const uri = URL.createObjectURL(blob);
  // Bewaren voor als er geen bereik is. Lukt dat niet (bijv. privémodus), dan
  // gaat de foto toch mee zolang de pagina open blijft (readFile haalt het blob:-adres op).
  await savePhoto(uri, blob).catch(() => undefined);
  return { uri, width, height };
}

/** Lengte van een video in seconden, of 0 als de browser hem niet kan lezen. */
function duration(file: File): Promise<number> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.preload = 'metadata';
    const done = (seconds: number) => {
      URL.revokeObjectURL(url);
      resolve(Number.isFinite(seconds) ? seconds : 0);
    };
    video.onloadedmetadata = () => done(video.duration);
    video.onerror = () => done(0);
    video.src = url;
  });
}

/**
 * Webapp: video filmen met de camera van de telefoon. De browser kan de
 * lengte niet begrenzen; een te lange video geeft `tooLong` terug.
 */
export async function recordVideo(maxSeconds: number): Promise<Video | 'tooLong' | null> {
  const file = await pickFile(true, 'video/*');
  if (!file) return null;
  const seconds = Math.round(await duration(file));
  if (seconds > maxSeconds + 1) return 'tooLong';
  const contentType = file.type === 'video/quicktime' ? 'video/quicktime' : 'video/mp4';
  const blob = new Blob([await file.arrayBuffer()], { type: contentType });
  const uri = URL.createObjectURL(blob);
  await savePhoto(uri, blob).catch(() => undefined);
  return { uri, seconds, contentType };
}
