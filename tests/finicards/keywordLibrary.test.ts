import { describe, expect, it } from "bun:test";
import { resolveMatch } from "../../modules/finicards/battleEngine";
import { KEYWORDS, findKeyword } from "../../modules/finicards/keywords";
import type { BattleCard } from "../../modules/finicards/types";
import type { CardType } from "../../types/PocketbaseTablesV2";

/**
 * One test per keyword added after the original twelve: that it fires when its
 * condition holds, and stays quiet when it does not.
 */

let serial = 0;

const card = (
  type: CardType,
  stats: [number, number, number],
  keyword = "",
  extra: Partial<BattleCard> = {},
): BattleCard => {
  serial += 1;
  return {
    instanceId: `inst-${serial}`,
    definitionId: `def-${serial}`,
    name: `Card ${serial}`,
    series: `Series ${serial}`,
    rarity: "common",
    type,
    stats: { power: stats[0], wit: stats[1], heart: stats[2] },
    keyword,
    foil: false,
    tags: [],
    cost: 2,
    ...extra,
  };
};

/** A plain Power card: mirrors another Power card, so no multiplier either way. */
const plain = (power = 5, keyword = "") =>
  card("power", [power, 5, 5], keyword);

const play = (challenger: BattleCard[], defender: BattleCard[]) =>
  resolveMatch({
    challengerLineup: challenger,
    defenderLineup: defender,
    rules: { keywordsEnabled: true },
  });

describe("finicards v2 keyword library", () => {
  it("gives every keyword a unique slug and a description", () => {
    expect(new Set(KEYWORDS.map((keyword) => keyword.slug)).size).toBe(
      KEYWORDS.length,
    );
    for (const keyword of KEYWORDS) {
      expect(keyword.description.length).toBeGreaterThan(10);
    }
  });

  describe("slot placement", () => {
    it("Anchor pays only in a middle slot", () => {
      const lineup = [
        plain(5, "anchor"),
        plain(5, "anchor"),
        plain(5, "anchor"),
      ];
      const result = play(lineup, [plain(), plain(), plain()]);
      expect(result.rounds.map((round) => round.challenger.attackStat)).toEqual(
        [5, 8, 5],
      );
    });

    it("Gambit is +5 in slot 1 and a penalty anywhere else", () => {
      const result = play(
        [plain(5, "gambit"), plain(5, "gambit")],
        [plain(), plain()],
      );
      expect(result.rounds[0].challenger.attackStat).toBe(10);
      expect(result.rounds[1].challenger.attackStat).toBe(3);
      expect(result.rounds[1].challenger.bonuses).toEqual(["Gambit −2"]);
    });

    it("Closer pays when the match is level, but never in slot 1", () => {
      const level = play(
        [plain(5, "closer"), plain(5, "closer")],
        [plain(), plain()],
      );
      expect(level.rounds[0].challenger.attackStat).toBe(5);
      expect(level.rounds[1].challenger.attackStat).toBe(8);

      const ahead = play([plain(9), plain(5, "closer")], [plain(), plain()]);
      expect(ahead.rounds[1].challenger.attackStat).toBe(5);
    });
  });

  describe("reading the opponent", () => {
    it("Rival pays against the same type only", () => {
      expect(
        play([plain(5, "rival")], [plain()]).rounds[0].challenger.attackStat,
      ).toBe(8);
      expect(
        play([plain(5, "rival")], [card("wit", [5, 5, 5])]).rounds[0].challenger
          .attackStat,
      ).toBe(5);
    });

    it("Giant Slayer pays against a bigger printed type stat", () => {
      expect(
        play([plain(5, "giant_slayer")], [plain(9)]).rounds[0].challenger
          .attackStat,
      ).toBe(8);
      expect(
        play([plain(5, "giant_slayer")], [plain(5)]).rounds[0].challenger
          .attackStat,
      ).toBe(5);
    });

    it("Intimidate takes 2 off the opposing card and says so on both", () => {
      const round = play([plain(5, "intimidate")], [plain(7)]).rounds[0];
      expect(round.defender.attackStat).toBe(5);
      expect(round.defender.bonuses).toEqual([]);
      expect(round.challenger.bonuses[0]).toMatch(/^Intimidate \(.+ −2\)$/);
    });

    it("Purist pays against a card with no keyword in play", () => {
      expect(
        play([plain(5, "purist")], [plain()]).rounds[0].challenger.attackStat,
      ).toBe(8);
      expect(
        play([plain(5, "purist")], [plain(5, "bulwark")]).rounds[0].challenger
          .attackStat,
      ).toBe(5);
    });

    it("Brace adds defence only when the opposing card holds the multiplier", () => {
      // Heart beats Power, so the Heart card attacks into a braced Power stat.
      const beaten = play(
        [card("power", [5, 5, 5], "brace")],
        [card("heart", [5, 5, 7])],
      ).rounds[0];
      expect(beaten.defender.multiplier).toBe(1.5);
      expect(beaten.defender.defenseFaced).toBe(8);

      const level = play([plain(5, "brace")], [plain()]).rounds[0];
      expect(level.defender.defenseFaced).toBe(5);
    });

    it("Mimic fights with the opposing card's keyword", () => {
      const round = play([plain(5, "mimic")], [plain(5, "vanguard")]).rounds[0];
      expect(round.challenger.attackStat).toBe(8);
      expect(round.challenger.activeKeyword).toBe("vanguard");
      expect(round.challenger.bonuses).toContain("Mimic (Vanguard)");
    });

    it("Mimic has nothing to copy from another Mimic, or from no keyword", () => {
      const mirror = play([plain(5, "mimic")], [plain(5, "mimic")]).rounds[0];
      expect(mirror.challenger.bonuses).toEqual([]);
      expect(
        play([plain(5, "mimic")], [plain()]).rounds[0].challenger.bonuses,
      ).toEqual([]);
    });

    it("Silence switches the opposing keyword off for the round", () => {
      const round = play([plain(5, "silence")], [plain(5, "vanguard")])
        .rounds[0];
      expect(round.defender.attackStat).toBe(5);
      expect(round.defender.activeKeyword).toBe("");
      expect(round.challenger.bonuses).toEqual(["Silence (no Vanguard)"]);
    });

    it("two Silences, or a Mimic copying one, cancel each other out", () => {
      for (const keyword of ["silence", "mimic"]) {
        const round = play([plain(5, keyword)], [plain(5, "silence")])
          .rounds[0];
        expect(round.challenger.activeKeyword).toBe("");
        expect(round.defender.activeKeyword).toBe("");
      }
    });
  });

  describe("lineup shape", () => {
    it("Kinship counts the other cards from the same series", () => {
      const series = { series: "Bleach" };
      const result = play(
        [
          card("power", [5, 5, 5], "kinship", series),
          card("power", [5, 5, 5], "", series),
          card("power", [5, 5, 5], "", { series: "bleach " }),
        ],
        [plain(), plain(), plain()],
      );
      expect(result.rounds[0].challenger.attackStat).toBe(9);
      expect(
        play([plain(5, "kinship")], [plain()]).rounds[0].challenger.bonuses,
      ).toEqual([]);
    });

    it("Trinity needs all three types in the lineup", () => {
      const rainbow = play(
        [plain(5, "trinity"), card("wit", [5, 5, 5]), card("heart", [5, 5, 5])],
        [plain(), plain(), plain()],
      );
      expect(rainbow.rounds[0].challenger.attackStat).toBe(8);

      const two = play(
        [plain(5, "trinity"), card("wit", [5, 5, 5]), plain()],
        [plain(), plain(), plain()],
      );
      expect(two.rounds[0].challenger.attackStat).toBe(5);
    });

    it("Chorus counts the other cards of its type", () => {
      const result = play(
        [plain(5, "chorus"), plain(), plain()],
        [plain(), plain(), plain()],
      );
      expect(result.rounds[0].challenger.attackStat).toBe(9);
    });

    it("Lone Wolf pays only when nothing else shares its type", () => {
      const alone = play(
        [plain(5, "lone_wolf"), card("wit", [5, 5, 5])],
        [plain(), plain()],
      );
      expect(alone.rounds[0].challenger.attackStat).toBe(8);

      const paired = play([plain(5, "lone_wolf"), plain()], [plain(), plain()]);
      expect(paired.rounds[0].challenger.attackStat).toBe(5);
    });

    it("Synergy counts shared tags, but not the one every card carries", () => {
      const result = play(
        [
          card("power", [5, 5, 5], "synergy", { tags: ["red", "legacy"] }),
          card("power", [5, 5, 5], "", { tags: ["red", "legacy"] }),
          card("power", [5, 5, 5], "", { tags: ["blue", "legacy"] }),
        ],
        [plain(), plain(), plain()],
      );
      expect(result.rounds[0].challenger.attackStat).toBe(6);
    });

    it("Thrifty pays for a cheap lineup", () => {
      const cheap = play(
        [
          plain(5, "thrifty"),
          plain(),
          card("power", [5, 5, 5], "", { cost: 3 }),
        ],
        [plain(), plain(), plain()],
      );
      expect(cheap.rounds[0].challenger.attackStat).toBe(8);

      const dear = play(
        [
          plain(5, "thrifty"),
          plain(),
          card("power", [5, 5, 5], "", { cost: 5 }),
        ],
        [plain(), plain(), plain()],
      );
      expect(dear.rounds[0].challenger.attackStat).toBe(5);
    });
  });

  describe("match history", () => {
    it("Grudge grows with every round lost", () => {
      const result = play(
        [plain(3), plain(3), plain(5, "grudge")],
        [plain(9), plain(9), plain()],
      );
      expect(result.rounds[2].challenger.attackStat).toBe(9);
    });

    it("Echo borrows the previous card's final stat when it was higher", () => {
      const result = play(
        [plain(9, "vanguard"), plain(5, "echo")],
        [plain(), plain()],
      );
      expect(result.rounds[1].challenger.attackStat).toBe(12);

      const weaker = play([plain(3), plain(5, "echo")], [plain(), plain()]);
      expect(weaker.rounds[1].challenger.bonuses).toEqual([]);
    });

    it("Second Wind pays after a drawn round", () => {
      const result = play(
        [plain(), plain(5, "second_wind")],
        [plain(), plain()],
      );
      expect(result.rounds[0].winner).toBe("draw");
      expect(result.rounds[1].challenger.attackStat).toBe(8);
    });

    it("Martyr hands +3 to the next card when it loses", () => {
      const result = play([plain(3, "martyr"), plain()], [plain(9), plain()]);
      expect(result.rounds[1].challenger.attackStat).toBe(8);
      expect(result.rounds[1].challenger.bonuses).toEqual(["Martyr +3"]);

      const won = play([plain(9, "martyr"), plain()], [plain(3), plain()]);
      expect(won.rounds[1].challenger.attackStat).toBe(5);
    });

    it("Parting Shot weakens the opponent's next card when it loses", () => {
      const result = play(
        [plain(3, "parting_shot"), plain()],
        [plain(9), plain()],
      );
      expect(result.rounds[1].defender.attackStat).toBe(3);
      expect(result.rounds[1].defender.bonuses).toEqual(["Parting Shot −2"]);
    });

    it("Spoiler switches off the opponent's next keyword when it loses", () => {
      const result = play(
        [plain(3, "spoiler"), plain()],
        [plain(9), plain(5, "last_stand")],
      );
      expect(result.rounds[1].defender.attackStat).toBe(5);
      expect(result.rounds[1].defender.activeKeyword).toBe("");
      expect(result.rounds[1].notes.join(" ")).toContain(
        "Last Stand is switched off",
      );
    });

    it("the on-loss handoffs do nothing from the last slot", () => {
      for (const keyword of ["martyr", "parting_shot", "spoiler"]) {
        const result = play([plain(3, keyword)], [plain(9)]);
        expect(result.rounds[0].notes).toEqual([]);
      }
    });
  });

  describe("stat bending", () => {
    it("Versatile pays a rounded card for its other two stats", () => {
      const rounded = play([card("power", [5, 5, 5], "versatile")], [plain()]);
      expect(rounded.rounds[0].challenger.attackStat).toBe(7);

      const lopsided = play([card("power", [7, 5, 3], "versatile")], [plain()]);
      expect(lopsided.rounds[0].challenger.attackStat).toBe(8);

      const spike = play([card("power", [12, 2, 1], "versatile")], [plain()]);
      expect(spike.rounds[0].challenger.bonuses).toEqual([]);
    });

    it("Glass Cannon hits harder and defends worse", () => {
      const round = play([plain(5, "glass_cannon")], [plain()]).rounds[0];
      expect(round.challenger.attackStat).toBe(9);
      expect(round.defender.defenseFaced).toBe(2);
    });

    it("Feint goes for the opposing card's lowest stat", () => {
      const round = play([plain(7, "feint")], [card("power", [9, 1, 5])])
        .rounds[0];
      expect(round.challenger.defenseFaced).toBe(1);
      expect(round.challenger.damage).toBe(6);
    });

    it("Fortress trades the type multiplier for defence", () => {
      // Heart beats Power, so this Fortress would otherwise attack at x1.5.
      const round = play([card("heart", [5, 5, 7], "fortress")], [plain(6)])
        .rounds[0];
      expect(round.challenger.multiplier).toBe(1);
      expect(round.defender.defenseFaced).toBe(8);
    });
  });

  describe("outcome and tiebreak", () => {
    it("Edge takes a drawn round, and two Edges still draw", () => {
      expect(play([plain(5, "edge")], [plain()]).rounds[0].winner).toBe(
        "challenger",
      );
      const both = play([plain(5, "edge")], [plain(5, "edge")]).rounds[0];
      expect(both.winner).toBe("draw");
      expect(both.notes).toEqual([]);
    });

    it("Edge does not turn a loss around", () => {
      expect(play([plain(5, "edge")], [plain(9)]).rounds[0].winner).toBe(
        "defender",
      );
    });

    it("Grit doubles what the card counts toward the tiebreaker", () => {
      const result = play([plain(9, "grit")], [plain()]);
      expect(result.rounds[0].challenger.damage).toBe(4);
      expect(result.tiebreakDamage.challenger).toBe(8);
    });

    it("Relentless counts at least 4 even from a losing attack", () => {
      const result = play([plain(3, "relentless")], [plain(9)]);
      expect(result.rounds[0].challenger.damage).toBeLessThan(0);
      expect(result.tiebreakDamage.challenger).toBe(4);
    });

    it("Mercy wipes the opposing damage after a win by 5 or more", () => {
      const routed = play(
        [card("heart", [3, 5, 9], "mercy")],
        [card("power", [8, 5, 3])],
      );
      // Heart x1.5: 13 - 3 = 10, against 8 - 3 = 5. A 5-point win.
      expect(routed.rounds[0].defender.damage).toBe(5);
      expect(routed.tiebreakDamage.defender).toBe(0);

      const close = play(
        [card("heart", [3, 5, 8], "mercy")],
        [card("power", [8, 5, 3])],
      );
      expect(close.tiebreakDamage.defender).toBe(5);
    });
  });

  it("covers every keyword in the library with a real definition", () => {
    for (const keyword of KEYWORDS) {
      expect(findKeyword(keyword.name)).toBe(keyword);
    }
  });
});
