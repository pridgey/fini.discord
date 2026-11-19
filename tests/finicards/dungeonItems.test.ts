import { describe, expect, it } from "bun:test";
import {
  DUNGEON,
  createRun,
  generateDoors,
  itemChance,
  playFight,
  buyOffer,
  type DungeonState,
  type FightRoom,
  type RoomSource,
  type ShopRoom,
} from "../../modules/finicards/dungeon";
import {
  ITEMS,
  itemByKey,
  piecesOf,
  rollItem,
  standInFor,
  tierWeights,
} from "../../modules/finicards/items";
import { composeDungeonMessage } from "../../modules/finicards/ui";
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
const weakling = card("e", "power", [5, 5, 5]);
const POOL = [weakling, card("w", "wit", [5, 5, 5]), card("h", "heart", [5, 5, 5])];

/** Always rolls `value`: 0 makes every chance come up. */
const always = (value: number) => () => value;
const source = (random: () => number, blocked: string[] = []): RoomSource => ({
  pool: POOL,
  random,
  blockedPieces: new Set(blocked),
});

const bossRun = (depth: number, extra: Partial<DungeonState> = {}): DungeonState => ({
  ...createRun({ pool: POOL, random: always(0.5) })!,
  wards: 0,
  depth,
  room: { kind: "fight", tier: "boss", enemy: weakling, geld: 10 } as FightRoom,
  ...extra,
});

describe("how often items drop", () => {
  it("never before room 15, a sliver at it, everything by room 35", () => {
    expect(itemChance(14)).toBe(0);
    expect(itemChance(15)).toBeGreaterThan(0);
    expect(itemChance(15)).toBeLessThan(0.1);
    expect(itemChance(35)).toBe(1);
    expect(itemChance(60)).toBe(1);
  });

  it("only rolls tier 1 shallow, and the higher tiers deeper", () => {
    expect(tierWeights(15)).toEqual({ 1: 100, 2: 0, 3: 0 });
    expect(tierWeights(25)[3]).toBe(0);
    expect(tierWeights(25)[2]).toBeGreaterThan(0);
    expect(tierWeights(35)).toEqual({ 1: 40, 2: 40, 3: 20 });
  });
});

describe("rolling an item", () => {
  it("never rolls a piece someone holds or carries", () => {
    const blocked = new Set(piecesOf("dragon_balls").map((piece) => piece.key));
    let seed = 7;
    const random = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
    for (let i = 0; i < 500; i++) {
      expect(blocked.has(rollItem(40, blocked, random))).toBe(false);
    }
  });

  it("becomes a boon when every piece is spoken for", () => {
    const all = new Set(ITEMS.filter((item) => item.kind === "piece").map((item) => item.key));
    // 0 picks the first kind: a piece.
    expect(itemByKey(rollItem(40, all, always(0)))?.kind).not.toBe("piece");
  });

  it("gives a stand-in boon of the same tier for a piece taken meanwhile", () => {
    const standIn = itemByKey(standInFor("exodia_head", always(0)));
    expect(standIn?.kind).not.toBe("piece");
    expect(standIn?.tier).toBe(3);
  });
});

describe("items in a run", () => {
  it("lets a boss deep in the dungeon drop one, carried", () => {
    const { state, recap } = (() => {
      const outcome = playFight(bossRun(30), strong, source(always(0)));
      return { state: outcome.state, recap: outcome.state.recap };
    })();
    expect(state.items).toHaveLength(1);
    expect(recap?.lines.join("\n")).toContain("yours only if you walk out");
  });

  it("leaves a shallow boss's dice alone", () => {
    const state = playFight(bossRun(10), strong, source(always(0))).state;
    expect(state.items ?? []).toEqual([]);
  });

  it("puts an item on a deep shop's shelf, priced like a ware", () => {
    let shop: ShopRoom | undefined;
    // A run at room 32 whose dice always come up: the second door is a shop.
    // (Room 35, every fifth room, would be bosses.)
    const doors = generateDoors(
      { depth: 32, room: bossRun(32).room, buffs: [], sinceShop: 99 },
      source(always(0)),
    );
    shop = doors.find((door) => door.kind === "shop") as ShopRoom | undefined;
    const offer = shop?.offers.find((each) => each.effect.kind === "item");
    expect(offer).toBeDefined();
    expect(offer!.price).toBeGreaterThan(DUNGEON.items.price[1]);

    const run = { ...bossRun(35), room: shop!, geld: 10_000 };
    const index = shop!.offers.indexOf(offer!);
    const bought = buyOffer(run, index, source(always(0)));
    expect(bought.items).toHaveLength(1);
  });
});

describe("the run message", () => {
  const base = {
    runId: "run1",
    userId: "u1",
    playerName: "Fen",
    entryFee: DUNGEON.entryFee,
    hand: [{ card: strong, index: 0 }],
  };
  const textOf = (message: { components: { toJSON(): unknown }[] }) =>
    JSON.stringify(message.components.map((c) => c.toJSON()));

  it("says what's carried and offers to walk out with it", () => {
    const progress = { ...bossRun(30), items: ["dragon_ball_2"] };
    const text = textOf(
      composeDungeonMessage({ ...base, state: "active", progress }, { scene: null, hand: null }),
    );
    expect(text).toContain("Carrying **2-Star Dragon Ball**");
    expect(text).toContain("Walk out with");
    expect(text).toContain("an item");
  });

  it("names what went into the satchel, or what the fall cost", () => {
    const progress = bossRun(30);
    const out = textOf(
      composeDungeonMessage(
        {
          ...base,
          state: "retreated",
          progress,
          reward: { kind: "none", items: ["boon_lucky"] },
        },
        { scene: null, hand: null },
      ),
    );
    expect(out).toContain("Into your satchel: **Four-Leaf Clover**");
    const fell = textOf(
      composeDungeonMessage(
        {
          ...base,
          state: "failed",
          progress,
          reward: { kind: "none", lostItems: ["exodia_head"] },
        },
        { scene: null, hand: null },
      ),
    );
    expect(fell).toContain("Lost with the fall: **Exodia the Forbidden One**");
  });
});
