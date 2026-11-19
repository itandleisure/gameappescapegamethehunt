'use client';
// Fouten in het beheer (scriptfouten, onafgehandelde fouten) gaan naar het
// logboek (tabblad Logging), met de browser erbij. Elke fout hooguit één keer
// per pagina-bezoek, en nooit meer dan 20.
import { supabase } from './supabase';

let installed = false;
const seen = new Set<string>();

const BROWSERS: [RegExp, string][] = [
  [/Edg\/([\d.]+)/, 'Edge'],
  [/Firefox\/([\d.]+)/, 'Firefox'],
  [/Chrome\/([\d.]+)/, 'Chrome'],
  [/Version\/([\d.]+).*Safari/, 'Safari'],
];

function browser(): Record<string, unknown> {
  const ua = navigator.userAgent;
  let name = 'onbekend';
  for (const [rx, label] of BROWSERS) {
    const m = rx.exec(ua);
    if (m) {
      name = `${label} ${m[1]}`;
      break;
    }
  }
  const os = /iPhone|iPad/.test(ua) ? 'iOS' : /Android/.test(ua) ? 'Android' : /Mac OS X/.test(ua) ? 'macOS' : /Windows/.test(ua) ? 'Windows' : 'onbekend';
  return { platform: 'web', os, browser: name, scherm: `${screen.width}x${screen.height}`, userAgent: ua.slice(0, 300) };
}

export function reportAdminError(error: unknown, extra: Record<string, unknown> = {}) {
  try {
    const message = error instanceof Error ? error.message : typeof error === 'string' ? error : JSON.stringify(error);
    const key = message.slice(0, 200);
    if (seen.has(key) || seen.size >= 20) return;
    seen.add(key);
    const stack = error instanceof Error && error.stack ? error.stack.slice(0, 1500) : undefined;
    const sessionId = /^\/sessies\/([0-9a-f-]{36})/.exec(location.pathname)?.[1];
    void supabase().rpc('log_app_issues', {
      p_entries: [
        {
          source: 'beheer',
          level: 'error',
          kind: 'beheer_fout',
          message: message.slice(0, 2000),
          details: { pagina: location.pathname, ...(stack ? { stack } : {}), ...extra },
          device: browser(),
          client_time: new Date().toISOString(),
          ...(sessionId ? { session_id: sessionId } : {}),
        },
      ],
    });
  } catch {
    // Het logboek mag het beheer nooit hinderen.
  }
}

export function installAdminErrorReporting() {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  window.addEventListener('error', (e) => {
    if (e.error || e.message) reportAdminError(e.error ?? e.message, { bestand: e.filename, regel: e.lineno });
  });
  window.addEventListener('unhandledrejection', (e) => reportAdminError(e.reason, { onafgehandeld: true }));
}
