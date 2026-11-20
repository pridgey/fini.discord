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

  it("hides sets with nothing in them, and says more are out there", () => {
    const text = textOf(buildItemsMessage({ ...base, held: [] }));
    expect(text).not.toContain("Dragon Balls");
    expect(text).toContain("3 collections are hidden in the deep");
    expect(text).toContain("None yet.");

    const started = textOf(buildItemsMessage({ ...base, held: ["exodia_head"] }));
    expect(started).toContain("Exodia** · 1 of 5");
    expect(started).not.toContain("Chaos Emeralds");
    expect(started).toContain("2 more collections are hidden");
  });

  it("keeps who a set summons secret until it's complete", () => {
    const partial = textOf(buildItemsMessage({ ...base, held: ["dragon_ball_1"] }));
    expect(partial).not.toContain("Shenron");
    expect(partial).toContain("summons **???**");

    const whole = textOf(
      buildItemsMessage({
        ...base,
        held: piecesOf("dragon_balls").map((piece) => piece.key),
      }),
    );
    expect(whole).toContain("summons **Shenron**");
  });

  it("turns pages when the satchel is long, and offers a dropdown to use items", () => {
    const held = [
      "dragon_ball_1",
      "exodia_head",
      "chaos_emerald_green",
      ...ITEMS.filter((item) => item.kind !== "piece").map((item) => item.key),
    ];
    const first = textOf(
      buildItemsMessage({
        ...base,
        held,
        options: [{ label: "Four-Leaf Clover", value: "boon_lucky" }],
      }),
    );
    expect(first).toContain("Page 1 of");
    expect(first).toContain("v2_items_page:1:me");
    expect(first).toContain("v2_items_use:0:me");
    expect(first).toContain("Use an item");

    const last = textOf(buildItemsMessage({ ...base, held, page: 99 }));
    expect(last).not.toContain("Page 1 of");
    expect(last).toContain("Mystery boxes");
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

describe("the satchel's switched-on boons", () => {
  it("shows them on their own, first, and counts only the rest below", () => {
    const text = textOf(
      buildItemsMessage({
        playerName: "Aya",
        holders: {},
        pieceHolders: new Map(),
        userId: "me",
        held: ["boon_lucky", "boon_lucky", "boon_purse"],
        active: ["boon_lucky", "boon_purse"],
      }),
    );
    expect(text).toContain("Switched on");
    expect(text).toContain("Four-Leaf Clover** · your next pack spends it");
    expect(text).toContain("Heavy Purse** · your next dungeon run starts with it");
    expect(text.indexOf("Switched on")).toBeLessThan(text.indexOf("Collections"));
    // One clover left in reserve, no purse.
    expect(text).toContain("Four-Leaf Clover** · Better odds");
    expect(text).not.toContain("Heavy Purse** · Start");
  });
});
