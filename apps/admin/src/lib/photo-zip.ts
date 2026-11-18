'use client';
// Alle foto's van het fotoboek in één zip, in de browser gemaakt.
import { zipEntryNames, type BookItem } from './photobook';

/** Haalt de foto's op en maakt er een zip van (foto's worden niet opnieuw gecomprimeerd). */
export async function buildPhotoZip(
  items: readonly (Pick<BookItem, 'caption'> & { url: string })[],
  onProgress?: (done: number, total: number) => void,
): Promise<Blob> {
  const { zipSync } = await import('fflate');
  const names = zipEntryNames(items);
  const files: Record<string, [Uint8Array, { level: 0 }]> = {};
  let done = 0;
  onProgress?.(0, items.length);
  // Vier tegelijk ophalen: snel, zonder de verbinding te overbelasten.
  const queue = items.map((item, i) => ({ item, name: names[i]! }));
  const worker = async () => {
    for (let next = queue.shift(); next; next = queue.shift()) {
      try {
        const res = await fetch(next.item.url);
        if (res.ok) files[next.name] = [new Uint8Array(await res.arrayBuffer()), { level: 0 }];
      } catch {
        // Een foto die niet laadt, slaat de zip over.
      }
      onProgress?.(++done, items.length);
    }
  };
  await Promise.all([worker(), worker(), worker(), worker()]);
  const zipped = zipSync(files);
  return new Blob([zipped as BlobPart], { type: 'application/zip' });
}

/** Laat de browser een bestand opslaan. */
export function saveBlob(blob: Blob, name: string): void {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
}
