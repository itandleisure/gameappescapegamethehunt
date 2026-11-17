import { estimateClockOffset, type ClockSample } from '@hunt/engine';

/**
 * Houdt het verschil tussen telefoonklok en serverklok bij, zodat timers en
 * tijdregels op servertijd lopen, ook als iemand de telefoonklok verzet.
 */
export class ClockSync {
  private samples: ClockSample[] = [];
  private offsetMs = 0;

  constructor(private readonly deviceNow: () => number = Date.now) {}

  get offset(): number {
    return this.offsetMs;
  }

  set offset(value: number) {
    this.offsetMs = value;
  }

  now(): number {
    return this.deviceNow() + this.offsetMs;
  }

  toServer(deviceTime: number): number {
    return deviceTime + this.offsetMs;
  }

  /** Doet een paar metingen tegen de server en werkt de schatting bij. */
  async sync(serverTime: () => Promise<number>, rounds = 3): Promise<number> {
    for (let i = 0; i < rounds; i++) {
      const sentAt = this.deviceNow();
      const server = await serverTime();
      const receivedAt = this.deviceNow();
      this.samples.push({ sentAt, serverTime: server, receivedAt });
    }
    this.samples = this.samples.slice(-10);
    this.offsetMs = estimateClockOffset(this.samples);
    return this.offsetMs;
  }
}
