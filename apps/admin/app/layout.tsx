import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Shell } from './shell';
import './globals.css';

export const metadata: Metadata = { title: 'Escape Game The Hunt – beheer' };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="nl">
      <body>
        <Shell>{children}</Shell>
      </body>
    </html>
  );
}
