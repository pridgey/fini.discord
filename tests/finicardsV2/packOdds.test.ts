import { describe, expect, it } from "bun:test";
import { PACK_ODDS, SET_PACK_ODDS, rollPackRarities } from "../../modules/finicardsV2/packs";

describe("pack odds", () => {
  it("are percentages that add up to 100", () => {
    for (const odds of [PACK_ODDS, SET_PACK_ODDS]) {
      expect(odds.common + odds.uncommon + odds.full_art).toBe(100);
    }
  });

  it("give a set pack fewer rares than a pack drawn from every set", () => {
    expect(SET_PACK_ODDS.full_art).toBeLessThan(PACK_ODDS.full_art);
    expect(SET_PACK_ODDS.uncommon).toBeLessThan(PACK_ODDS.uncommon);
    let seed = 3;
    const random = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
    const share = (odds: typeof PACK_ODDS) =>
      rollPackRarities(20_000, odds, random).filter((rarity) => rarity === "full_art").length / 20_000;
    expect(share(SET_PACK_ODDS)).toBeCloseTo(0.03, 1);
    expect(share(PACK_ODDS)).toBeCloseTo(0.05, 1);
  });
});
