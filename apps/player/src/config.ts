import Constants from 'expo-constants';
import { DEFAULT_MAP_SOURCE } from '@hunt/engine';

interface Extra {
  supabaseUrl: string;
  supabasePublishableKey: string;
}

const extra = (Constants.expoConfig?.extra ?? {}) as Partial<Extra>;

export const SUPABASE_URL = extra.supabaseUrl ?? '';
export const SUPABASE_KEY = extra.supabasePublishableKey ?? '';
/** Sleutel voor de kaarttegels van MapTiler (EAS-omgevingsvariabele); zonder sleutel OpenFreeMap. */
export const MAPTILER_KEY = process.env.EXPO_PUBLIC_MAPTILER_KEY ?? '';
export { DEFAULT_MAP_SOURCE };

/** Naam van de achtergrondtaak die GPS-metingen ontvangt. */
export const LOCATION_TASK = 'hunt-location';
