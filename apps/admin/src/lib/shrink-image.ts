/**
 * Foto's bij opdrachten verkleinen vóór het uploaden. Elke speler downloadt
 * ze bij de start van het spel (ook op mobiele data), en een onverkleinde
 * telefoonfoto van 5 tot 15 MB kan op oudere telefoons het geheugen laten
 * vollopen. 1600 px aan de langste zijde is scherp genoeg voor elk scherm.
 */
export const TASK_IMAGE_MAX_SIDE = 1600;
/** Kleinere bestanden met kleine maten blijven zoals ze zijn. */
const KEEP_BELOW_BYTES = 500_000;

/** Nieuwe maten in de eigen verhouding; null als de foto al klein genoeg is. */
export function shrinkSize(width: number, height: number, max = TASK_IMAGE_MAX_SIDE): { width: number; height: number } | null {
  if (!(width > 0) || !(height > 0) || Math.max(width, height) <= max) return null;
  const scale = max / Math.max(width, height);
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/**
 * Verkleint een gekozen bestand in de browser. PNG blijft PNG (een logo met
 * doorzichtige achtergrond), de rest wordt JPEG. Lukt verkleinen niet, dan
 * gaat het oorspronkelijke bestand mee.
 */
export async function shrinkImage(file: File): Promise<File> {
  if (!file.type.startsWith('image/') || file.type === 'image/svg+xml' || file.type === 'image/gif') return file;
  try {
    const bitmap = await createImageBitmap(file);
    const size = shrinkSize(bitmap.width, bitmap.height);
    if (!size && file.size <= KEEP_BELOW_BYTES) {
      bitmap.close();
      return file;
    }
    const target = size ?? { width: bitmap.width, height: bitmap.height };
    const canvas = document.createElement('canvas');
    canvas.width = target.width;
    canvas.height = target.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bitmap, 0, 0, target.width, target.height);
    bitmap.close();
    const type = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, 0.85));
    if (!blob || blob.size >= file.size) return file;
    const name = file.name.replace(/\.[^.]+$/, '') + (type === 'image/png' ? '.png' : '.jpg');
    return new File([blob], name, { type });
  } catch {
    return file;
  }
}
