import type { MetadataRoute } from 'next';

/** Beheer als app op het beginscherm van een telefoon (via "Zet op beginscherm"). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Escape Game The Hunt – beheer',
    short_name: 'The Hunt beheer',
    start_url: '/sessies',
    display: 'standalone',
    background_color: '#f6f5f2',
    theme_color: '#c2410c',
    icons: [{ src: '/icon.png', sizes: '512x512', type: 'image/png' }],
  };
}
