import { describe, expect, it } from "bun:test";
import {
  LEGACY_RARITY_MAP,
  SPIKE_GAMMA,
  assignKeyword,
  channelMeans,
  convertLegacyCard,
  convertLegacyPool,
  legacyGrantsFoil,
  legacyStatWeights,
  legacyTags,
} from "../../modules/finicardsV2/convertLegacyCards";
import { findKeyword } from "../../modules/finicardsV2/keywords";
import { RULES } from "../../modules/finicardsV2/rules";
import { validateSpread } from "../../modules/finicardsV2/statBudget";
import type { CardDefinitionRecord } from "../../types/PocketbaseTables";

const legacy = (
  overrides: Partial<CardDefinitionRecord> = {},
): CardDefinitionRecord => ({
  id: "legacy001",
  card_name: "Goku",
  color: "red",
  type: "Fighter",
  series: "Dragon Ball",
  rarity: "u",
  image: "goku.png",
  strength: 20,
  agility: 12,
  endurance: 16,
  intellect: 8,
  luck: 4,
  population: 3,
  description: "",
  set: 1,
  ...overrides,
});

describe("finicards v2 legacy conversion", () => {
  describe("rarity mapping", () => {
    it("maps the three battling rarities across", () => {
      expect(LEGACY_RARITY_MAP.c).toBe("common");
      expect(LEGACY_RARITY_MAP.u).toBe("uncommon");
      expect(LEGACY_RARITY_MAP.fa).toBe("full_art");
    });

    it("folds legendaries into full-art rather than adding a fourth tier", () => {
      expect(LEGACY_RARITY_MAP.l).toBe("full_art");
      expect(legacyGrantsFoil(legacy({ rarity: "l" }))).toBe(true);
      expect(legacyGrantsFoil(legacy({ rarity: "fa" }))).toBe(false);
    });

    it("skips item cards, which are not battlers", () => {
      expect(convertLegacyCard(legacy({ rarity: "i" }))).toBeNull();
      expect(convertLegacyCard(legacy({ rarity: "ri" }))).toBeNull();
    });
  });

  describe("stat mapping", () => {
    it("folds five v1 stats into three v2 stats", () => {
      expect(legacyStatWeights(legacy())).toEqual({
        power: 36, // strength 20 + endurance 16
        wit: 20, //  intellect 8 + agility 12
        heart: 8, //  luck 4 x 2
      });
    });

    it("produces a legal spread for every rarity", () => {
      for (const rarity of ["c", "u", "fa", "l"] as const) {
        const converted = convertLegacyCard(legacy({ rarity }))!;
        const validation = validateSpread(
          {
            power: converted.power,
            wit: converted.wit,
            heart: converted.heart,
          },
          converted.rarity,
          converted.card_type,
        );
        expect(validation.issues).toEqual([]);
      }
    });

    it("keeps the dominant stat of the original card", () => {
      const converted = convertLegacyCard(legacy())!;
      expect(converted.card_type).toBe("power");
      expect(converted.power).toBeGreaterThan(converted.wit);
      expect(converted.power).toBeGreaterThan(converted.heart);
    });

    it("preserves the full ordering at common, where nothing is sharpened", () => {
      // Commons sit at gamma 1.0 - proportional, rounded, no holes.
      const converted = convertLegacyCard(legacy({ rarity: "c" }))!;
      expect(converted.power).toBeGreaterThan(converted.wit);
      expect(converted.wit).toBeGreaterThanOrEqual(converted.heart);
    });

    it("gives an all-zero legacy card an even spread instead of a broken one", () => {
      const converted = convertLegacyCard(
        legacy({
          strength: 0,
          agility: 0,
          endurance: 0,
          intellect: 0,
          luck: 0,
        }),
      )!;
      expect(converted.power + converted.wit + converted.heart).toBe(
        RULES.statTotal,
      );
    });

    it("is idempotent, so a re-run produces identical rows", () => {
      const first = convertLegacyCard(legacy());
      const second = convertLegacyCard(legacy());
      expect(first).toEqual(second);
    });
  });

  describe("rarity spikes", () => {
    /* Without a spike curve the conversion is pointless: v1's stats are flat
       enough that proportional scaling gave every rarity the same ~6 top stat,
       so rarity carried no mechanical meaning at all. */
    const spikeOf = (rarity: CardDefinitionRecord["rarity"]) => {
      const converted = convertLegacyCard(legacy({ rarity }))!;
      return Math.max(converted.power, converted.wit, converted.heart);
    };

    it("sharpens the spike as rarity climbs", () => {
      expect(spikeOf("u")).toBeGreaterThan(spikeOf("c"));
      expect(spikeOf("fa")).toBeGreaterThan(spikeOf("u"));
    });

    it("leaves commons rounded", () => {
      expect(SPIKE_GAMMA.common).toBe(1);
      expect(spikeOf("c")).toBeLessThanOrEqual(RULES.spikeCeiling.common);
    });

    it("still respects every rarity ceiling", () => {
      expect(spikeOf("c")).toBeLessThanOrEqual(RULES.spikeCeiling.common);
      expect(spikeOf("u")).toBeLessThanOrEqual(RULES.spikeCeiling.uncommon);
      expect(spikeOf("fa")).toBeLessThanOrEqual(RULES.spikeCeiling.full_art);
    });

    it("gives a lopsided legacy card a real full-art spike", () => {
      const converted = convertLegacyCard(
        legacy({
          rarity: "fa",
          strength: 24,
          endurance: 20,
          agility: 4,
          intellect: 2,
          luck: 2,
        }),
      )!;
      expect(converted.power).toBeGreaterThanOrEqual(10);
      expect(converted.card_type).toBe("power");
    });
  });

  describe("channel correction", () => {
    /* Power is fed by two v1 stats, Wit by two, Heart by Luck alone. Left
       uncorrected that skewed the real pool to 62% Power, so most matchups were
       Power vs Power and the type wheel barely turned. */
    it("measures the mean of each channel across a pool", () => {
      const means = channelMeans([
        legacy({ strength: 10, endurance: 10, intellect: 4, agility: 4, luck: 2 }),
        legacy({ strength: 20, endurance: 20, intellect: 8, agility: 8, luck: 4 }),
      ]);

      expect(means.power).toBe(30); // (20 + 40) / 2
      expect(means.wit).toBe(12); //  (8 + 16) / 2
      expect(means.heart).toBe(6); //  (4 + 8) / 2
    });

    it("never divides by zero when a channel is empty", () => {
      const means = channelMeans([
        legacy({ strength: 0, endurance: 0, intellect: 0, agility: 0, luck: 0 }),
      ]);
      expect(means).toEqual({ power: 1, wit: 1, heart: 1 });
    });

    it("judges a card against its peers, not in absolute terms", () => {
      /* This card is Power-heavy in raw numbers but *below average* on Power for
         its pool, and well above average on Heart - so it should read as Heart. */
      const pool = [
        legacy({ id: "a", strength: 24, endurance: 24, intellect: 2, agility: 2, luck: 1 }),
        legacy({ id: "b", strength: 24, endurance: 24, intellect: 2, agility: 2, luck: 1 }),
        legacy({
          id: "c",
          rarity: "u",
          strength: 10,
          endurance: 10,
          intellect: 1,
          agility: 1,
          luck: 8,
        }),
      ];

      const { converted } = convertLegacyPool(pool);
      const subject = converted.find((row) => row.legacy_card === "c")!;
      expect(subject.card_type).toBe("heart");
    });

    it("spreads a real-shaped pool across all three types", () => {
      // Twelve cards leaning different ways should not all land on one type.
      const pool = Array.from({ length: 12 }, (_, index) =>
        legacy({
          id: `card${index}`,
          rarity: "u",
          strength: 4 + ((index * 5) % 20),
          endurance: 2 + ((index * 7) % 20),
          intellect: 3 + ((index * 11) % 20),
          agility: 5 + ((index * 13) % 20),
          luck: 1 + ((index * 3) % 20),
        }),
      );

      const { converted } = convertLegacyPool(pool);
      const types = new Set(converted.map((row) => row.card_type));
      expect(types.size).toBeGreaterThan(1);
    });
  });

  describe("schema completeness", () => {
    it("populates cost, tags, set_piece and keyword from day one", () => {
      const converted = convertLegacyCard(legacy())!;
      expect(converted.cost).toBeGreaterThan(0);
      expect(converted.tags.length).toBeGreaterThan(0);
      expect(converted.set_piece).toBe("");
      expect(converted.keyword).toBe("");
    });

    it("keeps a pointer back to the v1 row", () => {
      expect(convertLegacyCard(legacy())!.legacy_card).toBe("legacy001");
    });

    it("tags card type, colour, series and a legacy marker, in that order", () => {
      // The first two are what the card face prints, so they lead.
      expect(legacyTags(legacy())).toEqual([
        "fighter",
        "red",
        "dragon_ball",
        "legacy",
      ]);
    });
  });

  describe("keyword assignment", () => {
    it("stays empty unless explicitly requested", () => {
      expect(convertLegacyCard(legacy())!.keyword).toBe("");
    });

    it("assigns a legal keyword for the rarity when asked", () => {
      const uncommon = convertLegacyCard(legacy(), { assignKeywords: true })!;
      expect(findKeyword(uncommon.keyword)?.tier).toBe("uncommon");

      const common = convertLegacyCard(legacy({ rarity: "c" }), {
        assignKeywords: true,
      })!;
      expect(common.keyword).toBe("");
    });

    it("is stable across runs for the same card", () => {
      expect(assignKeyword("legacy001", "uncommon")).toBe(
        assignKeyword("legacy001", "uncommon"),
      );
    });

    it("spreads different cards across different keywords", () => {
      const assigned = new Set(
        Array.from({ length: 40 }, (_, index) =>
          assignKeyword(`card-${index}`, "uncommon"),
        ),
      );
      expect(assigned.size).toBeGreaterThan(3);
    });
  });

  describe("convertLegacyPool", () => {
    it("converts battlers and reports skips with a reason", () => {
      const result = convertLegacyPool([
        legacy({ id: "a", rarity: "c" }),
        legacy({ id: "b", rarity: "u" }),
        legacy({ id: "c", rarity: "i", card_name: "Fusion" }),
      ]);

      expect(result.converted).toHaveLength(2);
      expect(result.skipped).toHaveLength(1);
      expect(result.skipped[0].cardName).toBe("Fusion");
      expect(result.skipped[0].reason).toContain("not battlers");
    });

    it("handles an empty pool", () => {
      expect(convertLegacyPool([])).toEqual({ converted: [], skipped: [] });
    });
  });
});
