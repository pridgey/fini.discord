import { describe, expect, it } from "bun:test";
import {
  lineupComposition,
  resolveMatch,
} from "../../modules/finicardsV2/battleEngine";
import type { BattleCard } from "../../modules/finicardsV2/types";
import type {
  CardRarity,
  CardType,
} from "../../types/PocketbaseTablesV2";

/** Test card builder. Stats are written power/wit/heart, as the doc writes them. */
const card = (
  name: string,
  type: CardType,
  power: number,
  wit: number,
  heart: number,
  options?: { rarity?: CardRarity; keyword?: string },
): BattleCard => ({
  instanceId: `inst-${name.toLowerCase().replace(/\s+/g, "-")}`,
  definitionId: `def-${name.toLowerCase().replace(/\s+/g, "-")}`,
  name,
  series: "Test",
  rarity: options?.rarity ?? "common",
  type,
  stats: { power, wit, heart },
  keyword: options?.keyword ?? "",
  foil: false,
  tags: [],
  cost: 2,
});

describe("finicards v2 battle engine", () => {
  describe("the design doc's worked example", () => {
    /* §3 "Worked example": Fen beats Rho 2-1. Every number below is copied
       straight out of the doc, so a drift in the maths fails here first. */
    const knight = card("Oathbound Knight", "heart", 4, 4, 7);
    const trickster = card("Wandering Trickster", "wit", 3, 9, 3, {
      rarity: "uncommon",
    });
    const brawler = card("Ironclad Brawler", "power", 6, 5, 4);

    const stormCaller = card("Storm Caller", "power", 9, 3, 3, {
      rarity: "uncommon",
    });
    const scholar = card("Quiet Scholar", "wit", 5, 5, 5);
    const blazingHeir = card("Blazing Heir", "heart", 1, 2, 12, {
      rarity: "full_art",
    });

    const result = resolveMatch({
      challengerLineup: [knight, trickster, brawler],
      defenderLineup: [stormCaller, scholar, blazingHeir],
    });

    it("resolves round 1 as Heart 7x1.5-3=7 against Power 9-4=5", () => {
      const round = result.rounds[0];
      expect(round.challenger.multiplier).toBe(1.5);
      expect(round.challenger.attackValue).toBe(10);
      expect(round.challenger.damage).toBe(7);
      expect(round.defender.multiplier).toBe(1);
      expect(round.defender.damage).toBe(5);
      expect(round.winner).toBe("challenger");
    });

    it("resolves the Wit mirror as 9-5=4 against 5-9=-4", () => {
      const round = result.rounds[1];
      expect(round.challenger.multiplier).toBe(1);
      expect(round.challenger.damage).toBe(4);
      expect(round.defender.damage).toBe(-4);
      expect(round.winner).toBe("challenger");
    });

    it("lets the full-art win round 3 by the widest margin on the board", () => {
      const round = result.rounds[2];
      expect(round.challenger.damage).toBe(5);
      expect(round.defender.damage).toBe(14);
      expect(round.winner).toBe("defender");
    });

    it("gives the match to Fen 2-1 on rounds won", () => {
      expect(result.roundsWon).toEqual({ challenger: 2, defender: 1 });
      expect(result.winner).toBe("challenger");
      expect(result.decidedBy).toBe("rounds");
    });

    it("lets negative damage stand rather than flooring it", () => {
      expect(result.rounds[1].defender.damage).toBeLessThan(0);
    });

    it("floors negative damage only for the tiebreaker", () => {
      // Rho: 5 + 0 + 14 = 19. Fen: 7 + 4 + 5 = 16.
      expect(result.tiebreakDamage.defender).toBe(19);
      expect(result.tiebreakDamage.challenger).toBe(16);
    });
  });

  describe("the doc's counterplay line", () => {
    /* Same cards, Trickster moved to slot 3 to answer the Blazing Heir:
       9x1.5-2 = 11 against the Heir's 12-3 = 9. */
    it("beats the best card in the game with a specific answer", () => {
      const trickster = card("Wandering Trickster", "wit", 3, 9, 3, {
        rarity: "uncommon",
      });
      const blazingHeir = card("Blazing Heir", "heart", 1, 2, 12, {
        rarity: "full_art",
      });

      const result = resolveMatch({
        challengerLineup: [trickster],
        defenderLineup: [blazingHeir],
      });

      expect(result.rounds[0].challenger.attackValue).toBe(13);
      expect(result.rounds[0].challenger.damage).toBe(11);
      expect(result.rounds[0].defender.damage).toBe(9);
      expect(result.winner).toBe("challenger");
    });
  });

  describe("emergent properties the doc relies on", () => {
    it("loses a mono-type lineup 3-0 to its counter type, with no rule for it", () => {
      const powerLineup = [
        card("P1", "power", 7, 5, 3),
        card("P2", "power", 7, 4, 4),
        card("P3", "power", 6, 5, 4),
      ];
      const heartLineup = [
        card("H1", "heart", 3, 5, 7),
        card("H2", "heart", 4, 4, 7),
        card("H3", "heart", 4, 5, 6),
      ];

      const result = resolveMatch({
        challengerLineup: powerLineup,
        defenderLineup: heartLineup,
      });

      expect(result.roundsWon).toEqual({ challenger: 0, defender: 3 });
    });

    it("lets a specialist beat a generalist in a mirror matchup", () => {
      const specialist = card("Specialist", "wit", 3, 9, 3, {
        rarity: "uncommon",
      });
      const generalist = card("Generalist", "wit", 5, 5, 5);

      const result = resolveMatch({
        challengerLineup: [specialist],
        defenderLineup: [generalist],
      });

      expect(result.winner).toBe("challenger");
    });

    it("rewards the winner of a type matchup rather than punishing the loser", () => {
      // The countered card's own damage is unmodified - there is only one dial.
      const attacker = card("Attacker", "power", 7, 5, 3);
      const counter = card("Counter", "heart", 3, 5, 7);

      const result = resolveMatch({
        challengerLineup: [attacker],
        defenderLineup: [counter],
      });

      expect(result.rounds[0].challenger.multiplier).toBe(1);
      expect(result.rounds[0].challenger.damage).toBe(7 - 3);
      expect(result.rounds[0].defender.multiplier).toBe(1.5);
    });
  });

  describe("match tiebreaker", () => {
    it("falls through to total damage when rounds are level", () => {
      const result = resolveMatch({
        challengerLineup: [
          card("A", "power", 7, 5, 3),
          card("B", "wit", 3, 7, 5),
        ],
        defenderLineup: [
          card("C", "wit", 5, 7, 3),
          card("D", "power", 7, 5, 3),
        ],
      });

      expect(result.roundsWon.challenger).toBe(result.roundsWon.defender);
      expect(result.decidedBy).toBe("damage");
    });

    it("returns a draw when rounds and damage are both level", () => {
      const mirror = () => [card("Mirror", "power", 7, 5, 3)];
      const result = resolveMatch({
        challengerLineup: mirror(),
        defenderLineup: mirror(),
      });

      expect(result.winner).toBe("draw");
      expect(result.decidedBy).toBe("rule");
    });

    it("honours the drawResolution dial when set to defender", () => {
      const mirror = () => [card("Mirror", "power", 7, 5, 3)];
      const result = resolveMatch({
        challengerLineup: mirror(),
        defenderLineup: mirror(),
        rules: { drawResolution: "defender" },
      });

      expect(result.winner).toBe("defender");
    });

    it("counts a round draw for neither side", () => {
      const mirror = () => [card("Mirror", "power", 7, 5, 3)];
      const result = resolveMatch({
        challengerLineup: mirror(),
        defenderLineup: mirror(),
      });

      expect(result.rounds[0].winner).toBe("draw");
      expect(result.roundsWon).toEqual({ challenger: 0, defender: 0 });
    });
  });

  describe("tuning dials", () => {
    it("makes stats dominant as the type multiplier falls", () => {
      // 6 Power into a 3 Heart defence vs 7 Heart into a 4 Power defence.
      const attacker = card("Brawler", "power", 6, 5, 4);
      const counter = card("Knight", "heart", 4, 4, 7);

      const dominant = resolveMatch({
        challengerLineup: [attacker],
        defenderLineup: [counter],
        rules: { typeMultiplier: 2.0 },
      });
      const flat = resolveMatch({
        challengerLineup: [attacker],
        defenderLineup: [counter],
        rules: { typeMultiplier: 1.0 },
      });

      expect(dominant.winner).toBe("defender");
      expect(flat.rounds[0].defender.multiplier).toBe(1);
      expect(flat.rounds[0].defender.damage).toBeLessThan(
        dominant.rounds[0].defender.damage,
      );
    });

    it("supports a 5-round match without touching the engine", () => {
      const lineup = (type: CardType) =>
        Array.from({ length: 5 }, (_, index) =>
          card(`${type}-${index}`, type, ...(type === "power" ? [7, 5, 3] : type === "wit" ? [3, 7, 5] : [5, 3, 7]) as [number, number, number]),
        );

      const result = resolveMatch({
        challengerLineup: lineup("power"),
        defenderLineup: lineup("wit"),
      });

      expect(result.rounds).toHaveLength(5);
      expect(result.roundsWon.challenger).toBe(5);
    });
  });

  describe("input validation", () => {
    it("refuses mismatched lineup lengths", () => {
      expect(() =>
        resolveMatch({
          challengerLineup: [card("A", "power", 7, 5, 3)],
          defenderLineup: [
            card("B", "wit", 3, 7, 5),
            card("C", "wit", 3, 7, 5),
          ],
        }),
      ).toThrow(/same length/);
    });

    it("refuses empty lineups", () => {
      expect(() =>
        resolveMatch({ challengerLineup: [], defenderLineup: [] }),
      ).toThrow(/empty/);
    });
  });

  describe("lineupComposition", () => {
    it("counts types without implying order", () => {
      expect(
        lineupComposition([
          card("A", "power", 7, 5, 3),
          card("B", "power", 7, 4, 4),
          card("C", "heart", 3, 5, 7),
        ]),
      ).toEqual({ power: 2, wit: 0, heart: 1 });
    });
  });
});
