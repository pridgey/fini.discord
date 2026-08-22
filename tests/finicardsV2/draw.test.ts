import { describe, expect, it } from "bun:test";
import {
  HAND_SIZE,
  MAX_HAND_SIZE,
  MIN_HAND_SIZE,
  clampHandSize,
  dealHand,
  dealHandFromDeck,
  isLegalLineup,
} from "../../modules/finicardsV2/draw";
import { MAX_ENCODABLE_HAND } from "../../modules/finicardsV2/lineupPicker";
import { RULES } from "../../modules/finicardsV2/rules";
import type { BattleCard } from "../../modules/finicardsV2/types";

const card = (id: string): BattleCard => ({
  instanceId: id,
  definitionId: `def-${id}`,
  name: `Card ${id}`,
  series: "Test",
  rarity: "common",
  type: "power",
  stats: { power: 7, wit: 5, heart: 3 },
  keyword: "",
  foil: false,
  tags: [],
  cost: 2,
});

const deck = (size: number) =>
  Array.from({ length: size }, (_, index) => card(`c${index}`));

/** Deterministic sequence, so a deal can be asserted exactly. */
const fixedRandom = (values: number[]) => {
  let index = 0;
  return () => values[index++ % values.length];
};

describe("finicards v2 dealing", () => {
  describe("hand size", () => {
    it("deals two more than the lineup needs", () => {
      // The gap between hand and lineup is the decision - five cards into three
      // slots means two get left behind.
      expect(HAND_SIZE).toBe(RULES.rounds + 2);
    });
  });

  describe("dealHand", () => {
    it("deals the requested number of cards", () => {
      expect(dealHand(deck(20), 5)).toHaveLength(5);
    });

    it("never deals the same copy twice", () => {
      for (let attempt = 0; attempt < 200; attempt++) {
        const hand = dealHand(deck(6), 5);
        expect(new Set(hand.map((c) => c.instanceId)).size).toBe(hand.length);
      }
    });

    it("deals only cards from the deck", () => {
      const source = deck(12);
      const ids = new Set(source.map((c) => c.instanceId));
      for (const dealt of dealHand(source, 5)) {
        expect(ids.has(dealt.instanceId)).toBe(true);
      }
    });

    it("never mutates the deck it was given", () => {
      const source = deck(10);
      const before = source.map((c) => c.instanceId);
      dealHand(source, 5);
      expect(source.map((c) => c.instanceId)).toEqual(before);
    });

    it("deals the whole deck when asked for more than it holds", () => {
      expect(dealHand(deck(3), 5)).toHaveLength(3);
    });

    it("handles an empty deck", () => {
      expect(dealHand([], 5)).toEqual([]);
    });

    it("is deterministic for a given random sequence", () => {
      const source = deck(10);
      const a = dealHand(source, 5, fixedRandom([0.1, 0.5, 0.9, 0.3, 0.7]));
      const b = dealHand(source, 5, fixedRandom([0.1, 0.5, 0.9, 0.3, 0.7]));
      expect(a.map((c) => c.instanceId)).toEqual(b.map((c) => c.instanceId));
    });

    it("reaches every card in the deck over many deals", () => {
      // Uses an explicit generator rather than Math.random: a test asserting
      // coverage of a random process shouldn't depend on the ambient one, which
      // another test file may have replaced with a fixed value.
      let seed = 12345;
      const random = () => {
        seed = (seed * 1103515245 + 12345) % 2147483648;
        return seed / 2147483648;
      };

      const source = deck(8);
      const seen = new Set<string>();
      for (let attempt = 0; attempt < 500; attempt++) {
        for (const dealt of dealHand(source, 5, random)) seen.add(dealt.instanceId);
      }
      expect(seen.size).toBe(8);
    });
  });

  describe("dealHandFromDeck", () => {
    it("returns card ids", () => {
      const hand = dealHandFromDeck(deck(10));
      expect(hand).toHaveLength(HAND_SIZE);
      for (const id of hand) expect(typeof id).toBe("string");
    });
  });

  describe("isLegalLineup", () => {
    const hand = ["a", "b", "c", "d", "e"];

    it("accepts three different cards from the hand", () => {
      expect(isLegalLineup(["c", "a", "e"], hand)).toBe(true);
    });

    it("rejects a card that was never dealt", () => {
      // Without this check a client could submit any card it liked.
      expect(isLegalLineup(["a", "b", "z"], hand)).toBe(false);
    });

    it("rejects the same card twice", () => {
      expect(isLegalLineup(["a", "a", "b"], hand)).toBe(false);
    });

    it("rejects the wrong number of cards", () => {
      expect(isLegalLineup(["a", "b"], hand)).toBe(false);
      expect(isLegalLineup(["a", "b", "c", "d"], hand)).toBe(false);
    });

    it("rejects an empty lineup", () => {
      expect(isLegalLineup([], hand)).toBe(false);
    });

    it("treats order as free - any ordering of a legal set is legal", () => {
      expect(isLegalLineup(["a", "b", "c"], hand)).toBe(true);
      expect(isLegalLineup(["c", "b", "a"], hand)).toBe(true);
    });
  });
});

describe("finicards v2 configurable draw size", () => {
  it("defaults to the standard hand", () => {
    expect(clampHandSize(undefined)).toBe(HAND_SIZE);
    expect(clampHandSize(null)).toBe(HAND_SIZE);
    expect(clampHandSize(Number.NaN)).toBe(HAND_SIZE);
  });

  it("accepts the sizes worth testing", () => {
    expect(clampHandSize(3)).toBe(3);
    expect(clampHandSize(4)).toBe(4);
    expect(clampHandSize(5)).toBe(5);
  });

  it("never deals fewer cards than a lineup needs", () => {
    // Deal fewer than the lineup and there is nothing to choose between.
    expect(clampHandSize(1)).toBe(MIN_HAND_SIZE);
    expect(clampHandSize(-5)).toBe(MIN_HAND_SIZE);
    expect(MIN_HAND_SIZE).toBe(RULES.rounds);
  });

  it("caps at what the picker can encode and display", () => {
    expect(clampHandSize(99)).toBe(MAX_HAND_SIZE);
    expect(MAX_HAND_SIZE).toBeLessThanOrEqual(MAX_ENCODABLE_HAND);
  });

  it("rounds a fractional request", () => {
    expect(clampHandSize(4.4)).toBe(4);
    expect(clampHandSize(4.6)).toBe(5);
  });

  it("deals exactly the requested size", () => {
    for (const size of [3, 4, 5]) {
      expect(dealHandFromDeck(deck(20), size)).toHaveLength(size);
    }
  });

  it("still validates a lineup against a smaller hand", () => {
    const three = ["a", "b", "c"];
    expect(isLegalLineup(["a", "b", "c"], three)).toBe(true);
    expect(isLegalLineup(["a", "b", "z"], three)).toBe(false);
  });
});
