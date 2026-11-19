import { describe, expect, it } from "bun:test";
import {
  COLLECTIONS,
  ITEMS,
  itemByKey,
  piecesOf,
  setProgress,
  type CollectionKey,
} from "../../modules/finicards/items";
import { buildItemsMessage } from "../../modules/finicards/ui/itemsMessage";
import { normalizeSpread, validateSpread } from "../../modules/finicards/statBudget";
import { PACK_ODDS, SET_PACK_ODDS, rollRarity } from "../../modules/finicards/packs";
import { layoutFor } from "../../modules/finicards/cardArt/layouts";
import { RULES, statTotalFor } from "../../modules/finicards/rules";

const textOf = (message: { components: { toJSON(): unknown }[] }) =>
  JSON.stringify(message.components.map((c) => c.toJSON()));

describe("the item catalogue", () => {
  it("has a unique key for every item", () => {
    const keys = ITEMS.map((item) => item.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(itemByKey("dragon_ball_4")?.name).toBe("4-Star Dragon Ball");
    expect(itemByKey("nope")).toBeUndefined();
  });

  it("holds seven Dragon Balls, five Exodia pieces and seven Chaos Emeralds", () => {
    expect(piecesOf("dragon_balls")).toHaveLength(7);
    expect(piecesOf("exodia")).toHaveLength(5);
    expect(piecesOf("chaos_emeralds")).toHaveLength(7);
    for (const key of Object.keys(COLLECTIONS) as CollectionKey[]) {
      for (const piece of piecesOf(key)) expect(piece.short).toBeTruthy();
    }
  });

  it("saves each set's last pieces for the deepest runs", () => {
    for (const key of Object.keys(COLLECTIONS) as CollectionKey[]) {
      expect(piecesOf(key).some((piece) => piece.tier === 3)).toBe(true);
    }
    expect(itemByKey("exodia_head")?.tier).toBe(3);
  });
});

describe("set progress", () => {
  it("says what's held and what's missing", () => {
    const progress = setProgress("exodia", [
      "exodia_left_arm",
      "exodia_head",
      "dragon_ball_1",
    ]);
    expect(progress.have.map((entry) => entry.item.short)).toEqual([
      "Left Arm",
      "Head",
    ]);
    expect(progress.missing).toHaveLength(3);
    expect(progress.complete).toBe(false);
    expect(
      setProgress(
        "exodia",
        piecesOf("exodia").map((piece) => piece.key),
      ).complete,
    ).toBe(true);
  });
});

describe("the satchel", () => {
  const base = {
    playerName: "Aya",
    holders: {},
    pieceHolders: new Map<string, string>(),
    userId: "me",
  };

  it("shows every set, and none-yet for empty boon shelves", () => {
    const text = textOf(buildItemsMessage({ ...base, held: [] }));
    expect(text).toContain("Dragon Balls");
    expect(text).toContain("0 of 5");
    expect(text).toContain("None yet.");
  });

  it("points at whoever holds a missing piece", () => {
    const text = textOf(
      buildItemsMessage({
        ...base,
        held: ["dragon_ball_1", "boon_lucky", "boon_lucky"],
        pieceHolders: new Map([
          ["dragon_ball_1", "me"],
          ["dragon_ball_3", "fen"],
        ]),
      }),
    );
    expect(text).toContain("1 of 7");
    expect(text).toContain("3★ (<@fen> has it)");
    expect(text).toContain("Four-Leaf Clover** ×2");
  });

  it("calls a set's pieces keepsakes once its card is summoned", () => {
    const text = textOf(
      buildItemsMessage({
        ...base,
        held: ["chaos_emerald_green"],
        holders: { chaos_emeralds: "fen" },
      }),
    );
    expect(text).toContain("Super Sonic has been summoned on this server by <@fen>");
  });
});

describe("the Summoned rarity", () => {
  it("totals 18, with one stat up to 14", () => {
    expect(statTotalFor("summoned")).toBe(18);
    expect(statTotalFor("full_art")).toBe(RULES.statTotal);
    const spread = normalizeSpread({ power: 20, wit: 3, heart: 1 }, "summoned");
    expect(spread.power + spread.wit + spread.heart).toBe(18);
    expect(spread.power).toBeLessThanOrEqual(14);
    expect(validateSpread({ power: 14, wit: 3, heart: 1 }, "summoned").valid).toBe(true);
    expect(validateSpread({ power: 12, wit: 2, heart: 1 }, "summoned").valid).toBe(false);
  });

  it("never comes out of a pack", () => {
    expect(PACK_ODDS.summoned).toBe(0);
    expect(SET_PACK_ODDS.summoned).toBe(0);
    for (let i = 0; i < 1000; i++) {
      expect(rollRarity(PACK_ODDS, () => i / 1000)).not.toBe("summoned");
    }
  });

  it("prints SU on the full-art frame until it has its own", () => {
    expect(layoutFor("summoned", false).rarityCode).toBe("SU");
    expect(layoutFor("full_art", false).rarityCode).toBe("FA");
  });
});
