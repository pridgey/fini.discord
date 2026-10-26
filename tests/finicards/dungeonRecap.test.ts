import { describe, expect, it } from "bun:test";
import {
  recordRound,
  resolveRound,
} from "../../modules/finicards/battleEngine";
import { DUNGEON, type DungeonState } from "../../modules/finicards/dungeon";
import { KEYWORDS, createSideState } from "../../modules/finicards/keywords";
import { RULES } from "../../modules/finicards/rules";
import type { BattleCard, RoundResult } from "../../modules/finicards/types";
import {
  enemyAbilityLines,
  explainsKeyword,
} from "../../modules/finicards/ui/enemyAbility";
import {
  damageTable,
  roundBlock,
} from "../../modules/finicards/ui/resultMessage";
import type { CardRarity, CardType } from "../../types/PocketbaseTablesV2";

const card = (
  name: string,
  type: CardType,
  stats: [number, number, number],
  keyword = "",
  extra: Partial<BattleCard> = {},
): BattleCard => ({
  instanceId: `inst-${name}`,
  definitionId: `def-${name}`,
  name,
  series: "Test",
  rarity: "common" as CardRarity,
  type,
  stats: { power: stats[0], wit: stats[1], heart: stats[2] },
  keyword,
  foil: false,
  tags: [],
  cost: 2,
  ...extra,
});

const clash = (player: BattleCard, enemy: BattleCard): RoundResult =>
  resolveRound({
    slot: 1,
    lineupLength: 3,
    challengerCard: player,
    defenderCard: enemy,
    challengerState: createSideState(),
    defenderState: createSideState(),
    rules: RULES,
    challengerLineup: [player],
    defenderLineup: [enemy],
    history: [],
  });

const names = { challenger: "Aya", defender: "The dungeon" };

// The fight that prompted this: Bulwark looked like part of Hinata's attack and
// Giant Slayer's +3 looked like it still had to be added to Robin's 9.
const hinata = card("Hinata Hyuga", "wit", [4, 7, 4], "bulwark", {
  cost: 3,
  rarity: "uncommon",
});
const robin = card("Sudden Nico Robin", "wit", [3, 6, 5], "giant_slayer");

describe("damage table", () => {
  it("puts each bonus in the cell it changed", () => {
    expect(damageTable(clash(hinata, robin))).toBe(
      [
        "```",
        "                  │ Attack  │ Defence │ Dmg",
        "──────────────────┼─────────┼─────────┼────",
        "Hinata Hyuga      │ 7       │ 6       │   1",
        "Sudden Nico Robin │ 6+3 = 9 │ 7+2 = 9 │   0",
        "```",
      ].join("\n"),
    );
  });

  it("shows the multiplier, Pierce, and the stat a Feint went for", () => {
    const piercer = card("Naruto", "power", [8, 3, 4], "pierce");
    const feinter = card("Zoro", "heart", [7, 2, 6], "feint");
    const [, , , naruto, zoro] = damageTable(clash(piercer, feinter)).split(
      "\n",
    );
    expect(naruto).toBe("Naruto │ 8         │ 7-3 = 4 │   4");
    expect(zoro).toBe("Zoro   │ 6x1.5 = 9 │ 3 Wit   │   6");
  });

  it("falls back to the total for rounds stored before the parts were", () => {
    const round = clash(hinata, robin);
    const { defense: _gone, ...old } = round.defender;
    const [, , , , stored] = damageTable({ ...round, defender: old }).split(
      "\n",
    );
    expect(stored).toBe("Sudden Nico Robin │ 6+3 = 9 │ 9       │   0");
  });

  it("names each card's bonuses under the table, once", () => {
    const block = roundBlock(clash(hinata, robin), names);
    expect(block).toContain(
      "Hinata Hyuga: Bulwark +2 def · Sudden Nico Robin: Giant Slayer +3",
    );
    expect(block).not.toContain("+Bulwark");
  });

  it("puts the type advantage and the abilities on lines of their own", () => {
    const naruto = card("Naruto", "power", [8, 3, 4], "pierce");
    const zoro = card("Zoro", "heart", [7, 2, 6], "intimidate");
    const notes = roundBlock(clash(naruto, zoro), names)
      .split("\n")
      .filter((line) => line.startsWith("-# "));
    expect(notes).toEqual([
      expect.stringMatching(/Heart beats .+×1\.5\*\* to Zoro$/),
      "-# Naruto: Pierce 3 · Zoro: Intimidate (Naruto −2)",
    ]);
  });

  it("leaves out the type line when no multiplier applied", () => {
    expect(roundBlock(clash(hinata, robin), names)).not.toContain("no bonus");
  });
});

/** A run partway through a leg: `played` are the fights already resolved in it. */
const runAt = (played: [BattleCard, BattleCard][]): DungeonState => {
  const states = { challenger: createSideState(), defender: createSideState() };
  const rounds: RoundResult[] = [];
  for (const [player, enemy] of played) {
    const round = resolveRound({
      slot: rounds.length + 1,
      lineupLength: DUNGEON.legLength,
      challengerCard: player,
      defenderCard: enemy,
      challengerState: states.challenger,
      defenderState: states.defender,
      rules: RULES,
      challengerLineup: [...rounds.map((r) => r.challenger.card), player],
      defenderLineup: [...rounds.map((r) => r.defender.card), enemy],
      history: rounds,
    });
    recordRound(round, states.challenger, states.defender);
    rounds.push(round);
  }
  return { leg: { rounds, states } } as unknown as DungeonState;
};

describe("enemy ability lines", () => {
  it("explains every keyword in the library", () => {
    const missing = KEYWORDS.filter(
      (keyword) => !explainsKeyword(keyword.slug, robin),
    );
    expect(missing.map((keyword) => keyword.slug)).toEqual([]);
  });

  it("says what a card-reading keyword needs from yours", () => {
    expect(enemyAbilityLines(runAt([]), robin)).toEqual([
      "-# **Giant Slayer** · Sudden Nico Robin — +3 if your card's type stat, buffs included, is higher than its Wit 6.",
    ]);
  });

  it("works out slot keywords from the leg", () => {
    const vanguard = card("Guard Dog", "power", [7, 4, 4], "vanguard");
    expect(enemyAbilityLines(runAt([]), vanguard)[0]).toContain(
      "**+3** this fight",
    );
    const twoIn = runAt([
      [card("A", "power", [9, 3, 3]), card("X", "wit", [3, 5, 3])],
      [card("B", "power", [9, 3, 3]), card("Y", "wit", [3, 5, 3])],
    ]);
    expect(enemyAbilityLines(twoIn, vanguard)[0]).toContain(
      "No bonus this fight",
    );
    expect(enemyAbilityLines(twoIn, vanguard)[0]).toContain("fight 3 of 3");
  });

  it("starts a fresh leg once the last one is full", () => {
    const full = runAt(
      ["A", "B", "C"].map((id) => [
        card(id, "power", [9, 3, 3]),
        card(`e${id}`, "wit", [3, 5, 3]),
      ]),
    );
    const vanguard = card("Guard Dog", "power", [7, 4, 4], "vanguard");
    expect(enemyAbilityLines(full, vanguard)[0]).toContain("**+3** this fight");
  });

  it("counts an enemy fought to a stalemate as part of its own lineup", () => {
    const vegeta = card("Hulking Vegeta", "power", [8, 4, 4], "synergy", {
      tags: ["dragon_ball"],
    });
    const level = card("Chise", "power", [8, 4, 4]);
    const afterDraw = runAt([[level, vegeta]]);
    expect(afterDraw.leg.rounds[0].winner).toBe("draw");
    const [line] = enemyAbilityLines(afterDraw, vegeta);
    expect(line).toContain("**+1** this fight");
    expect(line).toContain("Hulking Vegeta (itself, from the stalemate)");
  });

  it("says a tiebreak keyword does nothing here", () => {
    expect(
      enemyAbilityLines(
        runAt([]),
        card("Brute", "power", [9, 3, 3], "grit"),
      )[0],
    ).toContain("Does nothing in a dungeon");
  });

  it("shows what earlier fights handed on", () => {
    const martyr = card("Martyr", "wit", [3, 5, 3], "martyr");
    const lines = enemyAbilityLines(
      runAt([[card("A", "power", [9, 3, 3]), martyr]]),
      robin,
    );
    expect(lines).toContain(
      "-# ↳ Carried in from earlier this leg, for the enemy: Martyr +3.",
    );
  });

  it("is empty for an enemy with no ability and nothing carried in", () => {
    expect(
      enemyAbilityLines(runAt([]), card("Plain", "wit", [3, 6, 5])),
    ).toEqual([]);
  });
});
