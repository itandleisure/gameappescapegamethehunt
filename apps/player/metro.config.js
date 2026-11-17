// Metro-configuratie. De gedeelde engine importeert met .js-extensies (zoals
// TypeScript voor Node voorschrijft); Metro zoekt dan ook het .ts-bestand.
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
const defaultResolve = config.resolver.resolveRequest;

config.resolver.resolveRequest = (context, moduleName, platform) => {
  const resolve = defaultResolve ?? context.resolveRequest;
  if (moduleName.startsWith('.') && moduleName.endsWith('.js')) {
    try {
      return resolve(context, moduleName.slice(0, -3), platform);
    } catch {
      // geen .ts-bestand: gewoon het .js-bestand
    }
  }
  return resolve(context, moduleName, platform);
};

module.exports = config;
