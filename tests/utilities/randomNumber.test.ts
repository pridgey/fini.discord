import { describe, expect, it } from "bun:test";
// Other suites replace this module with mock.module, which Bun applies to the
// whole run. Importing it under a query gives this test its own, real copy.
const UNMOCKED = "../../utilities/randomNumber/randomNumber.ts?unmocked";
type RandomNumberModule =
  typeof import("../../utilities/randomNumber/randomNumber");
const { randomNumber } = (await import(UNMOCKED)) as RandomNumberModule;

describe("randomNumber", () => {
  it("rolls every face of a die equally often, the ends included", () => {
    const ROLLS = 200_000;
    const counts = new Map<number, number>();
    for (let i = 0; i < ROLLS; i++) {
      const roll = randomNumber(1, 20, true);
      counts.set(roll, (counts.get(roll) ?? 0) + 1);
    }

    expect([...counts.keys()].sort((a, b) => a - b)).toEqual(
      Array.from({ length: 20 }, (_, i) => i + 1),
    );
    // Each face should land about 5% of the time. Rounding instead of
    // flooring once gave 1 and 20 half that.
    for (const count of counts.values()) {
      expect(count / ROLLS).toBeGreaterThan(0.045);
      expect(count / ROLLS).toBeLessThan(0.055);
    }
  });

  it("gives decimals from min up to max", () => {
    for (let i = 0; i < 1_000; i++) {
      const value = randomNumber(5, 10);
      expect(value).toBeGreaterThanOrEqual(5);
      expect(value).toBeLessThan(10);
    }
  });
});
