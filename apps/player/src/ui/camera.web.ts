import { photoResize } from '../core/photo';
import { savePhoto } from '../web/photo-store';
import type { Photo } from './camera';

/**
 * Webapp: foto maken via de camera van de telefoon (het bestandsveld met
 * "capture" opent op iPhone en Android direct de camera). Daarna, net als in
 * de app, verkleind tot maximaal 2048 px als JPEG en bewaard in de browser tot
 * hij verstuurd is.
 */
export type { Photo };

function pickFile(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.setAttribute('capture', 'environment');
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

export async function takePhoto(): Promise<Photo | null> {
  const file = await pickFile();
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
  await savePhoto(uri, blob);
  return { uri, width, height };
}
