import type { ExpoConfig } from 'expo/config';

/**
 * Configuratie van de speler-app. De Supabase-URL en de publishable key zijn
 * openbaar (ze zitten in elke app); de toegangsregels in de database bepalen
 * wat een speler mag. Geheime sleutels horen hier nooit.
 */
const config: ExpoConfig = {
  name: 'Escape Game The Hunt',
  slug: 'gameappescapegamethehunt',
  owner: 'the-badass-group',
  scheme: 'thehunt',
  version: '0.1.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'light',
  ios: {
    bundleIdentifier: 'com.thebadassgroup.thehunt',
    supportsTablet: false,
    infoPlist: {
      // Korte naam onder het icoon op het beginscherm; App Store-naam blijft Escape Game The Hunt.
      CFBundleDisplayName: 'The Hunt',
      UIBackgroundModes: ['location'],
      ITSAppUsesNonExemptEncryption: false,
    },
  },
  android: {
    package: 'com.thebadassgroup.thehunt',
    adaptiveIcon: { foregroundImage: './assets/adaptive-icon.png', backgroundColor: '#101214' },
    permissions: [
      'ACCESS_FINE_LOCATION',
      'ACCESS_COARSE_LOCATION',
      'ACCESS_BACKGROUND_LOCATION',
      'FOREGROUND_SERVICE',
      'FOREGROUND_SERVICE_LOCATION',
      'CAMERA',
    ],
  },
  plugins: [
    'expo-router',
    'expo-localization',
    ['expo-splash-screen', { image: './assets/splash-logo.png', imageWidth: 140, backgroundColor: '#101214', resizeMode: 'contain' }],
    [
      'expo-location',
      {
        locationAlwaysAndWhenInUsePermission:
          'Escape Game The Hunt gebruikt je locatie tijdens het spel om opdrachten te openen als je ter plekke bent, ook als het scherm uit is.',
        locationWhenInUsePermission: 'Escape Game The Hunt gebruikt je locatie om opdrachten te openen als je ter plekke bent.',
        isIosBackgroundLocationEnabled: true,
        isAndroidBackgroundLocationEnabled: true,
        isAndroidForegroundServiceEnabled: true,
      },
    ],
    [
      'expo-image-picker',
      {
        cameraPermission: 'Escape Game The Hunt gebruikt de camera voor de fotomissies.',
        photosPermission: false,
      },
    ],
    '@maplibre/maplibre-react-native',
  ],
  experiments: { typedRoutes: false },
  // Testversies via EAS Update. Met de SDK-versie als runtime kunnen ze ook in
  // Expo Go draaien (zie src/services/runtime.ts).
  runtimeVersion: { policy: 'sdkVersion' },
  updates: { url: 'https://u.expo.dev/af20ef2e-91ed-4ff2-88fb-19a7f95b444e' },
  extra: {
    supabaseUrl: 'https://wrdhjzvgdwatdqubouuk.supabase.co',
    supabasePublishableKey: 'sb_publishable_l6xHOj03WKV578ftzT_pkA_n9Nw0y4S',
    eas: { projectId: 'af20ef2e-91ed-4ff2-88fb-19a7f95b444e' },
  },
};

export default config;
