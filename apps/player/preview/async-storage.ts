/** Schermvoorbeeld: AsyncStorage in het geheugen (de webversie van het pakket laadt niet in Metro). */
const data = new Map<string, string>();
const AsyncStorage = {
  getItem: async (key: string) => data.get(key) ?? null,
  setItem: async (key: string, value: string) => void data.set(key, value),
  removeItem: async (key: string) => void data.delete(key),
};
export default AsyncStorage;
