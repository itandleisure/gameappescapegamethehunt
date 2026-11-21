// Metro-configuratie. De gedeelde engine importeert met .js-extensies (zoals
// TypeScript voor Node voorschrijft); Metro zoekt dan ook het .ts-bestand.
const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
const defaultResolve = config.resolver.resolveRequest;

// Schermvoorbeeld (SCREEN_PREVIEW=1, zie scripts/screens.mjs): server, GPS,
// kaart en camera vervangen door nepversies uit preview/. Nooit in de echte app.
const PREVIEW = process.env.SCREEN_PREVIEW === '1';
const SRC = path.join(__dirname, 'src') + path.sep;
// Ook de webversies (.web.ts) van deze bestanden: die kiest Metro in de browser.
const REPLACED = /^(services[\\/](game|location|map-download|siren)|ui[\\/]camera|ui[\\/]map[\\/]GameMap)(\.web)?\.tsx?$/;

// Pakketten die in een browser zonder scherm niet werken.
const PREVIEW_MODULES = {
  '@react-native-async-storage/async-storage': 'async-storage.ts',
  'expo-keep-awake': 'keep-awake.ts',
};

function preview(result) {
  if (!PREVIEW || result.type !== 'sourceFile' || !result.filePath.startsWith(SRC)) return result;
  const rel = result.filePath.slice(SRC.length);
  if (!REPLACED.test(rel)) return result;
  return { ...result, filePath: path.join(__dirname, 'preview', rel.replace(/\.web(\.tsx?)$/, '$1')) };
}

// Webapp (speler-app in de browser): pakketten met een eigen webversie uit src/web/.
const WEB_MODULES = {
  '@react-native-async-storage/async-storage': 'async-storage.ts',
};

// MapLibre heeft een aparte versie voor `import` (lib/module) en `require`
// (lib/commonjs). De app gebruikt allebei, en dan zaten beide in de bundel:
// de kaart-Camera werd twee keer aangemeld en de app crashte bij het openen
// van de kaart. Daarom altijd één en dezelfde versie.
const MAPLIBRE = '@maplibre/maplibre-react-native';
const MAPLIBRE_FILE = require.resolve(MAPLIBRE, { paths: [__dirname] });

config.resolver.resolveRequest = (context, moduleName, platform) => {
  const resolve = defaultResolve ?? context.resolveRequest;
  if (moduleName === MAPLIBRE && platform !== 'web') {
    return { type: 'sourceFile', filePath: MAPLIBRE_FILE };
  }
  if (PREVIEW && PREVIEW_MODULES[moduleName]) {
    return { type: 'sourceFile', filePath: path.join(__dirname, 'preview', PREVIEW_MODULES[moduleName]) };
  }
  if (platform === 'web' && WEB_MODULES[moduleName]) {
    return { type: 'sourceFile', filePath: path.join(__dirname, 'src', 'web', WEB_MODULES[moduleName]) };
  }
  if (moduleName.startsWith('.') && moduleName.endsWith('.js')) {
    try {
      return preview(resolve(context, moduleName.slice(0, -3), platform));
    } catch {
      // geen .ts-bestand: gewoon het .js-bestand
    }
  }
  return preview(resolve(context, moduleName, platform));
};

module.exports = config;
