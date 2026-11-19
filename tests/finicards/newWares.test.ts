import { describe, expect, it } from "bun:test";
import {
  applyEffect,
  buffedCard,
  createRun,
  generateShop,
  modsOf,
  playFight,
  wareNamed,
  type DungeonState,
  type FightRoom,
} from "../../modules/finicards/dungeon";
import { withDungeonBoon } from "../../modules/finicards/boons";
import { ITEMS } from "../../modules/finicards/items";
import type { BattleCard } from "../../modules/finicards/types";
import type { CardType } from "../../types/PocketbaseTablesV2";

const card = (id: string, type: CardType, stats: [number, number, number]): BattleCard => ({
  instanceId: id,
  definitionId: `def-${id}`,
  name: `Card ${id}`,
  series: "Test",
  rarity: "common",
  type,
  stats: { power: stats[0], wit: stats[1], heart: stats[2] },
  keyword: "",
  foil: false,
  tags: [],
  cost: 2,
});
const strong = card("a", "power", [12, 2, 1]);
const weak = card("w", "power", [1, 1, 1]);
const enemy = card("e", "power", [6, 6, 6]);
const POOL = [enemy];
const source = { pool: POOL, random: () => 0.5 };

const run = (tier: FightRoom["tier"] = "normal", extra: Partial<DungeonState> = {}) => ({
  ...createRun(source)!,
  wards: 0,
  room: { kind: "fight", tier, enemy, geld: 10 } as FightRoom,
  ...extra,
});

describe("the new shop wares", () => {
  it("are all on the shelves, and every starter boon finds its ware", () => {
    for (const name of [
      "Rally Banner",
      "Glass Cannon",
      "Bounty Poster",
      "Second Wind",
      "Echo Stone",
      "Double or Nothing",
    ])
      expect(wareNamed(name)).toBeDefined();
    for (const item of ITEMS.filter((each) => each.ware))
      expect(wareNamed(item.ware!)).toBeDefined();
  });

  it("turn a lost fight into a stalemate with a second wind, before a ward", () => {
    const outcome = playFight(run("normal", { secondWinds: 1, wards: 1 }), weak, source);
    expect(outcome.result).toBe("stalemate");
    expect(outcome.state.secondWinds).toBe(0);
    expect(outcome.state.wards).toBe(1);
    expect(outcome.state.recap?.result).toBe("stalemate");
    expect(outcome.state.room.kind).toBe("fight");
  });

  it("double an elite's geld with a bounty, and leave a plain fight's alone", () => {
    const plain = playFight(run("normal", { bounties: 1 }), strong, source).state;
    expect(plain.geld).toBe(10);
    expect(plain.bounties).toBe(1);
    const elite = playFight(run("elite", { bounties: 1 }), strong, source).state;
    expect(elite.geld).toBe(20);
    expect(elite.bounties).toBe(0);
  });

  it("keep the next card ready with an echo", () => {
    const echoed = playFight(run("normal", { echoes: 1 }), strong, source).state;
    expect(echoed.readyAt[strong.instanceId]).toBeUndefined();
    expect(echoed.echoes).toBe(0);
    expect(echoed.recap?.lines.join("\n")).toContain("Echo Stone");
    const rested = playFight(run(), strong, source).state;
    expect(rested.readyAt[strong.instanceId]).toBeDefined();
  });

  it("flip for twice the price, as priced at its depth", () => {
    const heads = run();
    applyEffect(heads, { kind: "gamble", win: 24 }, { pool: [], random: () => 0.1 });
    expect(heads.geld).toBe(24);
    const tails = run();
    applyEffect(tails, { kind: "gamble", win: 24 }, { pool: [], random: () => 0.9 });
    expect(tails.geld).toBe(0);
    // Every coin flip on a shelf pays twice its own price.
    for (let depth = 1; depth < 40; depth += 7) {
      for (let seed = 0; seed < 20; seed++) {
        let n = seed;
        const shop = generateShop([], () => ((n = (n * 16807 + 7) % 2147483647) / 2147483647), undefined, depth);
        for (const offer of shop.offers)
          if (offer.effect.kind === "gamble")
            expect(offer.effect.win).toBe(offer.price * 2);
      }
    }
  });

  it("let a glass cannon take stats down, never below nothing", () => {
    const glass = wareNamed("Glass Cannon")!;
    const state = run();
    applyEffect(state, glass.effect);
    const cannon = buffedCard(card("g", "power", [5, 1, 3]), modsOf(state));
    expect(cannon.stats).toEqual({ power: 9, wit: 0, heart: 1 });
  });
});

describe("starter boons", () => {
  it("start a run with their ware in play, and say so", () => {
    const pockets = withDungeonBoon(run(), "boon_start_pockets");
    expect(modsOf(pockets).geld).toBe(25);
    expect(pockets.recap?.lines[0]).toContain("you start with **Deep Pockets**");
    expect(withDungeonBoon(run(), "boon_start_wind").secondWinds).toBe(1);
    expect(withDungeonBoon(run(), "boon_start_echo").echoes).toBe(1);
    expect(modsOf(withDungeonBoon(run(), "boon_start_hands")).cooldown).toBe(-1);
  });
});
