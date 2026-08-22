import { describe, expect, it } from "bun:test";
import {
  MAX_DECK_SIZE,
  MIN_DECK_SIZE,
  buildDeckCards,
} from "../../modules/finicardsV2/decks";
import { HAND_SIZE } from "../../modules/finicardsV2/draw";
import type { OwnedCard } from "../../modules/finicardsV2/types";
import type {
  CardRarity,
  CardType,
} from "../../types/PocketbaseTablesV2";

const owned = (
  id: string,
  overrides: {
    type?: CardType;
    rarity?: CardRarity;
    tags?: string[];
    spike?: number;
  } = {},
): OwnedCard => {
  const type = overrides.type ?? "power";
  const spike = overrides.spike ?? 7;
  const rest = Math.max(1, Math.floor((15 - spike) / 2));
  const stats = { power: rest, wit: rest, heart: rest } as Record<CardType, number>;
  stats[type] = spike;

  return {
    id,
    user_id: "u",
    server_id: "s",
    identifier: "u-s",
    card: `def-${id}`,
    foil: false,
    acquired_from: "test",
    definition: {
      id: `def-${id}`,
      card_name: `Card ${id}`,
      series: "Test",
      rarity: overrides.rarity ?? "common",
      power: stats.power,
      wit: stats.wit,
      heart: stats.heart,
      card_type: type,
      tags: overrides.tags ?? [],
      keyword: "",
      cost: 2,
      set_piece: "",
      art_url: "",
      legacy_card: "",
      population: 0,
      active: true,
    },
  };
};

const collection = (size: number) =>
  Array.from({ length: size }, (_, index) =>
    owned(`c${index}`, {
      type: (["power", "wit", "heart"] as CardType[])[index % 3],
      spike: 5 + (index % 5),
    }),
  );

describe("finicards v2 decks", () => {
  describe("size rules", () => {
    it("requires enough cards to fill a hand", () => {
      expect(MIN_DECK_SIZE).toBeGreaterThanOrEqual(HAND_SIZE);
    });
  });

  describe("buildDeckCards", () => {
    it("takes the requested number of cards", () => {
      expect(buildDeckCards(collection(40), { size: 20 })).toHaveLength(20);
    });

    it("defaults to 20", () => {
      expect(buildDeckCards(collection(40))).toHaveLength(20);
    });

    it("never returns more cards than the collection holds", () => {
      expect(buildDeckCards(collection(8), { size: 20 })).toHaveLength(8);
    });

    it("clamps a request above the deck limit", () => {
      expect(
        buildDeckCards(collection(80), { size: 500 }).length,
      ).toBeLessThanOrEqual(MAX_DECK_SIZE);
    });

    it("prefers the strongest cards by type stat", () => {
      const pool = [
        owned("weak", { spike: 5 }),
        owned("strong", { spike: 12, rarity: "full_art" }),
        owned("mid", { spike: 8, rarity: "uncommon" }),
      ];
      expect(buildDeckCards(pool, { size: 5 })[0]).toBe("strong");
    });

    it("returns unique ids", () => {
      const cards = buildDeckCards(collection(40), { size: 20 });
      expect(new Set(cards).size).toBe(cards.length);
    });

    it("is stable across rebuilds", () => {
      const pool = collection(30);
      expect(buildDeckCards(pool, { size: 15 })).toEqual(
        buildDeckCards(pool, { size: 15 }),
      );
    });
  });

  describe("build filters", () => {
    it("filters by type", () => {
      const pool = [
        owned("p1", { type: "power" }),
        owned("w1", { type: "wit" }),
        owned("h1", { type: "heart" }),
        owned("p2", { type: "power" }),
      ];
      expect(buildDeckCards(pool, { type: "power", size: 10 }).sort()).toEqual([
        "p1",
        "p2",
      ]);
    });

    it("filters by rarity", () => {
      const pool = [
        owned("c1", { rarity: "common" }),
        owned("u1", { rarity: "uncommon" }),
        owned("f1", { rarity: "full_art" }),
      ];
      expect(buildDeckCards(pool, { rarity: "uncommon", size: 10 })).toEqual([
        "u1",
      ]);
    });

    it("filters by tag", () => {
      const pool = [
        owned("a", { tags: ["shonen", "hero"] }),
        owned("b", { tags: ["mecha"] }),
        owned("c", { tags: ["shonen"] }),
      ];
      expect(buildDeckCards(pool, { tag: "shonen", size: 10 }).sort()).toEqual([
        "a",
        "c",
      ]);
    });

    it("combines filters", () => {
      const pool = [
        owned("a", { type: "wit", rarity: "uncommon", tags: ["magic"] }),
        owned("b", { type: "wit", rarity: "common", tags: ["magic"] }),
        owned("c", { type: "power", rarity: "uncommon", tags: ["magic"] }),
      ];
      expect(
        buildDeckCards(pool, { type: "wit", rarity: "uncommon", size: 10 }),
      ).toEqual(["a"]);
    });

    it("returns nothing when no card matches", () => {
      expect(
        buildDeckCards(collection(10), { tag: "nonexistent", size: 10 }),
      ).toEqual([]);
    });

    it("can build a mono-type deck, which the type wheel will punish", () => {
      // Legal to build, and a 3-0 loss to the counter type. The math does the
      // teaching, not a rule.
      const cards = buildDeckCards(collection(30), { type: "heart", size: 10 });
      expect(cards.length).toBeGreaterThan(0);
    });
  });
});
