/**
 * AsyncStorage voor de webapp: dezelfde functies, bewaard in localStorage van
 * de browser. (Het webdeel van het pakket zelf laadt niet goed in Metro.)
 * Lukt localStorage niet (privémodus, vol), dan alleen in het geheugen.
 */
const memory = new Map<string, string>();

function storage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

const AsyncStorage = {
  async getItem(key: string): Promise<string | null> {
    try {
      const value = storage()?.getItem(key);
      if (value !== null && value !== undefined) return value;
    } catch {
      // val terug op het geheugen
    }
    return memory.get(key) ?? null;
  },
  async setItem(key: string, value: string): Promise<void> {
    memory.set(key, value);
    try {
      storage()?.setItem(key, value);
    } catch {
      // vol of geblokkeerd: het geheugen houdt hem vast zolang de pagina open is
    }
  },
  async removeItem(key: string): Promise<void> {
    memory.delete(key);
    try {
      storage()?.removeItem(key);
    } catch {
      // niets aan te doen
    }
  },
};

export default AsyncStorage;
