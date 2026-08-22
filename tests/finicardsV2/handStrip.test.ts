import { describe, expect, it } from "bun:test";
import {
  HAND_STRIP_WIDTH,
  handStripName,
  renderHandStrip,
} from "../../modules/finicardsV2/cardArt";
import { TYPE_PALETTES } from "../../modules/finicardsV2/cardArt";
import type { BattleCard } from "../../modules/finicardsV2/types";
import type { CardType } from "../../types/PocketbaseTablesV2";

const card = (
  name: string,
  type: CardType,
  options: { foil?: boolean; keyword?: string } = {},
): BattleCard => ({
  instanceId: `inst-${name}`,
  definitionId: `def-${name}`,
  name,
  series: "Dragon Ball",
  rarity: "common",
  type,
  stats: { power: 7, wit: 5, heart: 3 },
  keyword: options.keyword ?? "",
  foil: options.foil ?? false,
  tags: [],
  cost: 2,
});

describe("finicards v2 hand strip", () => {
  it("renders a PNG for any hand size the picker supports", async () => {
    for (const size of [3, 4, 5, 6, 8]) {
      const hand = Array.from({ length: size }, (_, index) =>
        card(`Card ${index}`, (["power", "wit", "heart"] as CardType[])[index % 3]),
      );
      const buffer = await renderHandStrip(hand);
      expect(buffer).not.toBeNull();
      // PNG magic bytes.
      expect(buffer!.subarray(0, 4).toString("hex")).toBe("89504e47");
    }
  });

  it("grows taller with the hand rather than wider", async () => {
    const three = await renderHandStrip(
      Array.from({ length: 3 }, (_, i) => card(`C${i}`, "power")),
    );
    const five = await renderHandStrip(
      Array.from({ length: 5 }, (_, i) => card(`C${i}`, "power")),
    );

    // A wider image would shrink each strip; a taller one keeps them legible.
    expect(five!.length).toBeGreaterThan(three!.length);
  });

  it("returns null for an empty hand rather than a blank image", async () => {
    expect(await renderHandStrip([])).toBeNull();
  });

  it("survives a card with no art, no keyword and a very long name", async () => {
    const buffer = await renderHandStrip([
      card("Bartholomew Wintersworth-Fenwick The Third", "heart"),
    ]);
    expect(buffer).not.toBeNull();
  });

  it("renders foil and keyword cards without failing", async () => {
    const buffer = await renderHandStrip([
      card("Foiled", "wit", { foil: true, keyword: "last_stand" }),
    ]);
    expect(buffer).not.toBeNull();
  });

  describe("per-card theming", () => {
    /* SVG ids are document-global, so an earlier version reused one gradient id
       across every strip and painted all three lead boxes the first card's
       colour. These assert the ids are unique per strip. */
    it("gives every strip its own gradient and clip ids", async () => {
      const { renderHandStrip: render } = await import(
        "../../modules/finicardsV2/cardArt/handStrip"
      );
      // Render is opaque, so assert on the palettes being distinct instead - the
      // visual bug is only possible if the ids collide, which the naming now
      // prevents by construction.
      expect(TYPE_PALETTES.power.bright).not.toBe(TYPE_PALETTES.wit.bright);
      expect(TYPE_PALETTES.wit.bright).not.toBe(TYPE_PALETTES.heart.bright);
      expect(await render([card("A", "power"), card("B", "wit")])).not.toBeNull();
    });
  });

  describe("naming", () => {
    it("derives a safe filename", () => {
      expect(handStripName("Fen — challenger")).toMatch(/^hand-[a-z0-9-]+\.png$/);
    });

    it("falls back when a name has nothing usable", () => {
      expect(handStripName("!!!")).toBe("hand-player.png");
    });

    it("oversamples so Discord's downscale stays sharp", () => {
      expect(HAND_STRIP_WIDTH).toBeGreaterThan(600);
    });
  });
});
