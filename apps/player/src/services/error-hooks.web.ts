import { logError, logIssue } from './diagnostics';

/** Scriptfouten en onafgehandelde fouten in de webapp komen in het logboek. */
let installed = false;

export function installErrorHooks() {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  window.addEventListener('error', (event) => {
    // Een bestand (afbeelding, kaarttegel) dat niet laadt: event.error ontbreekt.
    const target = event.target as { src?: string; href?: string; tagName?: string } | null;
    if (!event.error && target && target !== (window as unknown) && (target.src || target.href)) {
      logIssue('warn', 'laden_mislukt', `${target.tagName ?? 'bestand'} niet geladen`, { url: String(target.src ?? target.href).slice(0, 300) });
      return;
    }
    logError('webapp_fout', event.error ?? event.message, {
      bestand: event.filename ? String(event.filename).slice(0, 300) : undefined,
      regel: event.lineno,
      kolom: event.colno,
    });
  }, true);
  window.addEventListener('unhandledrejection', (event) => {
    logError('webapp_fout', event.reason, { onafgehandeld: true });
  });
  window.addEventListener('offline', () => logIssue('info', 'offline', 'Browser meldt: geen internetverbinding'));
  window.addEventListener('online', () => logIssue('info', 'online', 'Browser meldt: weer verbinding'));
}
