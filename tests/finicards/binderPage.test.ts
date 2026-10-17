import { describe, expect, it } from "bun:test";
import sharp from "sharp";
import {
  BINDER_PAGE_SIZE,
  binderPageSize,
  renderBinderPage,
} from "../../modules/finicards/cardArt/binderPage";
import type { BattleCard } from "../../modules/finicards/types";

/* The collection as a binder: six pockets to a page, filled or not. */

const card = (
  name: string,
  rarity: BattleCard["rarity"] = "common",
): BattleCard => ({
  instanceId: `inst-${name}`,
  definitionId: "def",
  name,
  series: "Beacon",
  rarity,
  type: "heart",
  stats: { power: 4, wit: 4, heart: 7 },
  keyword: "",
  foil: false,
  tags: ["baker"],
  cost: 2,
});

describe("binder page", () => {
  it("holds six cards", () => {
    expect(BINDER_PAGE_SIZE).toBe(6);
  });

  it("is the same size however many pockets are filled", async () => {
    const size = binderPageSize();
    for (const cards of [
      [],
      [card("One")],
      [card("One"), card("Two", "uncommon"), card("Three", "full_art")],
    ]) {
      const meta = await sharp(await renderBinderPage(cards)).metadata();
      expect(meta.format).toBe("jpeg");
      expect({ width: meta.width, height: meta.height }).toEqual(size);
    }
  });

  it("leaves off cards beyond its pockets rather than failing", async () => {
    const many = Array.from({ length: 9 }, (_, index) => card(`Card ${index}`));
    const meta = await sharp(await renderBinderPage(many)).metadata();
    expect(meta.width).toBe(binderPageSize().width);
  });

  it("draws a card into its pocket", async () => {
    const empty = await sharp(await renderBinderPage([]))
      .raw()
      .toBuffer();
    const filled = await sharp(await renderBinderPage([card("One")]))
      .raw()
      .toBuffer();
    expect(filled.equals(empty)).toBe(false);
  });
});
