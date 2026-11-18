'use client';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_ANON_KEY as KEY, SUPABASE_URL as URL } from './supabase-config';

let client: SupabaseClient | null = null;

export function supabase(): SupabaseClient {
  client ??= createClient(URL, KEY, { auth: { persistSession: true, detectSessionInUrl: true, flowType: 'pkce' } });
  return client;
}
