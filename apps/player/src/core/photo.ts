/**
 * Maten van foto's. Zonder telefoonfuncties, zodat het te testen is.
 */

/** Langste zijde van een foto die de app verstuurt: ruim genoeg voor de fotowall en het fotoboek. */
export const PHOTO_MAX_SIDE = 2048;

/**
 * Hoe een camerafoto verkleind wordt vóór het versturen: de langste zijde
 * naar maximaal `max` pixels, in de eigen verhouding (ook staand of
 * panorama), en nooit vergroten. Null: de foto is al klein genoeg.
 */
export function photoResize(
  width: number,
  height: number,
  max = PHOTO_MAX_SIDE,
): { width: number } | { height: number } | null {
  if (!(width > 0) || !(height > 0)) return { width: max };
  if (Math.max(width, height) <= max) return null;
  return width >= height ? { width: max } : { height: max };
}

/**
 * Weergavemaat van een foto bij een opdracht: zo breed als er plek is, in de
 * eigen verhouding, maar nooit hoger dan `maxHeight` (een heel lange foto
 * zou anders schermen lang worden) en een piepkleine foto niet meer dan
 * drie keer opgeblazen (dan wordt hij wazig).
 */
export function fitImage(
  image: { width: number; height: number } | null,
  available: { width: number; maxHeight: number },
): { width: number; height: number } {
  const ratio = image && image.width > 0 && image.height > 0 ? image.width / image.height : 4 / 3;
  let width = available.width;
  if (image && image.width > 0) width = Math.min(width, image.width * 3);
  let height = width / ratio;
  if (height > available.maxHeight) {
    height = available.maxHeight;
    width = height * ratio;
  }
  return { width: Math.round(width), height: Math.round(height) };
}
