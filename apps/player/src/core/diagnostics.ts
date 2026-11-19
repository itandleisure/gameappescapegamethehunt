/**
 * Technische meldingen voor het logboek in het beheer (tabblad Logging):
 * fouten, mislukte verzoeken, zwak GPS en dergelijke, met het toestel erbij.
 *
 * Meldingen staan eerst in een wachtrij op de telefoon, zodat ze zonder
 * bereik niet verloren gaan, en worden in kleine pakketjes verstuurd.
 * Dezelfde melding kort na elkaar wordt samengevoegd tot één regel met een
 * aantal, zodat een telefoon zonder bereik het logboek niet volschrijft.
 * Zonder telefoonfuncties, zodat het te testen is.
 */

export type LogLevel = 'error' | 'warn' | 'info';
export type LogSource = 'app' | 'webapp' | 'spelleider';

export interface LogEntry {
  source: LogSource;
  level: LogLevel;
  kind: string;
  message: string;
  details?: Record<string, unknown>;
  device?: Record<string, unknown>;
  install_id?: string;
  client_time: string;
  session_id?: string;
  team_id?: string;
  count: number;
}

export interface DiagnosticsStore {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

export interface DiagnosticsDeps {
  send(entries: LogEntry[]): Promise<void>;
  store?: DiagnosticsStore;
  now?: () => number;
  /** Toestel en app: systeem, versie, model of browser, appversie. */
  device?: () => Record<string, unknown>;
  installId?: () => Promise<string>;
}

export interface LogContext {
  source?: LogSource;
  teamId?: string | null;
  sessionId?: string | null;
}

interface Pending extends LogEntry {
  key: string;
  firstAt: number;
}

const STORE_KEY = 'hunt.logboek';
/** Hooguit zoveel meldingen in de wachtrij; daarna vallen eerst de info-meldingen weg. */
export const MAX_PENDING = 100;
/** Dezelfde melding gaat hooguit eens per zoveel tijd naar de server; tussendoor telt hij op. */
export const SAME_ISSUE_EVERY_MS = 5 * 60_000;
const BATCH = 25;

/** Fout als tekst plus code en een stukje van de stack. */
export function describeError(error: unknown): { message: string; details: Record<string, unknown> } {
  if (error instanceof Error) {
    const details: Record<string, unknown> = { name: error.name };
    const extra = error as Error & { code?: unknown; key?: unknown; cause?: unknown };
    if (extra.code !== undefined) details.code = extra.code;
    if (extra.key !== undefined) details.key = extra.key;
    const cause = extra.cause as { message?: unknown; code?: unknown; status?: unknown } | undefined;
    if (cause && typeof cause === 'object') {
      if (typeof cause.message === 'string') details.cause = cause.message.slice(0, 500);
      if (cause.code !== undefined) details.causeCode = cause.code;
      if (cause.status !== undefined) details.status = cause.status;
    }
    if (error.stack) details.stack = error.stack.slice(0, 1500);
    return { message: error.message.slice(0, 500), details };
  }
  if (error && typeof error === 'object') {
    const e = error as { message?: unknown; code?: unknown };
    return {
      message: typeof e.message === 'string' ? e.message.slice(0, 500) : JSON.stringify(error).slice(0, 500),
      details: e.code !== undefined ? { code: e.code } : {},
    };
  }
  return { message: String(error).slice(0, 500), details: {} };
}

export class Diagnostics {
  private pending: Pending[] = [];
  private readonly lastSent = new Map<string, number>();
  private context: Required<LogContext> = { source: 'app', teamId: null, sessionId: null };
  private sending: Promise<void> | null = null;
  private loaded: Promise<void> | null = null;
  private installId: string | undefined;

  constructor(private readonly deps: DiagnosticsDeps) {}

  private now() {
    return (this.deps.now ?? Date.now)();
  }

  /** Bij welk team, welke hunt en welk deel van de app de volgende meldingen horen. */
  setContext(context: LogContext) {
    this.context = { ...this.context, ...context } as Required<LogContext>;
  }

  get currentContext(): Readonly<Required<LogContext>> {
    return this.context;
  }

  /** Legt een melding vast. Gooit nooit een fout. */
  log(level: LogLevel, kind: string, message = '', details?: Record<string, unknown>): void {
    try {
      const now = this.now();
      const { source, teamId, sessionId } = this.context;
      const key = [level, kind, message, teamId ?? '', sessionId ?? ''].join('|');
      const same = this.pending.find((p) => p.key === key);
      if (same) {
        same.count += 1;
        same.client_time = new Date(now).toISOString();
        if (details) same.details = { ...same.details, ...details };
      } else {
        this.pending.push({
          key,
          firstAt: now,
          source,
          level,
          kind,
          message: message.slice(0, 2000),
          ...(details ? { details } : {}),
          client_time: new Date(now).toISOString(),
          ...(teamId ? { team_id: teamId } : {}),
          ...(sessionId ? { session_id: sessionId } : {}),
          count: 1,
        });
        this.trim();
      }
      void this.persist();
    } catch {
      // Het logboek mag het spel nooit hinderen.
    }
  }

  error(kind: string, error: unknown, details?: Record<string, unknown>, level: LogLevel = 'error') {
    const d = describeError(error);
    this.log(level, kind, d.message, { ...d.details, ...details });
  }

  private trim() {
    while (this.pending.length > MAX_PENDING) {
      const info = this.pending.findIndex((p) => p.level === 'info');
      this.pending.splice(info >= 0 ? info : 0, 1);
    }
  }

  get queued(): number {
    return this.pending.length;
  }

  /** Haalt meldingen op die nog niet verstuurd waren (na herstarten van de app). */
  load(): Promise<void> {
    this.loaded ??= (async () => {
      try {
        const raw = await this.deps.store?.getItem(STORE_KEY);
        const saved = raw ? (JSON.parse(raw) as Pending[]) : [];
        if (!Array.isArray(saved)) return;
        // Uit een vorige keer (de opslag wordt pas na het laden beschreven); dezelfde melding telt op.
        const merged = saved.filter((p) => p && typeof p.key === 'string');
        for (const p of this.pending) {
          const same = merged.find((x) => x.key === p.key);
          if (same) {
            same.count += p.count;
            same.client_time = p.client_time;
          } else merged.push(p);
        }
        this.pending = merged;
        this.trim();
      } catch {
        // Kapotte wachtrij: opnieuw beginnen.
      }
    })();
    return this.loaded;
  }

  private async persist() {
    try {
      // Eerst de oude wachtrij inlezen, anders gaat die verloren.
      await this.load();
      await this.deps.store?.setItem(STORE_KEY, JSON.stringify(this.pending));
    } catch {
      // Geen opslag: dan alleen in het geheugen.
    }
  }

  /** Verstuurt wat klaar staat. Mislukt dat (geen bereik), dan blijft het staan. */
  flush(): Promise<void> {
    this.sending ??= this.send().finally(() => {
      this.sending = null;
    });
    return this.sending;
  }

  private async send() {
    await this.load();
    const now = this.now();
    const due = this.pending.filter((p) => now - (this.lastSent.get(p.key) ?? -Infinity) >= SAME_ISSUE_EVERY_MS).slice(0, BATCH);
    if (due.length === 0) return;
    try {
      this.installId ??= await this.deps.installId?.();
    } catch {
      // zonder id
    }
    let device: Record<string, unknown> | undefined;
    try {
      device = this.deps.device?.();
    } catch {
      device = undefined;
    }
    const entries: LogEntry[] = due.map(({ key: _key, firstAt, ...entry }) => ({
      ...entry,
      ...(entry.count > 1 ? { details: { ...entry.details, eerste: new Date(firstAt).toISOString() } } : {}),
      ...(device ? { device } : {}),
      ...(this.installId ? { install_id: this.installId } : {}),
    }));
    try {
      await this.deps.send(entries);
    } catch {
      return;
    }
    // Wat er tijdens het versturen bij kwam, blijft staan.
    const counts = new Map(due.map((p, i) => [p, entries[i]!.count]));
    this.pending = this.pending.filter((p) => {
      const sentCount = counts.get(p);
      if (sentCount === undefined) return true;
      p.count -= sentCount;
      return p.count > 0;
    });
    for (const p of due) this.lastSent.set(p.key, now);
    await this.persist();
  }
}

/**
 * Houdt de GPS-kwaliteit bij en meldt het als het signaal lang zwak is of
 * wegvalt. Elke situatie één keer: pas na herstel kan dezelfde melding weer.
 */
export class GpsQuality {
  private weakSince: number | null = null;
  private weakReported = false;
  private worst = 0;
  private sum = 0;
  private samples = 0;
  private lastFixAt: number | null = null;

  constructor(
    private readonly log: (level: LogLevel, kind: string, message: string, details?: Record<string, unknown>) => void,
    /** Zo lang moet het signaal zwak zijn voor een melding. */
    private readonly weakForMs = 60_000,
    /** Zo lang zonder meting heet een onderbreking. */
    private readonly gapMs = 90_000,
  ) {}

  fix(accuracy: number, at: number, limit: number) {
    if (this.lastFixAt !== null && at - this.lastFixAt >= this.gapMs) {
      const seconds = Math.round((at - this.lastFixAt) / 1000);
      this.log('warn', 'gps_onderbroken', `${seconds} s geen GPS-meting`, { seconden: seconds, vanaf: new Date(this.lastFixAt).toISOString() });
    }
    if (this.lastFixAt === null || at > this.lastFixAt) this.lastFixAt = at;

    const weak = !(accuracy >= 0) || accuracy > limit;
    if (weak) {
      if (this.weakSince === null) {
        this.weakSince = at;
        this.worst = 0;
        this.sum = 0;
        this.samples = 0;
      }
      const value = Number.isFinite(accuracy) ? accuracy : 9999;
      this.worst = Math.max(this.worst, value);
      this.sum += value;
      this.samples += 1;
      if (!this.weakReported && at - this.weakSince >= this.weakForMs) {
        this.weakReported = true;
        const avg = Math.round(this.sum / this.samples);
        this.log('warn', 'gps_zwak', `GPS onnauwkeurig: gemiddeld ${avg} m (grens ${limit} m)`, {
          gemiddeld_m: avg,
          slechtste_m: Math.round(this.worst),
          grens_m: limit,
          seconden: Math.round((at - this.weakSince) / 1000),
        });
      }
    } else if (this.weakSince !== null) {
      if (this.weakReported) {
        const seconds = Math.round((at - this.weakSince) / 1000);
        this.log('info', 'gps_hersteld', `GPS weer nauwkeurig na ${seconds} s`, {
          seconden: seconds,
          gemiddeld_m: Math.round(this.sum / Math.max(1, this.samples)),
          slechtste_m: Math.round(this.worst),
          nu_m: Math.round(accuracy),
        });
      }
      this.weakSince = null;
      this.weakReported = false;
    }
  }

  /** Tracking gestopt: een volgende start is geen onderbreking. */
  reset() {
    this.lastFixAt = null;
    this.weakSince = null;
    this.weakReported = false;
  }
}
