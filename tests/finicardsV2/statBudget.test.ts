import { describe, expect, it } from "bun:test";
import { RULES } from "../../modules/finicardsV2/rules";
import {
  deriveType,
  formatSpread,
  normalizeSpread,
  spreadTotal,
  validateSpread,
} from "../../modules/finicardsV2/statBudget";
import type { CardRarity } from "../../types/PocketbaseTablesV2";

const RARITIES: CardRarity[] = ["common", "uncommon", "full_art"];

describe("finicards v2 stat budget", () => {
  describe("normalizeSpread", () => {
    it("always totals 15", () => {
      const inputs = [
        { power: 40, wit: 10, heart: 10 },
        { power: 1, wit: 1, heart: 1 },
        { power: 0, wit: 0, heart: 0 },
        { power: 100, wit: 0, heart: 0 },
        { power: 3, wit: 3, heart: 3 },
        { power: 7, wit: 11, heart: 2 },
      ];

      for (const rarity of RARITIES) {
        for (const input of inputs) {
          expect(spreadTotal(normalizeSpread(input, rarity))).toBe(
            RULES.statTotal,
          );
        }
      }
    });

    it("never exceeds the rarity spike ceiling", () => {
      for (const rarity of RARITIES) {
        const spread = normalizeSpread({ power: 999, wit: 1, heart: 1 }, rarity);
        expect(spread.power).toBeLessThanOrEqual(RULES.spikeCeiling[rarity]);
        expect(spreadTotal(spread)).toBe(RULES.statTotal);
      }
    });

    it("never drops a stat below the floor, so no card has a free hole", () => {
      for (const rarity of RARITIES) {
        const spread = normalizeSpread({ power: 999, wit: 0, heart: 0 }, rarity);
        expect(spread.wit).toBeGreaterThanOrEqual(RULES.statFloor);
        expect(spread.heart).toBeGreaterThanOrEqual(RULES.statFloor);
      }
    });

    it("produces whole numbers only", () => {
      const spread = normalizeSpread({ power: 7, wit: 5, heart: 3 }, "uncommon");
      for (const value of Object.values(spread)) {
        expect(Number.isInteger(value)).toBe(true);
      }
    });

    it("is deterministic, so conversion can be re-run safely", () => {
      const input = { power: 37, wit: 13, heart: 8 };
      const first = normalizeSpread(input, "uncommon");
      const second = normalizeSpread(input, "uncommon");
      expect(first).toEqual(second);
    });

    it("preserves the shape of the input weights", () => {
      const spread = normalizeSpread(
        { power: 40, wit: 20, heart: 10 },
        "full_art",
      );
      expect(spread.power).toBeGreaterThan(spread.wit);
      expect(spread.wit).toBeGreaterThan(spread.heart);
    });

    it("splits evenly when the input carries no signal", () => {
      expect(normalizeSpread({}, "common")).toEqual({
        power: 5,
        wit: 5,
        heart: 5,
      });
    });

    it("treats negative and non-finite weights as zero", () => {
      const spread = normalizeSpread(
        { power: -10, wit: Number.NaN, heart: 12 },
        "uncommon",
      );
      expect(spreadTotal(spread)).toBe(RULES.statTotal);
      expect(spread.heart).toBeGreaterThan(spread.power);
    });

    it("caps a common at 7 - the rounded, no-holes profile", () => {
      const spread = normalizeSpread({ power: 50, wit: 5, heart: 5 }, "common");
      expect(spread.power).toBe(7);
      expect(spreadTotal(spread)).toBe(15);
    });

    it("lets a full-art spike to 12", () => {
      const spread = normalizeSpread({ power: 90, wit: 5, heart: 5 }, "full_art");
      expect(spread.power).toBe(12);
      expect(formatSpread(spread)).toBe("12/2/1");
    });

    it("throws when the budget is arithmetically impossible", () => {
      expect(() =>
        normalizeSpread({ power: 1, wit: 1, heart: 1 }, "common", {
          ...RULES,
          statFloor: 6,
        }),
      ).toThrow(/Impossible stat budget/);
    });
  });

  describe("deriveType", () => {
    it("picks the highest stat", () => {
      expect(deriveType({ power: 9, wit: 3, heart: 3 })).toBe("power");
      expect(deriveType({ power: 3, wit: 9, heart: 3 })).toBe("wit");
      expect(deriveType({ power: 1, wit: 2, heart: 12 })).toBe("heart");
    });

    it("breaks ties deterministically instead of leaving them ambiguous", () => {
      expect(deriveType({ power: 5, wit: 5, heart: 5 })).toBe("power");
      expect(deriveType({ power: 3, wit: 6, heart: 6 })).toBe("wit");
    });
  });

  describe("validateSpread", () => {
    it("accepts the doc's example spreads", () => {
      expect(validateSpread({ power: 5, wit: 5, heart: 5 }, "common").valid).toBe(
        true,
      );
      expect(validateSpread({ power: 7, wit: 5, heart: 3 }, "common").valid).toBe(
        true,
      );
      expect(
        validateSpread({ power: 9, wit: 3, heart: 3 }, "uncommon").valid,
      ).toBe(true);
      expect(
        validateSpread({ power: 12, wit: 2, heart: 1 }, "full_art").valid,
      ).toBe(true);
    });

    it("rejects a common with an uncommon's spike", () => {
      const result = validateSpread({ power: 9, wit: 3, heart: 3 }, "common");
      expect(result.valid).toBe(false);
      expect(result.issues.join(" ")).toContain("spike ceiling of 7");
    });

    it("rejects a bad total", () => {
      const result = validateSpread({ power: 7, wit: 7, heart: 7 }, "uncommon");
      expect(result.valid).toBe(false);
      expect(result.issues.join(" ")).toContain("expected 15");
    });

    it("reports every problem in one pass", () => {
      const result = validateSpread({ power: 20, wit: 0, heart: 0 }, "common");
      expect(result.issues.length).toBeGreaterThan(2);
    });

    it("catches a declared type that is not the highest stat", () => {
      const result = validateSpread(
        { power: 9, wit: 3, heart: 3 },
        "uncommon",
        "wit",
      );
      expect(result.valid).toBe(false);
      expect(result.issues.join(" ")).toContain('is not the highest stat');
    });
  });
});
