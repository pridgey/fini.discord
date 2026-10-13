import { describe, expect, it } from "bun:test";
import sharp from "sharp";
import { buildCardSvg, cardImageName } from "../../modules/finicardsV2/cardArt/generateCardImage";
import {
  LEGENDARY_GIF_EFFECTS,
  renderLegendaryGif,
} from "../../modules/finicardsV2/cardArt/legendaryGif";
import { toBattleCard } from "../../modules/finicardsV2/cardStore";
import {
  LEGENDARY_EFFECTS,
  LEGENDARY_ODDS,
  legendaryCode,
  legendaryTier,
  rollGuaranteedTier,
  rollLegendaryEffect,
  rollLegendaryTier,
} from "../../modules/finicardsV2/legendary";
import { availableLegendaries } from "../../modules/finicardsV2/packs";
import { rarityLabel } from "../../modules/finicardsV2/ui/theme";
import type { BattleCard, OwnedCard } from "../../modules/finicardsV2/types";
import type { V2CardDefinitionRecord } from "../../types/PocketbaseTablesV2";

/* A Legendary is a copy of a full-art that carries an animated effect. The
   effect is the copy's; the card under it is an ordinary full-art. */

const definition = (overrides: Partial<V2CardDefinitionRecord> = {}): V2CardDefinitionRecord => ({
  id: "def1",
  card_name: "Ren Kasugai",
  series: "Beacon",
  rarity: "full_art",
  power: 2,
  wit: 2,
  heart: 11,
  card_type: "heart",
  tags: [],
  keyword: "",
  cost: 3,
  set_piece: "",
  art_url: "",
  legacy_card: "",
  population: 1,
  active: true,
  ...overrides,
});

const card = (overrides: Partial<BattleCard> = {}): BattleCard => ({
  instanceId: "inst123456",
  definitionId: "def1",
  name: "Ren Kasugai",
  series: "Beacon",
  rarity: "full_art",
  type: "heart",
  stats: { power: 2, wit: 2, heart: 11 },
  keyword: "",
  foil: false,
  tags: [],
  cost: 3,
  ...overrides,
});

describe("legendary rules", () => {
  it("has a drawing for every effect, in the tier the rules give it", () => {
    expect(Object.keys(LEGENDARY_GIF_EFFECTS).sort()).toEqual(Object.keys(LEGENDARY_EFFECTS).sort());
    for (const [effect, tier] of Object.entries(LEGENDARY_EFFECTS)) {
      expect(LEGENDARY_GIF_EFFECTS[effect].tier).toBe(tier);
    }
  });

  it("knows an effect's tier and code, and that a stranger has neither", () => {
    expect(legendaryTier("breathe")).toBe(1);
    expect(legendaryCode("facets")).toBe("L4");
    expect(legendaryTier("")).toBeNull();
    expect(legendaryCode("sparkly")).toBeNull();
    expect(legendaryCode(undefined)).toBeNull();
  });

  it("gives a pack a Legendary just under one time in fifty", () => {
    const total = Object.values(LEGENDARY_ODDS).reduce((sum, odds) => sum + odds, 0);
    expect(total).toBeCloseTo(0.0196, 4);
    expect(rollLegendaryTier(total + 0.0001)).toBeNull();
    expect(rollLegendaryTier(0.5)).toBeNull();
  });

  it("gives each tier its own share of the roll, rarest first", () => {
    expect(rollLegendaryTier(0)).toBe(4);
    expect(rollLegendaryTier(0.0016)).toBe(4);
    expect(rollLegendaryTier(0.0018)).toBe(3);
    expect(rollLegendaryTier(0.0047)).toBe(2);
    expect(rollLegendaryTier(0.0097)).toBe(1);
    expect(rollLegendaryTier(0.0195)).toBe(1);
  });

  it("picks an effect from the tier asked for", () => {
    for (const tier of [1, 2, 3, 4] as const) {
      for (const roll of [0, 0.3, 0.6, 0.999]) {
        expect(LEGENDARY_EFFECTS[rollLegendaryEffect(tier, roll)]).toBe(tier);
      }
    }
    expect(rollLegendaryEffect(1, 0)).toBe("breathe");
    expect(rollLegendaryEffect(1, 0.99)).toBe("drift");
  });

  it("always lands a guaranteed pull on a tier, at the tiers' usual proportions", () => {
    expect(rollGuaranteedTier(0)).toBe(4);
    expect(rollGuaranteedTier(0.5)).toBe(1);
    expect(rollGuaranteedTier(0.999)).toBe(1);
    // Tier 1 is 1 / 1.96 of all Legendaries: a little over half.
    expect(rollGuaranteedTier(0.48)).toBe(2);
  });
});

describe("legendary cards", () => {
  it("can be any full-art that has no Legendary on the server yet, and never a Secret Art", () => {
    const pool = [
      definition({ id: "a" }),
      definition({ id: "b" }),
      definition({ id: "secret", secret_art: true }),
      definition({ id: "common", rarity: "common" }),
    ];
    expect(availableLegendaries(pool, new Set()).map((row) => row.id)).toEqual(["a", "b"]);
    expect(availableLegendaries(pool, new Set(["a"])).map((row) => row.id)).toEqual(["b"]);
  });

  it("is the one of its kind, whatever its card's own copies are numbered", () => {
    const owned: OwnedCard = {
      id: "copy1",
      user_id: "u",
      server_id: "s",
      identifier: "u-s",
      card: "def1",
      foil: false,
      legendary: "storm",
      serial: 7,
      acquired_from: "pack",
      definition: definition({ population: 3 }),
    };
    expect(toBattleCard(owned)).toMatchObject({ legendary: "storm", population: 1, serial: 1 });
  });

  it("prints its tier where a full-art prints FA, and is named for it", async () => {
    const legendary = card({ legendary: "storm", population: 1, serial: 1 });
    const svg = await buildCardSvg(legendary, { withoutArt: true });
    expect(svg).toContain(">L3</text>");
    expect(svg).toContain(">1 OF 1</text>");
    expect(rarityLabel(legendary)).toBe("Legendary L3");
    expect(rarityLabel(card())).toBe("Full Art");
  });

  it("is attached as a GIF, and everything else as a PNG", () => {
    expect(cardImageName(card({ legendary: "storm" }))).toEndWith(".gif");
    expect(cardImageName(card())).toEndWith(".png");
    expect(cardImageName(card({ legendary: "not-an-effect" }))).toEndWith(".png");
  });

  it("draws as an animated GIF of the card", async () => {
    const gif = await renderLegendaryGif(card(), null, "shimmer", { frames: 3 });
    const meta = await sharp(gif, { animated: true }).metadata();
    expect(meta.format).toBe("gif");
    expect(meta.pages).toBe(3);
    expect(meta.width).toBe(420);
  });

  it("refuses an effect that does not exist", async () => {
    await expect(renderLegendaryGif(card(), null, "sparkly")).rejects.toThrow("No Legendary effect");
  });
});
