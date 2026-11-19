import { File } from 'expo-file-system';

/** Leest een lokaal fotobestand als bytes, om te versturen. */
export function readFile(uri: string): Promise<ArrayBuffer> {
  return new File(uri).arrayBuffer();
}
