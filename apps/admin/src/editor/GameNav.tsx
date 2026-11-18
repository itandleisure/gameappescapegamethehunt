'use client';
import Link from 'next/link';
import type { CSSProperties, ReactNode } from 'react';
import { useT } from '@/lib/language';

export type GameNavItem = 'overzicht' | 'kaart' | 'overlay' | 'nieuw' | 'tabbladen' | 'regels';

const plain: CSSProperties = {
  background: 'transparent',
  color: 'var(--text)',
  border: '1px solid var(--line)',
};
// De knop van de pagina waar je nu bent: blijft zichtbaar en is gemarkeerd.
const current: CSSProperties = {
  background: 'var(--surface)',
  color: 'var(--accent)',
  border: '2px solid var(--accent)',
  padding: '8px 15px',
};

/**
 * Knoppenbalk van een spel. Staat op de spelpagina én op elke pagina waar een
 * knop naartoe gaat, zodat je met één klik tussen Kaart, Kaartstijl, Tabbladen
 * en Regels schakelt. De knop van de huidige pagina is gemarkeerd.
 */
export function GameNav({
  id,
  layer,
  legacy = false,
  active,
  before,
  after,
}: {
  id: string;
  layer: string;
  legacy?: boolean;
  active: GameNavItem;
  /** Bijvoorbeeld de knop Publiceren op de spelpagina. */
  before?: ReactNode;
  /** Bijvoorbeeld de regel met de laatste versie. */
  after?: ReactNode;
}) {
  const t = useT();
  const isBase = layer === 'base';
  const items: { key: GameNavItem; href: string; label: string; show: boolean }[] = [
    { key: 'overzicht', href: `/spellen/${id}`, label: t('Overzicht'), show: active !== 'overzicht' },
    { key: 'kaart', href: `/spellen/${id}/kaart`, label: t('Kaart'), show: !legacy && layer !== 'client' },
    { key: 'overlay', href: `/spellen/${id}/overlay`, label: t('Kaartstijl en verzamelpunt'), show: !legacy },
    { key: 'nieuw', href: `/spellen/nieuw?basis=${id}`, label: t('Nieuwe stad uitrollen'), show: isBase && !legacy },
    { key: 'tabbladen', href: `/spellen/${id}/tabbladen`, label: t('Tabbladen'), show: isBase && !legacy },
    { key: 'regels', href: `/spellen/${id}/regels`, label: t('Regels'), show: isBase && !legacy },
  ];
  return (
    <nav className="actions" aria-label={t('Spel')}>
      {before}
      {items
        .filter((it) => it.show)
        .map((it) => (
          <Link
            key={it.key}
            href={it.href}
            className="filebutton"
            style={it.key === active ? current : plain}
            aria-current={it.key === active ? 'page' : undefined}
          >
            {it.label}
          </Link>
        ))}
      {after}
    </nav>
  );
}
