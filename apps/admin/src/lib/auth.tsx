'use client';
import type { User } from '@supabase/supabase-js';
import { usePathname, useRouter } from 'next/navigation';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { isEventLinkPath } from './event-links';
import { supabase } from './supabase';

export interface Org {
  id: string;
  name: string;
  role: 'owner' | 'admin' | 'editor' | 'instructor';
  /** Organisatie van Escape Game The Hunt zelf (false = partner). */
  platform: boolean;
}

interface AuthState {
  loading: boolean;
  user: User | null;
  org: Org | null;
  reload: () => Promise<void>;
}

const AuthContext = createContext<AuthState>({ loading: true, user: null, org: null, reload: async () => {} });

const PUBLIC_PATHS = ['/login'];
/** Pagina's die zonder inloggen werken, zoals het fotoboek voor de klant. */
const PUBLIC_PREFIXES = ['/fotoboek/'];
/** Waar je heen wilde voordat je moest inloggen, zoals een resultatenlink. */
const RETURN_KEY = 'hunt-na-inloggen';

function remember(path: string) {
  try {
    if (path.startsWith('/resultaten/')) sessionStorage.setItem(RETURN_KEY, path);
  } catch {
    // geen opslag: dan na het inloggen naar het overzicht
  }
}

function takeRemembered(): string | null {
  try {
    const path = sessionStorage.getItem(RETURN_KEY);
    sessionStorage.removeItem(RETURN_KEY);
    return path && path.startsWith('/') ? path : null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<Omit<AuthState, 'reload'>>({ loading: true, user: null, org: null });
  const router = useRouter();
  const path = usePathname();

  const reload = useCallback(async () => {
    const { data } = await supabase().auth.getSession();
    const user = data.session?.user ?? null;
    let org: Org | null = null;
    if (user && !user.is_anonymous) {
      const { data: rows } = await supabase()
        .from('memberships')
        .select('role, organizations(id, name, is_platform)')
        .eq('user_id', user.id)
        .limit(1);
      const row = rows?.[0] as { role: Org['role']; organizations: { id: string; name: string; is_platform: boolean } } | undefined;
      if (row) org = { id: row.organizations.id, name: row.organizations.name, role: row.role, platform: row.organizations.is_platform };
    }
    setState({ loading: false, user, org });
  }, []);

  useEffect(() => {
    void reload();
    const { data } = supabase().auth.onAuthStateChange(() => void reload());
    return () => data.subscription.unsubscribe();
  }, [reload]);

  // Doorsturen: niet ingelogd → inloggen; nog geen organisatie → aanmaken.
  useEffect(() => {
    if (state.loading) return;
    if (PUBLIC_PREFIXES.some((p) => path.startsWith(p)) || isEventLinkPath(path)) return;
    if (!state.user && !PUBLIC_PATHS.includes(path)) {
      remember(path);
      router.replace('/login');
    } else if (state.user && !state.org && path !== '/start') router.replace('/start');
    else if (state.user && state.org && (path === '/login' || path === '/start')) router.replace(takeRemembered() ?? '/sessies');
  }, [state, path, router]);

  return <AuthContext.Provider value={{ ...state, reload }}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
