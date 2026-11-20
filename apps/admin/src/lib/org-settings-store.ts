'use client';
// Algemene instellingen opslaan en ophalen (tabel org_settings).
import { useEffect, useState } from 'react';
import { DEFAULT_SETTINGS, parseSettings, type OrgSettings } from './org-settings';
import { supabase } from './supabase';

export async function loadOrgSettings(orgId: string): Promise<OrgSettings> {
  const { data, error } = await supabase().from('org_settings').select('settings').eq('org_id', orgId).maybeSingle();
  if (error) throw new Error(error.message);
  return parseSettings((data as { settings: unknown } | null)?.settings);
}

export async function saveOrgSettings(orgId: string, settings: OrgSettings): Promise<OrgSettings> {
  const clean = parseSettings(settings);
  const { error } = await supabase()
    .from('org_settings')
    .upsert({ org_id: orgId, settings: clean, updated_at: new Date().toISOString() });
  if (error) throw new Error(error.message);
  return clean;
}

/**
 * De instellingen van de organisatie, voor pagina's die er een standaard uit
 * halen. Lukt het laden niet, dan de standaardwaarden: een pagina blijft dan
 * gewoon werken zoals voorheen.
 */
export function useOrgSettings(orgId: string | null | undefined): OrgSettings | null {
  const [settings, setSettings] = useState<OrgSettings | null>(null);
  useEffect(() => {
    if (!orgId) return;
    let live = true;
    void loadOrgSettings(orgId).then(
      (s) => live && setSettings(s),
      () => live && setSettings(DEFAULT_SETTINGS),
    );
    return () => {
      live = false;
    };
  }, [orgId]);
  return settings;
}

/** Soorten logo die ook in de PDF passen. */
export const LOGO_TYPES = ['image/png', 'image/jpeg'];

/** Logo als PNG of JPEG zoals het is, onder huisstijl/<organisatie>/ in de bucket photobooks. */
export async function uploadLogo(orgId: string, file: File): Promise<string> {
  if (!LOGO_TYPES.includes(file.type)) throw new Error('PNG / JPG');
  const ext = file.type === 'image/jpeg' ? 'jpg' : 'png';
  const path = `huisstijl/${orgId}/logo-${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase().storage.from('photobooks').upload(path, file, { contentType: file.type });
  if (error) throw new Error(error.message);
  return path;
}

export async function signedLogo(path: string | null): Promise<string | null> {
  if (!path) return null;
  const { data } = await supabase().storage.from('photobooks').createSignedUrl(path, 60 * 60);
  return data?.signedUrl ?? null;
}
