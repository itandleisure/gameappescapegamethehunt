import { describeError, type LogLevel } from './diagnostics.js';
import { BackendError } from './supabase-backend.js';
import type { Backend } from './types.js';

type Log = (level: LogLevel, kind: string, message: string, details?: Record<string, unknown>) => void;

/** Soort melding per verzoek; de rest heet "verzoek_mislukt". */
const KINDS: Partial<Record<keyof Backend, string>> = {
  ensureSignedIn: 'inloggen_mislukt',
  joinSession: 'aanmelden_mislukt',
  rejoinTeam: 'aanmelden_mislukt',
  startTeam: 'starten_mislukt',
  uploadPhoto: 'foto_upload_mislukt',
  sendEvents: 'antwoorden_versturen_mislukt',
  recordPositions: 'gps_versturen_mislukt',
  teamSignals: 'signalen_ophalen_mislukt',
  loadGame: 'spel_laden_mislukt',
  sendChat: 'chat_versturen_mislukt',
};

/** Fouten die bij de speler horen (verkeerde code, naam bezet): geen storing, wel handig om te zien. */
const USER_ERRORS = new Set(['errorUnknownSession', 'errorLocked', 'errorFull', 'errorUnknownTeam', 'errorAmbiguousTeam', 'errorTeamNameTaken', 'errorPhone', 'errorLanguage']);

/** Een klok die meer dan zoveel afwijkt van de server, wordt gemeld. */
export const CLOCK_WARN_MS = 120_000;

/**
 * Zet elk mislukt verzoek naar de server in het logboek: geen bereik als
 * waarschuwing, andere fouten als fout. Ook een telefoonklok die flink
 * afwijkt wordt gemeld (die verklaart rare tijden).
 */
export function withIssueLog(backend: Backend, log: Log, now: () => number = Date.now): Backend {
  return new Proxy(backend, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver) as unknown;
      if (typeof value !== 'function') return value;
      const name = String(prop) as keyof Backend;
      return (...args: unknown[]) => {
        const started = now();
        let result: unknown;
        try {
          result = (value as (...a: unknown[]) => unknown).apply(target, args);
        } catch (error) {
          report(log, name, error);
          throw error;
        }
        if (!(result instanceof Promise)) return result;
        return result.then(
          (out) => {
            if (name === 'serverTime' && typeof out === 'number') {
              const done = now();
              const local = started + (done - started) / 2;
              const diff = Math.round(local - out);
              if (Math.abs(diff) > CLOCK_WARN_MS) {
                log('warn', 'klok_afwijking', `Klok van de telefoon wijkt ${Math.round(diff / 1000)} s af van de server`, { seconden: Math.round(diff / 1000) });
              }
            }
            return out;
          },
          (error: unknown) => {
            report(log, name, error);
            throw error;
          },
        );
      };
    },
  });
}

function report(log: Log, method: keyof Backend, error: unknown) {
  const key = error instanceof BackendError ? error.key : null;
  const kind = KINDS[method] ?? 'verzoek_mislukt';
  const { message, details } = describeError(error);
  const level: LogLevel = key === 'errorNetwork' ? 'warn' : key && USER_ERRORS.has(key) ? 'info' : 'error';
  // Bij een BackendError zegt de oorzaak meer dan de sleutel.
  const text = key ? `${key}${typeof details.cause === 'string' ? `: ${details.cause}` : ''}` : message;
  delete details.stack;
  log(level, kind, text, { verzoek: method, ...details });
}
