import type { NextConfig } from 'next';

const config: NextConfig = {
  // De engine wordt als TypeScript-bron gedeeld met de speler-app.
  transpilePackages: ['@hunt/engine'],
  reactStrictMode: true,
  // Webapp voor spelers (speler-app in de browser) onder /speel, gebouwd door
  // scripts/build-webapp.mjs naar public/speel. Bestanden die bestaan worden
  // gewoon geserveerd; elk ander adres onder /speel is een scherm van de app.
  async rewrites() {
    return {
      beforeFiles: [],
      afterFiles: [
        { source: '/speel', destination: '/speel/index.html' },
        { source: '/speel/:path*', destination: '/speel/index.html' },
      ],
      fallback: [],
    };
  },
  async headers() {
    return [
      // Altijd de nieuwste versie van de pagina en de service worker ophalen; de rest heeft een versie in de naam.
      { source: '/speel', headers: [{ key: 'Cache-Control', value: 'no-cache' }] },
      { source: '/speel/:path*', headers: [{ key: 'Cache-Control', value: 'no-cache' }] },
      // De service worker staat in /speel/ maar moet ook /speel zelf bedienen.
      { source: '/speel/sw.js', headers: [{ key: 'Service-Worker-Allowed', value: '/speel' }] },
      { source: '/speel/_expo/:path*', headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }] },
    ];
  },
  // De engine importeert met '.js' (ESM-stijl) terwijl de bestanden '.ts' zijn.
  // Webpack lost dat op met extensionAlias; Turbopack kan dat (nog) niet.
  webpack: (webpackConfig) => {
    webpackConfig.resolve.extensionAlias = { '.js': ['.ts', '.tsx', '.js'] };
    return webpackConfig;
  },
};

export default config;
