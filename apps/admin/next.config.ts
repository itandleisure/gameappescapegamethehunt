import type { NextConfig } from 'next';

const config: NextConfig = {
  // De engine wordt als TypeScript-bron gedeeld met de speler-app.
  transpilePackages: ['@hunt/engine'],
  reactStrictMode: true,
  // De engine importeert met '.js' (ESM-stijl) terwijl de bestanden '.ts' zijn.
  // Webpack lost dat op met extensionAlias; Turbopack kan dat (nog) niet.
  webpack: (webpackConfig) => {
    webpackConfig.resolve.extensionAlias = { '.js': ['.ts', '.tsx', '.js'] };
    return webpackConfig;
  },
};

export default config;
