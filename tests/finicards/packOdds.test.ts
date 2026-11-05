import { describe, expect, it } from "bun:test";
import {
  PACK_ODDS,
  SET_PACK_ODDS,
  GOD_PACK_CHANCE,
  canFillGodPack,
  rollPackRarities,
} from "../../modules/finicards/packs";

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
    const random = () =>
      (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
    const share = (odds: typeof PACK_ODDS) =>
      rollPackRarities(20_000, odds, random).filter(
        (rarity) => rarity === "full_art",
      ).length / 20_000;
    expect(share(SET_PACK_ODDS)).toBeCloseTo(0.03, 1);
    expect(share(PACK_ODDS)).toBeCloseTo(0.05, 1);
  });
});

describe("god packs", () => {
  const fullArt = (id: string, population: number, secret_art = false) =>
    ({ id, rarity: "full_art", population, secret_art }) as never;

  it("are rarer than a tier 3 Legendary", () => {
    expect(GOD_PACK_CHANCE).toBeGreaterThan(0);
    expect(GOD_PACK_CHANCE).toBeLessThan(0.0029);
  });

  it("roll only while there is a full-art copy for every slot", () => {
    const pool = [fullArt("a", 2), fullArt("b", 3)];
    expect(canFillGodPack(pool, new Map(), 5)).toBe(true);
    expect(canFillGodPack(pool, new Map([["a", 1]]), 5)).toBe(false);
  });

  it("count an unlimited full-art as endless, and never a Secret Art", () => {
    expect(canFillGodPack([fullArt("a", 0)], new Map(), 5)).toBe(true);
    expect(canFillGodPack([fullArt("s", 0, true)], new Map(), 5)).toBe(false);
  });
});
