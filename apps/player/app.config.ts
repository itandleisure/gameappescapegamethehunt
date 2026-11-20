import type { ExpoConfig } from 'expo/config';

/**
 * Configuratie van de speler-app. De Supabase-URL en de publishable key zijn
 * openbaar (ze zitten in elke app); de toegangsregels in de database bepalen
 * wat een speler mag. Geheime sleutels horen hier nooit.
 */
/**
 * Domein van de spellinks (https://<domein>/<game-ID>:<spelcode>). Links op
 * dit domein openen de app direct (iPhone: universal link, Android: app link).
 * Moet gelijk zijn aan NEXT_PUBLIC_SPEL_DOMEIN in de beheeromgeving. Werkt pas
 * na een nieuwe app-build (niet via een update), en alleen als het domein de
 * bestanden in /.well-known/ laat zien (zie docs/spellinks.md).
 */
const APP_LINK_HOST = process.env.APP_LINK_HOST ?? 'escapegamethehunt.badassgames.nl';

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
    associatedDomains: [`applinks:${APP_LINK_HOST}`],
    infoPlist: {
      // Korte naam onder het icoon op het beginscherm; App Store-naam blijft Escape Game The Hunt.
      CFBundleDisplayName: 'The Hunt',
      UIBackgroundModes: ['location'],
      ITSAppUsesNonExemptEncryption: false,
    },
  },
  android: {
    package: 'com.thebadassgroup.thehunt',
    // Spellinks /<game-ID>:<spelcode> openen de app. Resultatenlinks staan op
    // het domein van de beheeromgeving en blijven dus in de browser.
    intentFilters: [
      {
        action: 'VIEW',
        autoVerify: true,
        data: [{ scheme: 'https', host: APP_LINK_HOST, pathPattern: '/.*:.*' }],
        category: ['BROWSABLE', 'DEFAULT'],
      },
    ],
    adaptiveIcon: { foregroundImage: './assets/adaptive-icon.png', backgroundColor: '#252f3d' },
    permissions: [
      'ACCESS_FINE_LOCATION',
      'ACCESS_COARSE_LOCATION',
      'ACCESS_BACKGROUND_LOCATION',
      'FOREGROUND_SERVICE',
      'FOREGROUND_SERVICE_LOCATION',
      'CAMERA',
      // Video-opdracht (alleen gevraagd als een team er een opent).
      'RECORD_AUDIO',
      // Trillen bij een opdracht, en meldingen met het scherm uit (Android 13+ vraagt dit bij de start).
      'VIBRATE',
      'POST_NOTIFICATIONS',
    ],
  },
  plugins: [
    'expo-router',
    'expo-localization',
    ['expo-splash-screen', { image: './assets/splash-logo.png', imageWidth: 140, backgroundColor: '#252f3d', resizeMode: 'contain' }],
    [
      'expo-location',
      {
        locationAlwaysAndWhenInUsePermission:
          'Escape Game The Hunt gebruikt je locatie tijdens het spel om opdrachten te openen als je ter plekke bent, ook als het scherm uit is.',
        locationWhenInUsePermission: 'Escape Game The Hunt gebruikt je locatie om opdrachten te openen als je ter plekke bent.',
        locationAlwaysPermission:
          'Escape Game The Hunt gebruikt je locatie tijdens het spel om opdrachten te openen als je ter plekke bent, ook als het scherm uit is.',
        isIosBackgroundLocationEnabled: true,
        isAndroidBackgroundLocationEnabled: true,
        isAndroidForegroundServiceEnabled: true,
      },
    ],
    [
      'expo-image-picker',
      {
        cameraPermission: 'Escape Game The Hunt gebruikt de camera voor de foto- en video-opdrachten.',
        microphonePermission: 'Escape Game The Hunt gebruikt de microfoon alleen om geluid op te nemen bij een video-opdracht.',
        photosPermission: false,
      },
    ],
    // Foto's en video's uit het spel ook in de galerij van de telefoon bewaren
    // (alleen opslaan, de app leest de galerij niet).
    [
      'expo-media-library',
      {
        photosPermission: false,
        savePhotosPermission: "Escape Game The Hunt bewaart de foto's en video's die je in het spel maakt ook in je fotogalerij.",
        isAccessMediaLocationEnabled: false,
        // Geen leestoegang tot de galerij (READ_MEDIA_*): Google Play staat
        // die alleen toe voor apps die de galerij echt doorzoeken. Opslaan
        // vraagt alleen op Android 12 en ouder om toestemming.
        granularPermissions: [],
      },
    ],
    // Alleen meldingen vanaf de telefoon zelf (trillen als een opdracht opengaat
    // met het scherm uit); geen pushberichten via een server.
    ['expo-notifications', { enableRemoteNotifications: false, color: '#e5963f' }],
    '@maplibre/maplibre-react-native',
  ],
  // Webapp (speler-app in de browser, zie scripts/web-build.mjs): staat onder
  // een eigen pad op het domein van de beheeromgeving, standaard /speel.
  web: {
    output: 'single',
    bundler: 'metro',
    name: 'Escape Game The Hunt',
    shortName: 'The Hunt',
    themeColor: '#252f3d',
    backgroundColor: '#252f3d',
    favicon: './web/favicon.png',
  },
  experiments: { typedRoutes: false, ...(process.env.PLAYER_WEB_BASE ? { baseUrl: process.env.PLAYER_WEB_BASE } : {}) },
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
