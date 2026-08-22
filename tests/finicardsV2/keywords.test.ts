import { describe, expect, it } from "bun:test";
import { resolveMatch } from "../../modules/finicardsV2/battleEngine";
import {
  KEYWORDS,
  KEYWORD_STAGE_ORDER,
  findKeyword,
  keywordsForRarity,
  normalizeKeywordSlug,
} from "../../modules/finicardsV2/keywords";
import type { BattleCard } from "../../modules/finicardsV2/types";
import type {
  CardRarity,
  CardType,
} from "../../types/PocketbaseTablesV2";

const card = (
  name: string,
  type: CardType,
  power: number,
  wit: number,
  heart: number,
  options?: { rarity?: CardRarity; keyword?: string },
): BattleCard => ({
  instanceId: `inst-${name}`,
  definitionId: `def-${name}`,
  name,
  series: "Test",
  rarity: options?.rarity ?? "uncommon",
  type,
  stats: { power, wit, heart },
  keyword: options?.keyword ?? "",
  foil: false,
  tags: [],
  cost: 3,
});

/** Keywords are off in Phase 1, so every keyword test opts in explicitly. */
const withKeywords = { keywordsEnabled: true };

describe("finicards v2 keywords", () => {
  describe("registry", () => {
    it("has a unique slug per keyword", () => {
      const slugs = KEYWORDS.map((keyword) => keyword.slug);
      expect(new Set(slugs).size).toBe(slugs.length);
    });

    it("declares only stages from the locked order", () => {
      for (const keyword of KEYWORDS) {
        expect(KEYWORD_STAGE_ORDER).toContain(keyword.stage);
      }
    });

    it("locks the stage order the doc asks to lock early", () => {
      expect(KEYWORD_STAGE_ORDER).toEqual([
        "placement",
        "conditional",
        "matchup",
        "defense",
        "outcome",
        "postRound",
        "tiebreak",
      ]);
    });

    it("gives commons no keywords and full-arts the whole library", () => {
      expect(keywordsForRarity("common")).toHaveLength(0);
      expect(keywordsForRarity("uncommon").every((k) => k.tier === "uncommon")).toBe(
        true,
      );
      expect(keywordsForRarity("full_art")).toHaveLength(KEYWORDS.length);
    });

    it("looks keywords up by name, slug or hyphenated form", () => {
      expect(findKeyword("Last Stand")?.slug).toBe("last_stand");
      expect(findKeyword("last-stand")?.slug).toBe("last_stand");
      expect(findKeyword("LAST_STAND")?.slug).toBe("last_stand");
      expect(normalizeKeywordSlug(" First  Strike ")).toBe("first_strike");
    });

    it("treats an unknown keyword as no keyword rather than crashing", () => {
      expect(findKeyword("nonsense")).toBeNull();

      const result = resolveMatch({
        challengerLineup: [
          card("Typo", "power", 7, 5, 3, { keyword: "vangaurd" }),
        ],
        defenderLineup: [card("Plain", "power", 7, 5, 3)],
        rules: withKeywords,
      });

      expect(result.rounds[0].challenger.attackStat).toBe(7);
      expect(result.winner).toBe("draw");
    });
  });

  describe("Phase 1 ships without keywords", () => {
    it("ignores keyword text entirely by default", () => {
      const result = resolveMatch({
        challengerLineup: [
          card("Vanguardian", "power", 7, 5, 3, { keyword: "vanguard" }),
        ],
        defenderLineup: [card("Plain", "power", 7, 5, 3)],
      });

      expect(result.rounds[0].challenger.attackStat).toBe(7);
      expect(result.rounds[0].challenger.bonuses).toHaveLength(0);
      expect(result.winner).toBe("draw");
    });
  });

  describe("placement keywords make slot choice matter", () => {
    it("pays Vanguard in slot 1 and nowhere else", () => {
      const vanguard = card("Vanguard", "power", 7, 5, 3, {
        keyword: "vanguard",
      });
      const filler = card("Filler", "power", 7, 5, 3);
      const enemy = () => card("Enemy", "power", 7, 5, 3);

      const inSlotOne = resolveMatch({
        challengerLineup: [vanguard, filler],
        defenderLineup: [enemy(), enemy()],
        rules: withKeywords,
      });
      const inSlotTwo = resolveMatch({
        challengerLineup: [filler, vanguard],
        defenderLineup: [enemy(), enemy()],
        rules: withKeywords,
      });

      expect(inSlotOne.rounds[0].challenger.attackStat).toBe(10);
      expect(inSlotOne.roundsWon.challenger).toBe(1);
      expect(inSlotTwo.rounds[1].challenger.attackStat).toBe(7);
      expect(inSlotTwo.roundsWon.challenger).toBe(0);
    });

    it("makes Last Stand dead outside the final slot", () => {
      const lastStand = card("Closer", "power", 7, 5, 3, {
        keyword: "last_stand",
      });
      const filler = card("Filler", "power", 7, 5, 3);
      const enemy = () => card("Enemy", "power", 7, 5, 3);

      const result = resolveMatch({
        challengerLineup: [lastStand, filler, lastStand],
        defenderLineup: [enemy(), enemy(), enemy()],
        rules: withKeywords,
      });

      expect(result.rounds[0].challenger.attackStat).toBe(7);
      expect(result.rounds[2].challenger.attackStat).toBe(10);
    });
  });

  describe("conditional keywords read match state", () => {
    it("grows Momentum with each round already won", () => {
      const winner = card("Winner", "power", 7, 5, 3);
      const momentum = card("Momentum", "power", 7, 5, 3, {
        keyword: "momentum",
      });
      const weak = () => card("Weak", "power", 5, 5, 5);

      const result = resolveMatch({
        challengerLineup: [winner, momentum, momentum],
        defenderLineup: [weak(), weak(), weak()],
        rules: withKeywords,
      });

      expect(result.rounds[0].challenger.attackStat).toBe(7);
      expect(result.rounds[1].challenger.attackStat).toBe(8);
      expect(result.rounds[2].challenger.attackStat).toBe(9);
    });

    it("only pays Avenge after a loss", () => {
      const avenger = card("Avenger", "power", 7, 5, 3, { keyword: "avenge" });
      const loser = card("Loser", "power", 3, 5, 5);
      const strong = () => card("Strong", "power", 9, 3, 3);

      const result = resolveMatch({
        challengerLineup: [loser, avenger],
        defenderLineup: [strong(), strong()],
        rules: withKeywords,
      });

      expect(result.rounds[0].winner).toBe("defender");
      expect(result.rounds[1].challenger.attackStat).toBe(10);
    });

    it("pays Underdog only against a higher rarity", () => {
      const underdog = (name: string) =>
        card(name, "power", 7, 5, 3, {
          rarity: "common",
          keyword: "underdog",
        });

      const versusFullArt = resolveMatch({
        challengerLineup: [underdog("A")],
        defenderLineup: [
          card("Rare", "power", 7, 5, 3, { rarity: "full_art" }),
        ],
        rules: withKeywords,
      });
      const versusPeer = resolveMatch({
        challengerLineup: [underdog("B")],
        defenderLineup: [card("Peer", "power", 7, 5, 3, { rarity: "common" })],
        rules: withKeywords,
      });

      expect(versusFullArt.rounds[0].challenger.attackStat).toBe(10);
      expect(versusPeer.rounds[0].challenger.attackStat).toBe(7);
    });

    it("hands Rally's bonus to the next card only after a win", () => {
      const rally = card("Rallier", "power", 7, 5, 3, { keyword: "rally" });
      const follower = card("Follower", "power", 7, 5, 3);
      const weak = () => card("Weak", "power", 5, 5, 5);
      const strong = () => card("Strong", "power", 9, 3, 3);

      const afterWin = resolveMatch({
        challengerLineup: [rally, follower],
        defenderLineup: [weak(), weak()],
        rules: withKeywords,
      });
      const afterLoss = resolveMatch({
        challengerLineup: [rally, follower],
        defenderLineup: [strong(), weak()],
        rules: withKeywords,
      });

      expect(afterWin.rounds[0].winner).toBe("challenger");
      expect(afterWin.rounds[1].challenger.attackStat).toBe(9);
      expect(afterLoss.rounds[0].winner).toBe("defender");
      expect(afterLoss.rounds[1].challenger.attackStat).toBe(7);
    });

    it("wastes Rally in the final slot, as designed", () => {
      const rally = card("Rallier", "power", 7, 5, 3, { keyword: "rally" });
      const result = resolveMatch({
        challengerLineup: [card("Filler", "power", 7, 5, 3), rally],
        defenderLineup: [
          card("Weak", "power", 5, 5, 5),
          card("Weak", "power", 5, 5, 5),
        ],
        rules: withKeywords,
      });

      expect(result.rounds).toHaveLength(2);
      expect(result.roundsWon.challenger).toBe(2);
    });
  });

  describe("matchup keywords", () => {
    it("guarantees Adapt the type advantage without changing its swing", () => {
      const adapter = card("Adapter", "power", 10, 3, 2, {
        rarity: "full_art",
        keyword: "adapt",
      });
      const counter = card("Counter", "heart", 3, 5, 7);

      const result = resolveMatch({
        challengerLineup: [adapter],
        defenderLineup: [counter],
        rules: withKeywords,
      });

      const attack = result.rounds[0].challenger;
      expect(attack.multiplier).toBe(1.5);
      expect(attack.attackStat).toBe(10);
      expect(attack.attackValue).toBe(15);
      // Display shows the type it counts as; the stat swung is still Power.
      expect(attack.printedType).toBe("power");
      expect(attack.attackType).toBe("wit");
    });

    it("lets Guard shut Adapt back down to neutral", () => {
      const adapter = card("Adapter", "power", 10, 3, 2, {
        rarity: "full_art",
        keyword: "adapt",
      });
      const guard = card("Guard", "heart", 3, 5, 7, { keyword: "guard" });

      const result = resolveMatch({
        challengerLineup: [adapter],
        defenderLineup: [guard],
        rules: withKeywords,
      });

      expect(result.rounds[0].challenger.multiplier).toBe(1);
      expect(result.rounds[0].challenger.attackType).toBe("power");
    });

    it("denies a normal type multiplier to a Guard card", () => {
      const attacker = card("Attacker", "heart", 3, 4, 8);
      const guard = card("Guard", "power", 8, 4, 3, { keyword: "guard" });

      const result = resolveMatch({
        challengerLineup: [attacker],
        defenderLineup: [guard],
        rules: withKeywords,
      });

      expect(result.rounds[0].challenger.multiplier).toBe(1);
    });
  });

  describe("defensive keywords", () => {
    it("raises every defensive stat with Bulwark", () => {
      const attacker = card("Attacker", "power", 9, 3, 3);
      const bulwark = card("Bulwark", "heart", 4, 4, 7, { keyword: "bulwark" });

      const plain = resolveMatch({
        challengerLineup: [attacker],
        defenderLineup: [card("Plain", "heart", 4, 4, 7)],
        rules: withKeywords,
      });
      const guarded = resolveMatch({
        challengerLineup: [attacker],
        defenderLineup: [bulwark],
        rules: withKeywords,
      });

      expect(guarded.rounds[0].challenger.defenseFaced).toBe(
        plain.rounds[0].challenger.defenseFaced + 2,
      );
    });

    it("ignores defence with Pierce", () => {
      const piercer = card("Piercer", "power", 9, 3, 3, { keyword: "pierce" });
      const wall = card("Wall", "power", 7, 5, 3);

      const result = resolveMatch({
        challengerLineup: [piercer],
        defenderLineup: [wall],
        rules: withKeywords,
      });

      expect(result.rounds[0].challenger.defenseFaced).toBe(7 - 3);
    });

    it("never lets Pierce turn defence negative", () => {
      const piercer = card("Piercer", "wit", 3, 9, 3, { keyword: "pierce" });
      const glass = card("Glass", "heart", 1, 1, 13, { rarity: "full_art" });

      const result = resolveMatch({
        challengerLineup: [piercer],
        defenderLineup: [glass],
        rules: withKeywords,
      });

      expect(result.rounds[0].challenger.defenseFaced).toBe(0);
    });
  });

  describe("outcome and tiebreak keywords", () => {
    it("turns a narrow loss into a draw with First Strike", () => {
      const firstStrike = card("Duellist", "power", 7, 5, 3, {
        keyword: "first_strike",
      });
      const slightlyBetter = card("Better", "power", 8, 4, 3, {
        rarity: "uncommon",
      });

      const result = resolveMatch({
        challengerLineup: [firstStrike],
        defenderLineup: [slightlyBetter],
        rules: withKeywords,
      });

      expect(result.rounds[0].winner).toBe("draw");
      expect(result.rounds[0].notes.join(" ")).toContain("First Strike");
    });

    it("leaves a wide loss alone", () => {
      const firstStrike = card("Duellist", "power", 3, 5, 7, {
        keyword: "first_strike",
      });
      const crusher = card("Crusher", "power", 12, 2, 1, {
        rarity: "full_art",
      });

      const result = resolveMatch({
        challengerLineup: [firstStrike],
        defenderLineup: [crusher],
        rules: withKeywords,
      });

      expect(result.rounds[0].winner).toBe("defender");
    });

    it("doubles Overwhelm damage above the threshold for the tiebreaker only", () => {
      const overwhelm = card("Overwhelmer", "heart", 1, 2, 12, {
        rarity: "full_art",
        keyword: "overwhelm",
      });
      const victim = card("Victim", "power", 6, 5, 4);

      const result = resolveMatch({
        challengerLineup: [overwhelm],
        defenderLineup: [victim],
        rules: withKeywords,
      });

      // 12 x 1.5 = 18, minus 4 Power defence = 14 damage.
      expect(result.rounds[0].challenger.damage).toBe(14);
      // Tiebreaker counts 14 + (14 - 10) = 18.
      expect(result.tiebreakDamage.challenger).toBe(18);
    });
  });
});
