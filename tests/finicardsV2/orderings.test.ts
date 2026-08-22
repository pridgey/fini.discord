import { describe, expect, it } from "bun:test";
import {
  MAX_ORDER_BUTTONS,
  applyOrdering,
  orderingLabel,
  orderingsFitInButtons,
  permutationsOf,
  shortOrderingLabel,
} from "../../modules/finicardsV2/orderings";
import { RULES } from "../../modules/finicardsV2/rules";
import type { BattleCard } from "../../modules/finicardsV2/types";

const card = (name: string): BattleCard => ({
  instanceId: `inst-${name}`,
  definitionId: `def-${name}`,
  name,
  series: "Test",
  rarity: "common",
  type: "power",
  stats: { power: 7, wit: 5, heart: 3 },
  keyword: "",
  foil: false,
  tags: [],
  cost: 2,
});

describe("finicards v2 slot orderings", () => {
  describe("permutationsOf", () => {
    it("produces every ordering of three cards", () => {
      const orderings = permutationsOf(3);
      expect(orderings).toHaveLength(6);
      expect(new Set(orderings.map((o) => o.join(""))).size).toBe(6);
    });

    it("uses each index exactly once per ordering", () => {
      for (const ordering of permutationsOf(4)) {
        expect([...ordering].sort()).toEqual([0, 1, 2, 3]);
      }
    });

    it("is stable across calls, so a button index always means the same order", () => {
      expect(permutationsOf(3)).toEqual(permutationsOf(3));
      expect(permutationsOf(3)[0]).toEqual([0, 1, 2]);
    });

    it("handles the degenerate cases", () => {
      expect(permutationsOf(0)).toEqual([[]]);
      expect(permutationsOf(1)).toEqual([[0]]);
    });
  });

  describe("button-picker limits", () => {
    it("fits the current lineup size", () => {
      expect(orderingsFitInButtons(RULES.rounds)).toBe(true);
    });

    it("fits 3 and 4 cards but not 5", () => {
      expect(orderingsFitInButtons(3)).toBe(true);
      expect(orderingsFitInButtons(4)).toBe(true);
      expect(orderingsFitInButtons(5)).toBe(false);
    });

    it("never offers more buttons than Discord allows", () => {
      for (let size = 1; size <= 4; size++) {
        if (!orderingsFitInButtons(size)) continue;
        expect(permutationsOf(size).length).toBeLessThanOrEqual(
          MAX_ORDER_BUTTONS,
        );
      }
    });
  });

  describe("applyOrdering", () => {
    it("reorders in the given sequence", () => {
      expect(applyOrdering(["a", "b", "c"], [2, 0, 1])).toEqual(["c", "a", "b"]);
    });

    it("returns a permutation of the input, never a subset", () => {
      const ids = ["a", "b", "c"];
      for (const ordering of permutationsOf(3)) {
        expect([...applyOrdering(ids, ordering)].sort()).toEqual(["a", "b", "c"]);
      }
    });
  });

  describe("labels", () => {
    it("reads as the slot order", () => {
      const cards = [card("Goku"), card("Krillin"), card("Roshi")];
      expect(orderingLabel(cards, [2, 0, 1])).toBe("Roshi → Goku → Krillin");
    });

    it("stays inside Discord's 80-character button limit", () => {
      const cards = [
        card("A Very Long Card Name Indeed Truly"),
        card("Another Extremely Long Card Name Here"),
        card("And A Third One That Runs On"),
      ];

      for (const ordering of permutationsOf(3)) {
        expect(shortOrderingLabel(cards, ordering).length).toBeLessThanOrEqual(80);
      }
    });

    it("leaves short labels untouched", () => {
      const cards = [card("Goku"), card("Krillin"), card("Roshi")];
      expect(shortOrderingLabel(cards, [0, 1, 2])).toBe(
        "Goku → Krillin → Roshi",
      );
    });
  });
});
