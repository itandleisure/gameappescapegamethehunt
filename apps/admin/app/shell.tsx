'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { AuthProvider, useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

const NAV = [
  { href: '/sessies', label: 'Hunts' },
  { href: '/spellen', label: 'Spellen' },
];

function Header() {
  const { user, org } = useAuth();
  const path = usePathname();
  if (!user || !org) return null;
  return (
    <header className="top">
      <span className="brand">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo-dark.png" alt="" className="logo only-light" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo-light.png" alt="" className="logo only-dark" />
        Escape Game The Hunt
      </span>
      <nav>
        {NAV.map((n) => (
          <Link key={n.href} href={n.href} className={path.startsWith(n.href) ? 'active' : ''}>
            {n.label}
          </Link>
        ))}
      </nav>
      <span className="who">
        {org.name} · {user.email}
        <button className="link" onClick={() => void supabase().auth.signOut()}>
          Uitloggen
        </button>
      </span>
    </header>
  );
}

function Gate({ children }: { children: ReactNode }) {
  const { loading } = useAuth();
  if (loading) return <main className="muted">Laden…</main>;
  return <main>{children}</main>;
}

export function Shell({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <Header />
      <Gate>{children}</Gate>
    </AuthProvider>
  );
}
