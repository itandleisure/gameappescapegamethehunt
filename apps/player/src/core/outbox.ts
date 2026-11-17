/**
 * Wachtrij voor alles wat naar de server moet. Mislukt het versturen (geen
 * bereik in een steeg), dan blijft het staan en probeert de app het later
 * opnieuw, met een oplopende wachttijd tot maximaal een minuut.
 */
export class Retry {
  private failures = 0;
  private nextAttemptAt = 0;

  constructor(
    private readonly baseMs = 2_000,
    private readonly maxMs = 60_000,
  ) {}

  ready(now: number): boolean {
    return now >= this.nextAttemptAt;
  }

  succeeded(): void {
    this.failures = 0;
    this.nextAttemptAt = 0;
  }

  failed(now: number): void {
    this.failures += 1;
    this.nextAttemptAt = now + Math.min(this.maxMs, this.baseMs * 2 ** (this.failures - 1));
  }

  get failureCount(): number {
    return this.failures;
  }
}
