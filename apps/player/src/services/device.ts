import Constants from 'expo-constants';
import { Platform } from 'react-native';

/** Toestel en app voor het logboek: systeem, versie, merk en model, appversie. */
export function deviceInfo(): Record<string, unknown> {
  const c = (Platform.constants ?? {}) as Record<string, unknown>;
  const info: Record<string, unknown> = {
    platform: Platform.OS,
    os: Platform.OS === 'ios' ? 'iOS' : 'Android',
    osVersion: String(Platform.Version),
    app: Constants.expoConfig?.version ?? null,
    runtime: Constants.executionEnvironment ?? null,
  };
  // Android geeft merk en model; iPhone alleen "phone" of "pad".
  if (typeof c.Manufacturer === 'string') info.merk = c.Manufacturer;
  if (typeof c.Model === 'string') info.model = c.Model;
  if (typeof c.interfaceIdiom === 'string') info.model = c.interfaceIdiom;
  return info;
}
