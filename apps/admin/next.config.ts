import type { NextConfig } from 'next';

const config: NextConfig = {
  // De engine wordt als TypeScript-bron gedeeld met de speler-app.
  transpilePackages: ['@hunt/engine'],
  reactStrictMode: true,
  // App-links: de iPhone en Android lezen deze vaste adressen om te weten dat
  // spellinks (/<game-ID>:<spelcode>) de app mogen openen.
  async rewrites() {
    return [
      { source: '/.well-known/apple-app-site-association', destination: '/api/app-links/apple' },
      { source: '/apple-app-site-association', destination: '/api/app-links/apple' },
      { source: '/.well-known/assetlinks.json', destination: '/api/app-links/android' },
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
