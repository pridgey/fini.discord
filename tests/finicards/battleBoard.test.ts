import { afterEach, describe, expect, it } from "bun:test";
import { resolveMatch } from "../../modules/finicards/battleEngine";
import { keywordTag, renderBattleBoard } from "../../modules/finicards/cardArt";
import { RULES } from "../../modules/finicards/rules";
import type { BattleCard } from "../../modules/finicards/types";
import type { CardType } from "../../types/PocketbaseTablesV2";

const card = (
  name: string,
  type: CardType,
  stats = { power: 7, wit: 5, heart: 3 },
): BattleCard => ({
  instanceId: `inst-${name}`,
  definitionId: `def-${name}`,
  name,
  series: "Test",
  rarity: "common",
  type,
  stats,
  keyword: "",
  foil: false,
  tags: [],
  cost: 2,
});

const names = { challenger: "Fen", defender: "Rho" };

describe("finicards v2 battle board", () => {
  it("renders a PNG for a full match", async () => {
    const result = resolveMatch({
      challengerLineup: [
        card("A", "heart"),
        card("B", "wit"),
        card("C", "power"),
      ],
      defenderLineup: [
        card("D", "power"),
        card("E", "wit"),
        card("F", "heart"),
      ],
    });
    const buffer = await renderBattleBoard(result, names);
    expect(buffer).not.toBeNull();
    expect(buffer!.subarray(0, 4).toString("hex")).toBe("89504e47");
  });

  it("renders draws, negative damage and very long names", async () => {
    const result = resolveMatch({
      challengerLineup: [
        card("Bartholomew Wintersworth-Fenwick The Third", "wit", {
          power: 3,
          wit: 9,
          heart: 3,
        }),
      ],
      defenderLineup: [card("Mirror", "wit", { power: 5, wit: 5, heart: 5 })],
    });
    expect(
      await renderBattleBoard(result, {
        challenger: '<&"names">',
        defender: "x".repeat(80),
      }),
    ).not.toBeNull();

    const mirror = () => [card("Same", "power")];
    const drawn = resolveMatch({
      challengerLineup: mirror(),
      defenderLineup: mirror(),
    });
    expect(await renderBattleBoard(drawn, names)).not.toBeNull();
  });

  it("grows taller with more rounds", async () => {
    const lineup = (n: number) =>
      Array.from({ length: n }, (_, i) => card(`C${i}`, "power"));
    const one = await renderBattleBoard(
      resolveMatch({ challengerLineup: lineup(1), defenderLineup: lineup(1) }),
      names,
    );
    const three = await renderBattleBoard(
      resolveMatch({ challengerLineup: lineup(3), defenderLineup: lineup(3) }),
      names,
    );
    expect(three!.length).toBeGreaterThan(one!.length);
  });

  describe("keywords", () => {
    const shipped = RULES.keywordsEnabled;
    afterEach(() => {
      RULES.keywordsEnabled = shipped;
    });

    const keyworded = (name: string, type: CardType, keyword: string) => ({
      ...card(name, type),
      rarity: "uncommon" as const,
      keyword,
    });

    const play = () =>
      resolveMatch({
        challengerLineup: [
          keyworded("A", "power", "vanguard"),
          keyworded("B", "power", "vanguard"),
          keyworded("C", "heart", "adapt"),
        ],
        defenderLineup: [
          keyworded("D", "power", "guard"),
          card("E", "power"),
          card("F", "wit"),
        ],
        rules: { keywordsEnabled: true },
      });

    it("spells out a bonus that landed", () => {
      RULES.keywordsEnabled = true;
      expect(keywordTag(play().rounds[0], "challenger")).toEqual({
        label: "VANGUARD +3",
        short: "VANGUARD",
        fired: true,
      });
    });

    it("shows an idle keyword as idle", () => {
      RULES.keywordsEnabled = true;
      expect(keywordTag(play().rounds[1], "challenger")).toEqual({
        label: "VANGUARD",
        short: "VANGUARD",
        fired: false,
      });
    });

    it("counts a keyword that only left a round note as landing", () => {
      RULES.keywordsEnabled = true;
      const result = resolveMatch({
        challengerLineup: [
          keyworded("A", "wit", "rally"),
          keyworded("B", "power", "last_stand"),
        ],
        defenderLineup: [card("D", "heart"), card("E", "heart")],
        rules: { keywordsEnabled: true },
      });
      expect(keywordTag(result.rounds[0], "challenger")?.fired).toBe(true);
      expect(keywordTag(result.rounds[1], "challenger")).toMatchObject({
        label: "LAST STAND +3 \u00b7 RALLY +2",
        short: "LAST STAND \u00b7 RALLY",
      });
    });

    it("tags nothing on a card with no keyword, or while keywords are off", () => {
      const result = play();
      RULES.keywordsEnabled = true;
      expect(keywordTag(result.rounds[1], "defender")).toBeNull();
      RULES.keywordsEnabled = false;
      expect(keywordTag(result.rounds[1], "challenger")).toBeNull();
    });

    it("renders a round where Adapt gives both sides the multiplier", async () => {
      RULES.keywordsEnabled = true;
      const result = play();
      expect(result.rounds[2].challenger.multiplier).toBeGreaterThan(1);
      expect(result.rounds[2].defender.multiplier).toBeGreaterThan(1);
      expect(await renderBattleBoard(result, names)).not.toBeNull();
    });
  });
});

describe("the dungeon fight image", () => {
  const fight = () =>
    resolveMatch({
      challengerLineup: [card("Hero", "power", { power: 9, wit: 2, heart: 2 })],
      defenderLineup: [card("Ogre", "wit")],
    }).rounds[0];

  it("renders every result, art or not", async () => {
    const { renderDungeonClash } = await import(
      "../../modules/finicards/cardArt/dungeonClash"
    );
    for (const result of ["won", "stalemate", "warded", "fell"] as const) {
      const buffer = await renderDungeonClash({
        round: fight(),
        result,
        depth: 12,
        tier: "boss",
        playerName: '<&"Aya">',
        playerSide: "challenger",
        geld: 20,
      });
      expect(buffer!.subarray(0, 4).toString("hex")).toBe("89504e47");
    }
  });

  it("leaves the round label off a one-round fight", async () => {
    const { centreColumn } = await import("../../modules/finicards/cardArt");
    expect(centreColumn(fight(), 168)).toContain("ROUND 1");
    expect(centreColumn(fight(), 168, null)).not.toContain("ROUND");
  });
});

describe("!test", () => {
  it("is the bot admin's, with an optional kind", async () => {
    process.env.ADMIN_ID ??= "admin";
    const { isBattleSampleCommand } = await import(
      "../../modules/finicards/battleSamples"
    );
    const { ADMIN_ID } = await import("../../utilities/discord/isAdmin");
    for (const text of ["!test", "  !TEST pvp ", "!test dungeon"])
      expect(isBattleSampleCommand(text, ADMIN_ID)).toBe(!!ADMIN_ID);
    expect(isBattleSampleCommand("!test", "someone-else")).toBe(false);
    expect(isBattleSampleCommand("!test everything", ADMIN_ID)).toBe(false);
  });
});

describe("the working in a fight image", () => {
  it("writes the attack and the defence it hit as sums", async () => {
    const { attackSum, defenceSum } = await import(
      "../../modules/finicards/cardArt/battleBoard"
    );
    const combat = {
      baseAttackStat: 7,
      attackStat: 10,
      multiplier: 1.5,
      attackValue: 15,
      printedType: "power",
      defenseFaced: 6,
      defense: { stat: "power", base: 5, bonus: 2, pierce: 1 },
    } as never;
    expect(attackSum(combat)).toBe("(7+3)×1.5 = 15");
    expect(defenceSum(combat)).toBe("5+2−1 = 6");
    const plain = {
      baseAttackStat: 9,
      attackStat: 9,
      multiplier: 1,
      printedType: "wit",
      defenseFaced: 4,
      defense: { stat: "heart", base: 4, bonus: 0, pierce: 0 },
    } as never;
    expect(attackSum(plain)).toBe("9");
    // Feint moved it off the matching stat, so it's named.
    expect(defenceSum(plain)).toBe("4 HEART");
  });
});

describe("the run summary's MVP", () => {
  it("is the card with the most fights won, or nobody before a win", async () => {
    const { mvpOf, buildDungeonSummarySvg } = await import(
      "../../modules/finicards/cardArt/dungeonSummary"
    );
    const progress = (cardWins: Record<string, number>) =>
      ({
        depth: 3,
        fightsWon: 2,
        bossesWon: 0,
        geld: 10,
        path: [],
        stats: { geldEarned: 10, geldSpent: 0, eventsPassed: 0, cardWins },
      }) as never;
    expect(mvpOf(progress({}))).toBeNull();
    expect(mvpOf(progress({ Ganondorf: 2, Nami: 1 }))).toEqual({
      name: "Ganondorf",
      wins: 2,
    });
    // No art to hand: the panel still names the card.
    const svg = buildDungeonSummarySvg({
      progress: progress({ "Gan<ondorf": 2 }),
      fell: true,
      coin: 3,
    });
    expect(svg).toContain("Gan&lt;ondorf");
    expect(svg).toContain("2 FIGHTS WON");
  });
});
