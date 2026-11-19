import { loadPhoto } from '../web/photo-store';

/** Webapp: de foto uit de opslag van de browser (zie camera.web.ts), anders gewoon ophalen. */
export async function readFile(uri: string): Promise<ArrayBuffer> {
  const stored = await loadPhoto(uri).catch(() => undefined);
  if (stored) return stored.arrayBuffer();
  const res = await fetch(uri);
  if (!res.ok) throw new Error(`Foto niet gevonden (${res.status})`);
  return res.arrayBuffer();
}
