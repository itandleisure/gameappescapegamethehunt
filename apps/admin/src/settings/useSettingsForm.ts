'use client';
import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { useLanguage } from '@/lib/language';
import type { OrgSettings } from '@/lib/org-settings';
import { loadOrgSettings, saveOrgSettings } from '@/lib/org-settings-store';

/** Laden, wijzigen en opslaan van de algemene instellingen op één pagina. */
export function useSettingsForm() {
  const { org } = useAuth();
  const { t } = useLanguage();
  const [settings, setSettings] = useState<OrgSettings | null>(null);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const canEdit = !!org && ['owner', 'admin', 'editor'].includes(org.role);

  useEffect(() => {
    if (!org) return;
    void loadOrgSettings(org.id).then(setSettings, (e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, [org]);

  const change = (update: (s: OrgSettings) => OrgSettings) => {
    setSettings((s) => (s ? update(s) : s));
    setDirty(true);
    setNotice(null);
  };

  const run = async (label: string, work: () => Promise<void>) => {
    setBusy(label);
    setError(null);
    try {
      await work();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const save = (next: OrgSettings | null = settings) =>
    run(t('Opslaan…'), async () => {
      if (!org || !next) return;
      setSettings(await saveOrgSettings(org.id, next));
      setDirty(false);
      setNotice(t('Opgeslagen.'));
    });

  return { org, settings, change, dirty, busy, error, notice, canEdit, save, run, setError };
}
