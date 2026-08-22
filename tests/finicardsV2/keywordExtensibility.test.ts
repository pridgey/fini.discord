import { afterEach, describe, expect, it } from "bun:test";
import { resolveMatch } from "../../modules/finicardsV2/battleEngine";
import {
  KEYWORDS,
  findKeyword,
  registerKeyword,
  unregisterKeyword,
} from "../../modules/finicardsV2/keywords";
import type { BattleCard } from "../../modules/finicardsV2/types";
import type { CardRarity, CardType } from "../../types/PocketbaseTablesV2";

/**
 * These tests exist to answer one question: can a new keyword be added without
 * touching the engine?
 *
 * Every keyword below is registered at runtime from *outside* the module, uses
 * only what `KeywordContext` already exposes, and is unregistered afterwards.
 * If any of them needed an engine change to work, these tests would not compile.
 */

const card = (
  name: string,
  type: CardType,
  power: number,
  wit: number,
  heart: number,
  options?: { rarity?: CardRarity; keyword?: string; tags?: string[] },
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
  tags: options?.tags ?? [],
  cost: 3,
});

const withKeywords = { keywordsEnabled: true };
const registered: string[] = [];

const register = (definition: Parameters<typeof registerKeyword>[0]) => {
  registerKeyword(definition);
  registered.push(definition.slug);
};

afterEach(() => {
  while (registered.length > 0) unregisterKeyword(registered.pop()!);
});

describe("adding a keyword without touching the engine", () => {
  it("supports a tag-reading keyword (synergy with your own lineup)", () => {
    register({
      name: "Kindred",
      slug: "kindred",
      tier: "uncommon",
      description: "+3 if another card in your lineup shares a tag",
      stage: "conditional",
      order: 1,
      apply: (ctx) => {
        const mine = new Set(ctx.self.card.tags);
        const shared = ctx.selfLineup.some(
          (other) =>
            other.instanceId !== ctx.self.card.instanceId &&
            other.tags.some((tag) => mine.has(tag)),
        );
        if (!shared) return;
        ctx.self.attackStat += 3;
        ctx.self.bonuses.push("Kindred +3");
      },
    });

    const kindred = (tags: string[]) =>
      card("Kindred", "power", 7, 5, 3, { keyword: "kindred", tags });
    const ally = (tags: string[]) => card("Ally", "power", 7, 5, 3, { tags });
    const enemy = () => card("Enemy", "power", 7, 5, 3);

    const withSynergy = resolveMatch({
      challengerLineup: [kindred(["shonen"]), ally(["shonen"])],
      defenderLineup: [enemy(), enemy()],
      rules: withKeywords,
    });
    const withoutSynergy = resolveMatch({
      challengerLineup: [kindred(["shonen"]), ally(["mecha"])],
      defenderLineup: [enemy(), enemy()],
      rules: withKeywords,
    });

    expect(withSynergy.rounds[0].challenger.attackStat).toBe(10);
    expect(withoutSynergy.rounds[0].challenger.attackStat).toBe(7);
  });

  it("supports a keyword that reads the opposing card's stats", () => {
    register({
      name: "Nemesis",
      slug: "nemesis",
      tier: "uncommon",
      description: "+4 if the opposing card's type stat beats yours",
      stage: "conditional",
      order: 1,
      apply: (ctx) => {
        const theirs = ctx.opponent.card.stats[ctx.opponent.card.type];
        const mine = ctx.self.card.stats[ctx.self.card.type];
        if (theirs <= mine) return;
        ctx.self.attackStat += 4;
        ctx.self.bonuses.push("Nemesis +4");
      },
    });

    const nemesis = card("Nemesis", "power", 7, 5, 3, { keyword: "nemesis" });

    const versusBigger = resolveMatch({
      challengerLineup: [nemesis],
      defenderLineup: [card("Big", "power", 9, 3, 3)],
      rules: withKeywords,
    });
    const versusSmaller = resolveMatch({
      challengerLineup: [nemesis],
      defenderLineup: [card("Small", "power", 6, 5, 4)],
      rules: withKeywords,
    });

    expect(versusBigger.rounds[0].challenger.attackStat).toBe(11);
    expect(versusSmaller.rounds[0].challenger.attackStat).toBe(7);
  });

  it("supports a keyword that reads earlier rounds of this match", () => {
    register({
      name: "Comeback",
      slug: "comeback",
      tier: "full_art",
      description: "+5 if you have lost every round so far",
      stage: "conditional",
      order: 1,
      apply: (ctx) => {
        if (ctx.history.length === 0) return;
        const lostEverything = ctx.history.every(
          (round) => round.winner !== ctx.self.side,
        );
        if (!lostEverything) return;
        ctx.self.attackStat += 5;
        ctx.self.bonuses.push("Comeback +5");
      },
    });

    const comeback = card("Comeback", "power", 7, 5, 3, {
      keyword: "comeback",
    });
    const weak = () => card("Weak", "power", 3, 6, 6);
    const strong = () => card("Strong", "power", 9, 3, 3);

    const afterLosing = resolveMatch({
      challengerLineup: [weak(), comeback],
      defenderLineup: [strong(), strong()],
      rules: withKeywords,
    });
    const afterWinning = resolveMatch({
      challengerLineup: [strong(), comeback],
      defenderLineup: [weak(), strong()],
      rules: withKeywords,
    });

    expect(afterLosing.rounds[0].winner).toBe("defender");
    expect(afterLosing.rounds[1].challenger.attackStat).toBe(12);
    expect(afterWinning.rounds[0].winner).toBe("challenger");
    expect(afterWinning.rounds[1].challenger.attackStat).toBe(7);
  });

  it("supports a keyword at a stage no shipped keyword uses", () => {
    register({
      name: "Bleed",
      slug: "bleed",
      tier: "full_art",
      description: "Winning a round hands the next opponent card -2 defence",
      stage: "postRound",
      order: 2,
      apply: (ctx) => {
        ctx.notes.push("Bleed: opponent's next card is weakened");
      },
    });

    const bleeder = card("Bleeder", "power", 9, 3, 3, { keyword: "bleed" });
    const result = resolveMatch({
      challengerLineup: [bleeder, card("Filler", "power", 7, 5, 3)],
      defenderLineup: [
        card("Weak", "power", 5, 5, 5),
        card("Weak", "power", 5, 5, 5),
      ],
      rules: withKeywords,
    });

    expect(result.rounds[0].notes.join(" ")).toContain("Bleed");
  });
});

describe("keyword registration guardrails", () => {
  const stub = {
    name: "Stub",
    slug: "stub_keyword",
    tier: "uncommon" as CardRarity,
    description: "test",
    stage: "conditional" as const,
    order: 1,
    apply: () => {},
  };

  it("registers into the shared library and is findable by name or slug", () => {
    const before = KEYWORDS.length;
    register(stub);
    expect(KEYWORDS.length).toBe(before + 1);
    expect(findKeyword("stub_keyword")?.name).toBe("Stub");
    expect(findKeyword("Stub Keyword")?.name).toBe("Stub");
  });

  it("refuses a duplicate slug instead of shadowing the original", () => {
    expect(() =>
      registerKeyword({ ...stub, slug: "vanguard" }),
    ).toThrow(/already registered/);
  });

  it("refuses an unknown stage, which would silently never fire", () => {
    expect(() =>
      registerKeyword({ ...stub, slug: "bad_stage", stage: "whenever" as any }),
    ).toThrow(/unknown stage/);
  });

  it("refuses a keyword with no effect hook", () => {
    expect(() =>
      registerKeyword({ ...stub, slug: "no_hook", apply: undefined }),
    ).toThrow(/no effect hook/);
  });

  it("normalises the slug on the way in", () => {
    register({ ...stub, slug: "Mixed Case" });
    expect(findKeyword("mixed_case")).not.toBeNull();
  });

  it("leaves the library clean after unregistering", () => {
    const before = KEYWORDS.length;
    registerKeyword({ ...stub, slug: "temporary" });
    unregisterKeyword("temporary");
    expect(KEYWORDS.length).toBe(before);
    expect(findKeyword("temporary")).toBeNull();
  });
});
