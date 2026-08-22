import { describe, expect, it } from "bun:test";
import {
  RAKE,
  calculatePotSplit,
} from "../../modules/finicardsV2/wagers";

describe("finicards v2 wager pot split", () => {
  it("never mints or destroys coin", () => {
    for (const wager of [0, 1, 3, 7, 10, 25, 99, 1000, 12345]) {
      const split = calculatePotSplit(wager);
      expect(split.jackpotCut + split.payout).toBe(split.pot);
      expect(split.pot).toBe(wager * 2);
    }
  });

  it("rakes the configured share of the pot to the jackpot", () => {
    const split = calculatePotSplit(50, { jackpotShare: 0.1, rakeDraws: false });
    expect(split.pot).toBe(100);
    expect(split.jackpotCut).toBe(10);
    expect(split.payout).toBe(90);
  });

  it("rounds the rake down, so the winner never loses a coin to rounding", () => {
    // Pot of 10, 10% rake = 1.0 exactly; pot of 6, 10% = 0.6 -> 0.
    expect(calculatePotSplit(3).jackpotCut).toBe(0);
    expect(calculatePotSplit(5).jackpotCut).toBe(1);
  });

  it("pays the whole pot when the rake is switched off", () => {
    const split = calculatePotSplit(40, { jackpotShare: 0, rakeDraws: false });
    expect(split.jackpotCut).toBe(0);
    expect(split.payout).toBe(80);
  });

  it("clamps a nonsense rake share instead of inventing coin", () => {
    expect(calculatePotSplit(10, { jackpotShare: 5, rakeDraws: false })).toEqual(
      { pot: 20, jackpotCut: 20, payout: 0 },
    );
    expect(calculatePotSplit(10, { jackpotShare: -1, rakeDraws: false })).toEqual(
      { pot: 20, jackpotCut: 0, payout: 20 },
    );
  });

  it("treats a zero or negative wager as no pot", () => {
    expect(calculatePotSplit(0)).toEqual({ pot: 0, jackpotCut: 0, payout: 0 });
    expect(calculatePotSplit(-50)).toEqual({ pot: 0, jackpotCut: 0, payout: 0 });
  });

  it("defaults to a 10% rake that leaves draws alone", () => {
    expect(RAKE.jackpotShare).toBe(0.1);
    expect(RAKE.rakeDraws).toBe(false);
  });
});
