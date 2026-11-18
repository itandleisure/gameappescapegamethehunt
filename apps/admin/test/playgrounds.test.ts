import { describe, expect, it } from "vitest";
import {
  newPiece,
  playgroundKey,
  rectBetween,
  toImagePoint,
} from "../src/lib/playgrounds";

describe("tabbladen", () => {
  it("rekent een muispositie om naar pixels van de foto", () => {
    const box = { left: 100, top: 50, width: 360, height: 1625 };
    expect(
      toImagePoint({ x: 100 + 90, y: 50 + 250 }, box, {
        width: 1440,
        height: 6500,
      }),
    ).toEqual({ x: 360, y: 1000 });
    expect(
      toImagePoint({ x: 0, y: 99999 }, box, { width: 1440, height: 6500 }),
    ).toEqual({ x: 0, y: 6500 });
  });

  it("maakt een vak in elke sleeprichting", () => {
    expect(rectBetween({ x: 480, y: 1300 }, { x: 40, y: 880 })).toEqual({
      x: 40,
      y: 880,
      w: 440,
      h: 420,
    });
  });

  it("zet een nieuw vak binnen de foto", () => {
    const p = newPiece({ width: 1440, height: 6500 }, "puzzel-tangram");
    expect(p.x + p.w).toBeLessThanOrEqual(1440);
    expect(p.y + p.h).toBeLessThanOrEqual(6500);
  });

  it("maakt een sleutel van een naam", () => {
    expect(playgroundKey("Extractiepunt Één!")).toBe("extractiepunt-een");
  });
});
