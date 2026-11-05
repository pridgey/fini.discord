import {
  GOD_PACK_CAP,
  GOD_PACK_COOLDOWN_MS,
  GOD_PACK_START,
  godPackChance,
} from "../../modules/finicards/godPacks";
import { describe, expect, it } from "bun:test";
import {
  PACK_ODDS,
  SET_PACK_ODDS,
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

describe("god pack odds", () => {
  const now = new Date("2026-11-04T12:00:00Z");
  const ago = (ms: number) => new Date(now.getTime() - ms);
  const day = 24 * 60 * 60 * 1000;

  it("are none for a week after a god pack, however many packs open", () => {
    for (const lastGodPackAt of [
      ago(0),
      ago(day),
      ago(GOD_PACK_COOLDOWN_MS - 1),
    ])
      expect(
        godPackChance({ lastGodPackAt, packsSinceCooldown: 10_000 }, now),
      ).toBe(0);
  });

  it("start low once the cooldown is over and climb per pack to a cap", () => {
    const after = (packs: number) =>
      godPackChance(
        { lastGodPackAt: ago(GOD_PACK_COOLDOWN_MS), packsSinceCooldown: packs },
        now,
      );
    expect(after(0)).toBe(GOD_PACK_START);
    expect(after(200)).toBeCloseTo((GOD_PACK_START + GOD_PACK_CAP) / 2, 6);
    expect(after(400)).toBe(GOD_PACK_CAP);
    expect(after(5_000)).toBe(GOD_PACK_CAP);
  });

  it("ramp from the server's first pack when it has never had one", () => {
    expect(
      godPackChance({ lastGodPackAt: null, packsSinceCooldown: 0 }, now),
    ).toBe(GOD_PACK_START);
  });

  it("stay under a tier 3 Legendary at their highest", () => {
    expect(GOD_PACK_CAP).toBeLessThan(0.0029);
  });
});
