'use client';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// Publieke gegevens (staan ook in de speler-app). Op Vercel kunnen ze met
// NEXT_PUBLIC_SUPABASE_URL en NEXT_PUBLIC_SUPABASE_ANON_KEY worden vervangen.
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://wrdhjzvgdwatdqubouuk.supabase.co';
const KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable_l6xHOj03WKV578ftzT_pkA_n9Nw0y4S';

let client: SupabaseClient | null = null;

export function supabase(): SupabaseClient {
  client ??= createClient(URL, KEY, { auth: { persistSession: true, detectSessionInUrl: true, flowType: 'pkce' } });
  return client;
}
