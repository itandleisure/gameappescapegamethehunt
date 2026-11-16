import type { AnswerValue, GameEvent, LatLng } from '../src/types.js';

export const T0 = Date.UTC(2026, 10, 21, 13, 0, 0);
export const min = (m: number) => T0 + Math.round(m * 60_000);

type Body = GameEvent extends infer E ? (E extends GameEvent ? Omit<E, 'id' | 'at'> : never) : never;

/** Bouwt een reeks gebeurtenissen van een team, met tijden in minuten na de start. */
export class Script {
  readonly events: GameEvent[] = [];
  private n = 0;

  add(minute: number, body: Body): this {
    this.n += 1;
    this.events.push({ id: `e${String(this.n).padStart(3, '0')}`, at: min(minute), ...body } as GameEvent);
    return this;
  }

  reach(minute: number, task: string, point: LatLng, accuracy = 8): this {
    return this.add(minute, { type: 'locationReached', task, lat: point.lat, lng: point.lng, accuracy });
  }

  answer(minute: number, task: string, answer: AnswerValue): this {
    return this.add(minute, { type: 'answered', task, answer });
  }

  text(minute: number, task: string, text: string): this {
    return this.answer(minute, task, { type: 'text', text });
  }

  ok(minute: number, task: string): this {
    return this.answer(minute, task, { type: 'info' });
  }

  hint(minute: number, task: string, hint: number): this {
    return this.add(minute, { type: 'hintUsed', task, hint });
  }

  confirm(minute: number, task: string): this {
    return this.add(minute, { type: 'confirmed', task });
  }
}
