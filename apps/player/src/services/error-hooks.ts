import { logError } from './diagnostics';

/**
 * Onverwachte fouten in de app (scriptfouten, crashes) komen in het logboek.
 * De bestaande afhandeling (rood scherm in ontwikkeling, afsluiten bij een
 * fatale fout) blijft daarna gewoon werken.
 */
type Handler = (error: unknown, isFatal?: boolean) => void;
interface ErrorUtilsLike {
  getGlobalHandler(): Handler;
  setGlobalHandler(handler: Handler): void;
}

let installed = false;

export function installErrorHooks() {
  if (installed) return;
  installed = true;
  const utils = (globalThis as { ErrorUtils?: ErrorUtilsLike }).ErrorUtils;
  if (!utils) return;
  const previous = utils.getGlobalHandler();
  utils.setGlobalHandler((error, isFatal) => {
    logError(isFatal ? 'app_crash' : 'app_fout', error, { fataal: Boolean(isFatal) });
    previous(error, isFatal);
  });
}
