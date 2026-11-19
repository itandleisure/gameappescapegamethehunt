/**
 * Foto's van de webapp in de opslag van de browser (IndexedDB), tot ze
 * verstuurd zijn. Zo gaat een foto zonder bereik niet verloren, ook niet als
 * de pagina herladen wordt. De sleutel is het adres dat de app voor de foto
 * gebruikt (een blob:-adres).
 */
const DB = 'hunt-fotos';
const STORE = 'fotos';

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  try {
    return await new Promise<T>((resolve, reject) => {
      const req = action(db.transaction(STORE, mode).objectStore(STORE));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

/**
 * Opgeslagen als bytes, niet als Blob: Safari op de iPhone weigert soms een
 * Blob in IndexedDB ("Error preparing Blob/File data to be stored in object
 * store"). Bytes gaan altijd goed.
 */
interface StoredPhoto {
  type: string;
  data: ArrayBuffer;
}

export async function savePhoto(key: string, blob: Blob): Promise<void> {
  const stored: StoredPhoto = { type: blob.type || 'image/jpeg', data: await blob.arrayBuffer() };
  await run('readwrite', (s) => s.put(stored, key));
}

export async function loadPhoto(key: string): Promise<Blob | undefined> {
  const stored = await run<StoredPhoto | Blob | undefined>('readonly', (s) => s.get(key) as IDBRequest<StoredPhoto | Blob | undefined>);
  if (!stored || stored instanceof Blob) return stored; // oudere versie bewaarde een Blob
  return new Blob([stored.data], { type: stored.type });
}

export async function clearPhotos(): Promise<void> {
  await run('readwrite', (s) => s.clear());
}
