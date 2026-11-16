import { describe, expect, it } from 'vitest';
import { PositionUploader } from '../src/gps-upload.js';
import { LWD, offset } from './fixtures/the-hunt.js';

const fix = (north: number, seconds: number, accuracy = 8) => ({ ...offset(LWD, north, 0), accuracy, at: seconds * 1000 });

describe('GPS uploaden', () => {
  it('dunt de route uit: alleen bij verplaatsing, en stilstaand eens per 30 seconden', () => {
    const up = new PositionUploader();
    const kept = [
      fix(0, 0), // eerste
      fix(1, 1), // te snel
      fix(3, 6), // te weinig verplaatst
      fix(15, 7), // 15 m na 7 s: mee
      fix(16, 20), // stilstaan
      fix(16, 37), // heartbeat na 30 s
      fix(500, 40, 60), // onnauwkeurig
    ].map((f) => up.add(f));
    expect(kept).toEqual([true, false, false, true, false, true, false]);
  });

  it('verstuurt gebundeld en verliest niets zonder bereik', () => {
    const up = new PositionUploader({ flushEveryMs: 20_000 });
    for (let s = 0; s < 60; s += 6) up.add(fix(s * 2, s));
    expect(up.shouldFlush(10_000)).toBe(false);
    expect(up.shouldFlush(20_000)).toBe(true);
    const batch = up.takeBatch(20_000);
    expect(batch.length).toBe(10);
    up.requeue(batch); // versturen mislukt
    up.add(fix(200, 70));
    expect(up.takeBatch(90_000).map((f) => f.at)).toEqual([...batch.map((f) => f.at), 70_000]);
  });

  it('verstuurt direct bij een volle bundel', () => {
    const up = new PositionUploader({ maxBatch: 3 });
    [fix(0, 0), fix(20, 6), fix(40, 12)].forEach((f) => up.add(f));
    expect(up.shouldFlush(12_000)).toBe(true);
  });
});
