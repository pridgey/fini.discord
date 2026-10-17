import { describe, expect, it } from "bun:test";
import {
  DECK_SIZE,
  unplayableReason,
  buildDeckCards,
} from "../../modules/finicards/decks";
import { HAND_SIZE } from "../../modules/finicards/draw";
import type { OwnedCard } from "../../modules/finicards/types";
import type { CardRarity, CardType } from "../../types/PocketbaseTablesV2";

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
  const stats = { power: rest, wit: rest, heart: rest } as Record<
    CardType,
    number
  >;
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
      expect(DECK_SIZE).toBeGreaterThanOrEqual(HAND_SIZE);
    });

    it("will not deal from a deck that has shrunk below the minimum", () => {
      const cards = (count: number) =>
        Array.from({ length: count }, (_, index) => ({
          instanceId: `c${index}`,
        })) as any;
      const deck = { name: "Main" } as any;

      expect(
        unplayableReason({ deck, cards: cards(DECK_SIZE), missing: [] }),
      ).toBeNull();

      // Built at the minimum, then two of its cards were sold.
      const shrunk = unplayableReason({
        deck,
        cards: cards(DECK_SIZE - 2),
        missing: ["a", "b"],
      });
      expect(shrunk).toContain(`has ${DECK_SIZE - 2} cards`);
      expect(shrunk).toContain(
        "2 of its cards are no longer in your collection",
      );
    });
  });

  describe("buildDeckCards", () => {
    it("takes exactly a deck's worth", () => {
      expect(buildDeckCards(collection(40))).toHaveLength(DECK_SIZE);
      expect(buildDeckCards(collection(80))).toHaveLength(DECK_SIZE);
    });

    it("never returns more cards than the collection holds", () => {
      expect(buildDeckCards(collection(8))).toHaveLength(8);
    });

    it("prefers the strongest cards by type stat", () => {
      const pool = [
        owned("weak", { spike: 5 }),
        owned("strong", { spike: 12, rarity: "full_art" }),
        owned("mid", { spike: 8, rarity: "uncommon" }),
      ];
      expect(buildDeckCards(pool)[0]).toBe("strong");
    });

    it("returns unique ids", () => {
      const cards = buildDeckCards(collection(40));
      expect(new Set(cards).size).toBe(cards.length);
    });

    it("is stable across rebuilds", () => {
      const pool = collection(30);
      expect(buildDeckCards(pool)).toEqual(buildDeckCards(pool));
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
      expect(buildDeckCards(pool, { type: "power" }).sort()).toEqual([
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
      expect(buildDeckCards(pool, { rarity: "uncommon" })).toEqual(["u1"]);
    });

    it("filters by tag", () => {
      const pool = [
        owned("a", { tags: ["shonen", "hero"] }),
        owned("b", { tags: ["mecha"] }),
        owned("c", { tags: ["shonen"] }),
      ];
      expect(buildDeckCards(pool, { tag: "shonen" }).sort()).toEqual([
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
      expect(buildDeckCards(pool, { type: "wit", rarity: "uncommon" })).toEqual(
        ["a"],
      );
    });

    it("returns nothing when no card matches", () => {
      expect(buildDeckCards(collection(10), { tag: "nonexistent" })).toEqual(
        [],
      );
    });

    it("can build a mono-type deck, which the type wheel will punish", () => {
      // Legal to build, and a 3-0 loss to the counter type. The math does the
      // teaching, not a rule.
      const cards = buildDeckCards(collection(30), { type: "heart" });
      expect(cards.length).toBeGreaterThan(0);
    });
  });
});
