import { describe, expect, it } from "bun:test";
import {
  buildDungeonSceneSvg,
  buildDungeonSummarySvg,
  renderDungeonScene,
  renderDungeonSummary,
} from "../../modules/finicards/cardArt";
import {
  DUNGEON,
  bossFullArtChance,
  buyOffer,
  chooseDoor,
  coinFor,
  cooldownLeft,
  createRun,
  doorHint,
  enemyPoints,
  eventChance,
  fightGeld,
  generateDoors,
  generateEvent,
  generateFight,
  generateShop,
  leaveShop,
  modsOf,
  nextSlot,
  payoutFor,
  playEvent,
  playFight,
  doorSight,
  drinkCoffee,
  previewCards,
  redealHand,
  shopPrice,
  skipEvent,
  type Buff,
  type DungeonState,
  type EventRoom,
  type FightRoom,
  type Room,
  type RoomSource,
  type ShopRoom,
} from "../../modules/finicards/dungeon";
import {
  buildDungeonMessage,
  composeDungeonMessage,
} from "../../modules/finicards/ui";
import { buffLines } from "../../modules/finicards/ui/dungeonMessage";
import type { BattleCard } from "../../modules/finicards/types";
import type {
  CardRarity,
  CardType,
  V2CardDefinitionRecord,
} from "../../types/PocketbaseTablesV2";

const card = (
  id: string,
  type: CardType,
  stats: [number, number, number],
  keyword = "",
  rarity: CardRarity = "common",
): BattleCard => ({
  instanceId: id,
  definitionId: `def-${id}`,
  name: `Card ${id}`,
  series: "Test",
  rarity,
  type,
  stats: { power: stats[0], wit: stats[1], heart: stats[2] },
  keyword,
  foil: false,
  tags: [],
  cost: 2,
});

/** A room any `strong` card walks through, and a wall nothing here beats. */
const weak = (id: string) => card(id, "power", [5, 5, 5]);
const strong = (id: string, keyword = "") =>
  card(id, "power", [7, 5, 3], keyword);
const wall = (id: string) => card(id, "power", [12, 12, 12]);

const seeded = (seed: number) => () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 4294967296;
};

const POOL: BattleCard[] = (["power", "wit", "heart"] as CardType[]).flatMap(
  (type) =>
    (["common", "uncommon", "full_art"] as CardRarity[]).map((rarity) =>
      card(`${type}-${rarity}`, type, [5, 5, 5], "", rarity),
    ),
);

const source = (seed = 1): RoomSource => ({ pool: POOL, random: seeded(seed) });

const fightRoom = (
  enemy: BattleCard,
  tier: FightRoom["tier"] = "normal",
): FightRoom => ({ kind: "fight", tier, enemy, geld: 10 });

const eventRoom = (target: number): EventRoom => ({
  kind: "event",
  title: "A Test",
  text: "Something is in the way.",
  stat: "power",
  target,
  reward: { kind: "geld", amount: 9 },
  passText: "Through.",
  failText: "Not through.",
});

const shopRoom = (): ShopRoom => ({
  kind: "shop",
  offers: [
    {
      name: "Whetstone",
      blurb: "+1 Power on all your cards, for the run",
      price: 12,
      sold: false,
      effect: {
        kind: "buff",
        buff: {
          name: "Whetstone",
          note: "+1 Power",
          mods: { power: 1 },
          rooms: null,
        },
      },
    },
    {
      name: "Smelling Salts",
      blurb: "Every card on cooldown is ready now",
      price: 8,
      sold: false,
      effect: { kind: "recover" },
    },
  ],
});

/** A run standing in `room`, with anything else overridden. */
const runIn = (
  room: Room,
  overrides: Partial<DungeonState> = {},
): DungeonState => ({
  ...createRun(source())!,
  wards: 0,
  room,
  ...overrides,
});

const WAR_PAINT: Buff = {
  name: "War Paint",
  note: "+2 type stat",
  mods: { type: 2 },
  rooms: 4,
};

/** Every text block and custom id in a message, containers flattened. */
const textOf = (message: { components: { toJSON(): unknown }[] }) =>
  JSON.stringify(message.components.map((component) => component.toJSON()));

describe("finicards v2 dungeons", () => {
  describe("the dials", () => {
    it("deals enough cards that the cooldown never empties a hand", () => {
      expect(DUNGEON.handSize).toBeGreaterThan(DUNGEON.cooldownRooms + 1);
    });

    it("costs geld to fall", () => {
      expect(DUNGEON.fallenKeep).toBeGreaterThan(0);
      expect(DUNGEON.fallenKeep).toBeLessThan(1);
    });

    it("pays more for harder fights", () => {
      expect(fightGeld(6, "elite")).toBeGreaterThan(fightGeld(6, "normal"));
      expect(fightGeld(6, "boss")).toBeGreaterThan(fightGeld(6, "elite"));
      expect(fightGeld(12, "normal")).toBeGreaterThan(fightGeld(6, "normal"));
    });
  });

  describe("starting a run", () => {
    it("opens on a plain fight in room 1", () => {
      const run = createRun(source())!;
      expect(run.depth).toBe(1);
      expect(run.phase).toBe("room");
      expect(run.room.kind).toBe("fight");
      expect((run.room as FightRoom).tier).toBe("normal");
      expect(run.doors).toEqual([]);
      expect(run.wards).toBe(DUNGEON.startingWards);
    });

    it("returns nothing for an empty pool", () => {
      expect(createRun({ pool: [] })).toBeNull();
    });
  });

  describe("enemies", () => {
    const total = (enemy: BattleCard) =>
      enemy.stats.power + enemy.stats.wit + enemy.stats.heart;

    it("goes easy for the warm-up rooms", () => {
      const { rooms, points } = DUNGEON.warmup;
      for (let seed = 0; seed < 20; seed++) {
        for (let depth = 1; depth < rooms; depth++) {
          const { enemy } = generateFight(depth, "normal", source(seed));
          expect(enemy.rarity).toBe("common");
          expect(total(enemy)).toBeLessThan(15);
        }
        expect(generateFight(rooms, "boss", source(seed)).enemy.rarity).toBe(
          "uncommon",
        );
        expect(
          generateFight(rooms * 2, "boss", source(seed)).enemy.rarity,
        ).toBe("full_art");
      }
      expect(
        enemyPoints(rooms + 1, "normal") - enemyPoints(rooms, "normal"),
      ).toBeGreaterThanOrEqual(points);
      expect(DUNGEON.eliteFrom).toBeGreaterThan(rooms);
    });

    it("grows past the stat budget with depth, without limit", () => {
      expect(enemyPoints(40, "normal")).toBeGreaterThan(
        enemyPoints(20, "normal"),
      );
      for (let seed = 0; seed < 20; seed++) {
        const deep = generateFight(30, "normal", source(seed)).enemy;
        expect(total(deep)).toBeGreaterThan(15);
      }
    });

    it("gives elites and bosses a keyword even when their card has none", () => {
      for (let seed = 0; seed < 20; seed++) {
        expect(generateFight(4, "elite", source(seed)).enemy.keyword).not.toBe(
          "",
        );
        expect(generateFight(5, "boss", source(seed)).enemy.keyword).not.toBe(
          "",
        );
      }
    });

    it("avoids a type when the pool has another", () => {
      for (let seed = 0; seed < 20; seed++) {
        const fight = generateFight(3, "normal", source(seed), [
          "power",
          "wit",
        ]);
        expect(fight.enemy.type).toBe("heart");
      }
    });
  });

  describe("doors", () => {
    const after = (
      room: Room,
      depth: number,
      seed: number,
      restricted = false,
    ) => generateDoors({ depth, room, buffs: [] }, source(seed), restricted);

    it("always offers a fight", () => {
      for (let seed = 0; seed < 60; seed++) {
        const doors = after(fightRoom(weak("e")), 2, seed);
        expect(doors).toHaveLength(2);
        expect(doors.some((door) => door.kind === "fight")).toBe(true);
      }
    });

    it("offers shops and events too", () => {
      const kinds = new Set(
        Array.from({ length: 80 }, (_, seed) =>
          after(fightRoom(weak("e")), 2, seed),
        )
          .flat()
          .map((door) => door.kind),
      );
      expect(kinds).toEqual(new Set(["fight", "shop", "event"]));
    });

    it("puts fights behind both doors after a shop or an event", () => {
      for (let seed = 0; seed < 40; seed++) {
        for (const room of [shopRoom(), eventRoom(9)]) {
          expect(
            after(room, 2, seed).every((door) => door.kind === "fight"),
          ).toBe(true);
        }
      }
    });

    it("makes two fight doors different types", () => {
      for (let seed = 0; seed < 40; seed++) {
        const [first, second] = after(shopRoom(), 2, seed) as FightRoom[];
        expect(first.enemy.type).not.toBe(second.enemy.type);
      }
    });

    it("forces a shop once one is overdue, where a shop is allowed", () => {
      const overdue = (room: Room, depth: number, seed: number) =>
        generateDoors(
          { depth, room, buffs: [], sinceShop: DUNGEON.shopPity },
          source(seed),
        );
      for (let seed = 0; seed < 40; seed++) {
        expect(
          overdue(fightRoom(weak("e")), 2, seed).some(
            (door) => door.kind === "shop",
          ),
        ).toBe(true);
        // Not after a side room, and not on the boss room.
        expect(
          overdue(eventRoom(9), 2, seed).some((door) => door.kind === "shop"),
        ).toBe(false);
        expect(
          overdue(fightRoom(weak("e")), DUNGEON.bossEvery - 1, seed).some(
            (door) => door.kind === "shop",
          ),
        ).toBe(false);
      }
    });

    it("counts door choices since a shop was on offer", () => {
      let state = runIn(fightRoom(weak("e")));
      let dry = 0;
      for (let room = 0; room < 40; room++) {
        state = playFight(state, strong(`c${room}`), source(room)).state;
        const offered = state.doors.some((door) => door.kind === "shop");
        dry = offered ? 0 : dry + 1;
        expect(state.sinceShop).toBe(dry);
        // A boss room or two can stretch it, never much further.
        expect(dry).toBeLessThanOrEqual(DUNGEON.shopPity + 2);
        const fight = state.doors.findIndex((door) => door.kind === "fight");
        state = {
          ...chooseDoor(state, fight),
          room: fightRoom(weak(`e${room}`)),
        };
      }
    });

    it("leaves a single fight door when restricted", () => {
      const doors = after(fightRoom(weak("e")), 2, 3, true);
      expect(doors).toHaveLength(1);
      expect(doors[0].kind).toBe("fight");
    });

    it("puts a boss behind every door on the boss room", () => {
      const doors = after(fightRoom(weak("e")), DUNGEON.bossEvery - 1, 5);
      expect(doors).toHaveLength(2);
      expect(
        doors.every((door) => door.kind === "fight" && door.tier === "boss"),
      ).toBe(true);
    });

    it("hints at the kind of room and never the enemy", () => {
      const fight = fightRoom(card("Secret", "wit", [3, 9, 3]), "elite");
      expect(doorHint(fight)).toBe("Elite Wit room");
      expect(doorHint(fightRoom(weak("e"), "boss"))).toBe("Boss · Power room");
      expect(doorHint(shopRoom())).toBe("Shop");
      expect(doorHint(eventRoom(9))).toBe("Event");
    });
  });

  describe("fighting", () => {
    it("pays geld and opens the doors on a win", () => {
      const before = runIn(fightRoom(weak("e")));
      const { state, result } = playFight(before, strong("a"), source());
      expect(result).toBe("won");
      expect(state.geld).toBe(10);
      expect(state.fightsWon).toBe(1);
      expect(state.phase).toBe("doors");
      expect(state.doors.length).toBeGreaterThan(0);
      expect(state.step).toBe(before.step + 1);
    });

    it("holds the room on a draw, with the card spent", () => {
      const { state, result } = playFight(
        runIn(fightRoom(weak("e"))),
        weak("a"),
        source(),
      );
      expect(result).toBe("stalemate");
      expect(state.phase).toBe("room");
      expect(state.geld).toBe(0);
      expect(cooldownLeft(state, "a")).toBeGreaterThan(0);
    });

    it("ends the run on a loss", () => {
      const { state, result } = playFight(
        runIn(fightRoom(wall("e"))),
        strong("a"),
        source(),
      );
      expect(result).toBe("fell");
      expect(state.phase).toBe("room");
    });

    it("breaks a ward instead, for no geld", () => {
      const { state, result } = playFight(
        runIn(fightRoom(wall("e")), { wards: 1 }),
        strong("a"),
        source(),
      );
      expect(result).toBe("warded");
      expect(state.wards).toBe(0);
      expect(state.geld).toBe(0);
      expect(state.phase).toBe("doors");
    });

    it("leaves the state it was given untouched", () => {
      const before = runIn(fightRoom(weak("e")));
      const snapshot = structuredClone(before);
      playFight(before, strong("a", "rally"), source());
      expect(before).toEqual(snapshot);
    });

    it("refuses a card on cooldown", () => {
      const state = runIn(fightRoom(weak("e")), { readyAt: { a: 3 } });
      expect(() => playFight(state, strong("a"), source())).toThrow();
    });

    it("refuses to fight in a room that is not a fight", () => {
      expect(() =>
        playFight(runIn(shopRoom()), strong("a"), source()),
      ).toThrow();
    });

    it("fights with the run's buffs", () => {
      // 5/5/5 into 5/5/5 is a draw; a point of Power makes it a win.
      const buffed = runIn(fightRoom(weak("e")), {
        buffs: [
          { name: "Whetstone", note: "", mods: { power: 1 }, rooms: null },
        ],
      });
      expect(playFight(buffed, weak("a"), source()).result).toBe("won");

      const hexed = runIn(fightRoom(weak("e")), {
        buffs: [{ name: "Hex", note: "", mods: { enemy: 1 }, rooms: 3 }],
      });
      expect(playFight(hexed, weak("a"), source()).result).toBe("won");
    });

    it("pays more with a geld buff", () => {
      const state = runIn(fightRoom(weak("e")), {
        buffs: [
          { name: "Deep Pockets", note: "", mods: { geld: 50 }, rooms: null },
        ],
      });
      expect(playFight(state, strong("a"), source()).state.geld).toBe(15);
    });
  });

  describe("boss drops", () => {
    const beat = (tier: FightRoom["tier"], bossesWon = 0, seed = 1) =>
      playFight(
        runIn(fightRoom(weak("e"), tier), { bossesWon }),
        strong("a"),
        source(seed),
      ).state;

    it("banks an uncommon for an early boss, and nothing for other fights", () => {
      for (let seed = 0; seed < 20; seed++) {
        const state = beat("boss", 0, seed);
        expect(state.bossesWon).toBe(1);
        expect(state.loot).toEqual(["uncommon"]);
      }
      expect(beat("normal").loot).toEqual([]);
      expect(beat("elite").loot).toEqual([]);
    });

    it("drops nothing when a ward carries you past the boss", () => {
      const { state } = playFight(
        runIn(fightRoom(wall("e"), "boss"), { wards: 1 }),
        strong("a"),
        source(),
      );
      expect(state.loot).toEqual([]);
      expect(state.bossesWon).toBe(0);
    });

    it("holds at uncommon, then climbs to a certain full-art", () => {
      const odds = Array.from({ length: 12 }, (_, index) =>
        bossFullArtChance(index + 1),
      );
      expect(odds.slice(0, 3)).toEqual([0, 0, 0]);
      expect(odds).toEqual([...odds].sort((a, b) => a - b));
      expect(odds.at(-1)).toBe(100);

      // Not a straight line: the steps get bigger before they run out.
      const steps = odds.slice(1).map((chance, index) => chance - odds[index]);
      expect(new Set(steps.filter((step) => step > 0)).size).toBeGreaterThan(1);

      for (let seed = 0; seed < 20; seed++) {
        expect(beat("boss", DUNGEON.bossFullArtOdds.length, seed).loot).toEqual(
          ["full_art"],
        );
      }
    });
  });

  describe("keywords across fights", () => {
    /** Wins `count` fights in a row, each with a fresh card. */
    const winning = (count: number): DungeonState => {
      let state = runIn(fightRoom(weak("e0")));
      for (let fight = 0; fight < count; fight++) {
        state = playFight(state, strong(`w${fight}`), source()).state;
        state = {
          ...chooseDoor(state, 0),
          room: fightRoom(weak(`e${fight + 1}`)),
        };
      }
      return state;
    };

    it("counts earlier fights of the leg as rounds won", () => {
      const { round } = playFight(
        winning(2),
        strong("m", "momentum"),
        source(),
      );
      expect(round.challenger.bonuses).toContain("Momentum +2");
    });

    it("hands a Rally on to the next card played", () => {
      let state = playFight(
        runIn(fightRoom(weak("e"))),
        strong("a", "rally"),
        source(),
      ).state;
      state = { ...chooseDoor(state, 0), room: fightRoom(weak("e2")) };
      const { round } = playFight(state, strong("b"), source());
      expect(round.challenger.bonuses).toContain("Rally +2");
    });

    it("starts a fresh match every third fight", () => {
      expect(nextSlot(winning(0))).toBe(1);
      expect(nextSlot(winning(2))).toBe(3);
      expect(nextSlot(winning(3))).toBe(1);

      const { round } = playFight(
        winning(3),
        strong("m", "momentum"),
        source(),
      );
      expect(round.slot).toBe(1);
      expect(round.challenger.bonuses).toEqual([]);
    });

    it("fires slot keywords on the leg's slots", () => {
      const first = playFight(winning(0), strong("v", "vanguard"), source());
      expect(first.round.challenger.bonuses).toHaveLength(1);
      const last = playFight(winning(2), strong("l", "last_stand"), source());
      expect(last.round.challenger.bonuses).toHaveLength(1);
    });
  });

  describe("cooldowns", () => {
    /** Plays `a` in room 1, then walks `rooms` doors on. */
    const roomsLater = (rooms: number, buffs: Buff[] = []) => {
      let state = playFight(
        runIn(fightRoom(weak("e")), { buffs }),
        strong("a"),
        source(),
      ).state;
      for (let step = 0; step < rooms; step++) {
        state = chooseDoor(
          { ...state, phase: "doors", doors: [shopRoom()] },
          0,
        );
      }
      return state;
    };

    it("rests a played card for the next two rooms", () => {
      expect(DUNGEON.cooldownRooms).toBe(2);
      expect(cooldownLeft(roomsLater(0), "a")).toBe(3);
      expect(cooldownLeft(roomsLater(1), "a")).toBe(2);
      expect(cooldownLeft(roomsLater(2), "a")).toBe(1);
      expect(cooldownLeft(roomsLater(3), "a")).toBe(0);
    });

    it("comes back a room sooner with a cooldown buff", () => {
      const quick: Buff = {
        name: "Quick Hands",
        note: "",
        mods: { cooldown: -1 },
        rooms: null,
      };
      expect(cooldownLeft(roomsLater(1, [quick]), "a")).toBe(1);
      expect(cooldownLeft(roomsLater(2, [quick]), "a")).toBe(0);
    });

    it("counts every kind of room", () => {
      const left = chooseDoor(leaveShop(roomsLater(1), source()), 0);
      expect(cooldownLeft(left, "a")).toBe(1);
    });
  });

  describe("events", () => {
    it("passes when the stat and the die reach the target", () => {
      // strong() has Power 7; the lowest roll is 1.
      const { state, passed, die, total } = playEvent(
        runIn(eventRoom(8)),
        strong("a"),
        source(),
      );
      expect(passed).toBe(true);
      expect(total).toBe(7 + die);
      expect(state.geld).toBe(9);
      expect(state.phase).toBe("doors");
      expect(state.doors).toHaveLength(2);
      expect(cooldownLeft(state, "a")).toBeGreaterThan(0);
    });

    it("costs the choice of door when failed, never the run", () => {
      const { state, passed } = playEvent(
        runIn(eventRoom(99)),
        strong("a"),
        source(),
      );
      expect(passed).toBe(false);
      expect(state.geld).toBe(0);
      expect(state.phase).toBe("doors");
      expect(state.doors).toHaveLength(1);
    });

    it("can be walked past, which counts as failing", () => {
      const state = skipEvent(runIn(eventRoom(8)), source());
      expect(state.doors).toHaveLength(1);
      expect(state.readyAt).toEqual({});
    });

    it("quotes the chance a card has", () => {
      const none = modsOf({ buffs: [] });
      expect(eventChance(eventRoom(8), strong("a"), none)).toBe(1);
      expect(eventChance(eventRoom(10), strong("a"), none)).toBe(4 / 6);
      expect(eventChance(eventRoom(14), strong("a"), none)).toBe(0);
      expect(
        eventChance(eventRoom(10), strong("a"), { ...none, roll: 1, power: 1 }),
      ).toBe(1);
    });

    it("can recover every resting card", () => {
      const room: EventRoom = { ...eventRoom(1), reward: { kind: "recover" } };
      const { state } = playEvent(
        runIn(room, { readyAt: { b: 9, c: 9 } }),
        strong("a"),
        source(),
      );
      expect(state.readyAt).toEqual({});
    });

    it("asks more of a card deeper in", () => {
      expect(generateEvent(20, seeded(1)).target).toBeGreaterThan(
        generateEvent(1, seeded(1)).target,
      );
    });
  });

  describe("shops", () => {
    it("sells a buff for geld, once", () => {
      const state = buyOffer(runIn(shopRoom(), { geld: 20 }), 0);
      expect(state.geld).toBe(8);
      expect(modsOf(state).power).toBe(1);
      expect((state.room as ShopRoom).offers[0].sold).toBe(true);
      expect(state.phase).toBe("room");
      expect(() => buyOffer(state, 0)).toThrow();
    });

    it("refuses what the purse cannot cover", () => {
      expect(() => buyOffer(runIn(shopRoom(), { geld: 11 }), 0)).toThrow();
    });

    it("sells a way to recover cards", () => {
      const state = buyOffer(
        runIn(shopRoom(), { geld: 8, readyAt: { a: 9 } }),
        1,
      );
      expect(state.readyAt).toEqual({});
    });

    it("opens the doors on the way out", () => {
      const state = leaveShop(runIn(shopRoom()), source());
      expect(state.phase).toBe("doors");
      expect(state.doors).toHaveLength(2);
    });

    it("stocks distinct wares, and never a second Quick Hands", () => {
      const owned: Buff = {
        name: "Quick Hands",
        note: "",
        mods: { cooldown: -1 },
        rooms: null,
      };
      for (let seed = 0; seed < 40; seed++) {
        const offers = generateShop([owned], seeded(seed)).offers;
        const names = offers.map((offer) => offer.name);
        // The regular shelf, and sometimes one special ware beside it.
        expect([DUNGEON.shopOffers, DUNGEON.shopOffers + 1]).toContain(
          offers.length,
        );
        expect(new Set(names).size).toBe(names.length);
        expect(names).not.toContain("Quick Hands");
      }
    });
  });

  describe("taking a door", () => {
    const atDoors = (overrides: Partial<DungeonState> = {}) =>
      leaveShop(runIn(shopRoom(), overrides), source());

    it("steps into the room behind it", () => {
      const before = atDoors();
      const state = chooseDoor(before, 1);
      expect(state.depth).toBe(before.depth + 1);
      expect(state.room).toEqual(before.doors[1]);
      expect(state.phase).toBe("room");
      expect(state.doors).toEqual([]);
    });

    it("refuses a door that is not there", () => {
      expect(() => chooseDoor(atDoors(), 2)).toThrow();
      expect(() => chooseDoor(runIn(shopRoom()), 0)).toThrow();
    });

    it("runs a temporary buff for exactly the rooms it promised", () => {
      // Bought in a shop for "the next 3 rooms".
      let state = atDoors({ buffs: [WAR_PAINT] });
      for (let room = 0; room < 3; room++) {
        state = chooseDoor(state, 0);
        expect(modsOf(state).type).toBe(2);
        state = { ...state, phase: "doors", doors: [shopRoom()] };
      }
      expect(modsOf(chooseDoor(state, 0)).type).toBe(0);
    });
  });

  describe("the payout", () => {
    it("keeps everything on a walk out and a share on a fall", () => {
      expect(payoutFor(100, false)).toEqual({
        geld: 100,
        kept: 100,
        coin: coinFor(100),
      });
      const fell = payoutFor(100, true);
      expect(fell.kept).toBe(100 * DUNGEON.fallenKeep);
      expect(fell.coin).toBe(coinFor(fell.kept));
      expect(fell.coin).toBeLessThan(coinFor(100));
    });

    it("pays nothing for nothing", () => {
      expect(payoutFor(0, false).coin).toBe(0);
    });
  });

  describe("the run message", () => {
    const noImages = { scene: null, hand: null };
    const base = {
      runId: "run1",
      userId: "u1",
      playerName: "Fen",
      entryFee: DUNGEON.entryFee,
      state: "active" as const,
    };
    const hand = [
      { card: strong("a"), index: 0 },
      { card: strong("b"), index: 1 },
      { card: strong("c"), index: 4 },
    ];

    it("offers only the ready cards, by hand index and step", () => {
      const text = textOf(
        composeDungeonMessage(
          {
            ...base,
            progress: runIn(fightRoom(wall("e")), {
              step: 7,
              depth: 2,
              readyAt: { b: 4 },
            }),
            hand,
          },
          noImages,
        ),
      );

      expect(text).toContain("Dungeon — room 2");
      expect(text).toContain("v2_dungeon:run1:7:c0");
      expect(text).toContain("v2_dungeon:run1:7:c4");
      expect(text).not.toContain("v2_dungeon:run1:7:c1");
      expect(text).toContain("v2_dungeon:run1:7:retreat");
      // No image, so the enemy and the resting card are spelled out.
      expect(text).toContain("12/12/12");
      expect(text).toContain("ready in 2 rooms");
    });

    it("spaces the fight room out: the enemy's ability, its slot, then how to play", () => {
      const fighter = { ...wall("e"), keyword: "intimidate" };
      const text = textOf(
        composeDungeonMessage(
          {
            ...base,
            progress: runIn(fightRoom(fighter), { depth: 2 }),
            hand,
          },
          noImages,
        ),
      );

      // A blank line after the ability, another after the slot.
      expect(text).toMatch(
        /Intimidate[^"]*\\n\\n-# For abilities this is \*\*slot 1 of \d\*\*\.\\n\\n-# Play a card to fight\. It then rests for \d rooms\.\\n-# /,
      );
      expect(text).not.toContain("Lose and the run ends");
    });

    it("starts the fight room at the slot when the enemy has no ability", () => {
      const text = textOf(
        composeDungeonMessage(
          {
            ...base,
            progress: runIn(fightRoom(wall("e")), { depth: 2 }),
            hand,
          },
          noImages,
        ),
      );
      expect(text).toContain('"content":"-# For abilities this is');
    });

    it("shows doors as hints, without the room behind them", () => {
      const secret = fightRoom(card("Secret", "wit", [3, 9, 3]), "elite");
      const message = composeDungeonMessage(
        {
          ...base,
          progress: runIn(fightRoom(weak("e")), {
            phase: "doors",
            doors: [secret, shopRoom()],
          }),
          hand,
        },
        noImages,
      );
      const text = textOf(message);

      expect(text).toContain("v2_dungeon:run1:0:d0");
      expect(text).toContain("v2_dungeon:run1:0:d1");
      expect(text).toContain("Elite Wit room");
      expect(text).not.toContain("Card Secret");
      expect(text).not.toContain("Whetstone");
      expect(text).not.toContain(":c0");
    });

    it("locks what the purse cannot cover in a shop", () => {
      const message = composeDungeonMessage(
        { ...base, progress: runIn(shopRoom(), { geld: 9 }), hand },
        noImages,
      );
      const buttons = (message.components[1].toJSON() as any).components
        .flatMap((component: any) => component.components ?? [])
        .filter((component: any) => component.custom_id);

      expect(buttons.map((button: any) => button.custom_id)).toEqual([
        "v2_dungeon:run1:0:b0",
        "v2_dungeon:run1:0:b1",
        "v2_dungeon:run1:0:leave",
      ]);
      expect(buttons.map((button: any) => !!button.disabled)).toEqual([
        true,
        false,
        false,
      ]);
      expect(textOf(message)).not.toContain(":c0");
    });

    it("quotes each card's chance at an event", () => {
      const text = textOf(
        composeDungeonMessage(
          { ...base, progress: runIn(eventRoom(10)), hand },
          noImages,
        ),
      );
      expect(text).toContain("67%");
      expect(text).toContain("v2_dungeon:run1:0:leave");
    });

    it("applies buffs to the hand it shows", () => {
      const text = textOf(
        composeDungeonMessage(
          {
            ...base,
            progress: runIn(fightRoom(weak("e")), { buffs: [WAR_PAINT] }),
            hand,
          },
          noImages,
        ),
      );
      expect(text).toContain("9/5/3");
      expect(text).toContain("War Paint");
    });

    it("shows what is banked, and the cards once the run ends", () => {
      const progress = runIn(fightRoom(weak("e")), {
        loot: ["uncommon", "uncommon", "full_art"],
      });
      expect(
        textOf(composeDungeonMessage({ ...base, progress, hand }, noImages)),
      ).toContain("2 uncommon + 1 full-art banked");

      const drop = card("Prize", "heart", [2, 4, 9]);
      const done = textOf(
        composeDungeonMessage(
          {
            ...base,
            state: "retreated",
            progress,
            hand: [],
            reward: { kind: "none", cards: [drop] },
          },
          noImages,
        ),
      );
      expect(done).toContain("Boss drop");
      expect(done).toContain("Card Prize");
    });

    it("keeps a long run's results within Discord's ten attachments", async () => {
      const drops = Array.from({ length: 11 }, (_, i) => ({
        ...card(`Prize ${i}`, "heart", [2, 4, 9]),
        instanceId: `drop${i}abcdef`,
      }));
      const message = await buildDungeonMessage({
        ...base,
        state: "retreated",
        progress: runIn(fightRoom(weak("e")), { depth: 65, geld: 2854 }),
        hand: [],
        reward: { kind: "none", cards: drops },
      });

      expect(message.files.length).toBeLessThanOrEqual(10);
      // Every drop is still listed, pictured or not.
      expect(textOf(message)).toContain("Card Prize 10");
    });

    it("drops the buttons and states the payout once the run ends", () => {
      const progress = runIn(fightRoom(wall("e")), { depth: 6, geld: 80 });
      const payout = payoutFor(80, true);
      const text = textOf(
        composeDungeonMessage(
          {
            ...base,
            state: "failed",
            progress,
            hand: [],
            reward: { kind: "coin", amount: payout.coin, ...payout },
          },
          noImages,
        ),
      );

      expect(text).toContain("Fell in room 6");
      expect(text).toContain(`**${payout.coin} fc**`);
      expect(text).not.toContain("v2_dungeon:");
    });
  });

  describe("the path and the summary", () => {
    it("records each room, how it went, and the door passed up", () => {
      let state = playFight(
        runIn(fightRoom(weak("e"))),
        strong("a"),
        source(),
      ).state;
      state = chooseDoor(
        {
          ...state,
          doors: [
            eventRoom(99),
            fightRoom(card("x", "wit", [3, 9, 3]), "elite"),
          ],
        },
        0,
      );
      state = playEvent(state, strong("b"), source()).state;

      expect(state.path).toEqual([
        {
          room: { kind: "fight", tier: "normal", type: "power" },
          result: "won",
        },
        {
          room: { kind: "event" },
          result: "failed",
          skipped: { kind: "fight", tier: "elite", type: "wit" },
        },
      ]);
      expect(state.stats.cardWins).toEqual({ "Card a": 1 });
      expect(state.stats.geldEarned).toBe(10);
    });

    it("tracks geld spent", () => {
      expect(buyOffer(runIn(shopRoom(), { geld: 20 }), 0).stats.geldSpent).toBe(
        12,
      );
    });

    it("draws the numbers, the MVP and a node per room", async () => {
      const progress = runIn(fightRoom(wall("e"), "boss"), {
        depth: 3,
        fightsWon: 2,
        path: [
          {
            room: { kind: "fight", tier: "normal", type: "power" },
            result: "won",
          },
          { room: { kind: "shop" }, skipped: { kind: "event" } },
          {
            room: { kind: "fight", tier: "boss", type: "heart" },
            result: "fell",
          },
        ],
        stats: {
          geldEarned: 31,
          geldSpent: 8,
          eventsPassed: 0,
          cardWins: { Goku: 2, Tohru: 1 },
        },
      });
      const svg = buildDungeonSummarySvg({ progress, fell: true, coin: 4 });

      expect(svg).toContain("FELL IN ROOM 3");
      expect(svg).toContain("MVP · GOKU · 2 WINS");
      expect(svg).toContain(">31</text>");
      expect(svg).toContain("4 fc");

      const png = await renderDungeonSummary({ progress, fell: true, coin: 4 });
      expect(png!.subarray(0, 4).toString("hex")).toBe("89504e47");
    });

    it("keeps to the last few rows of a very long run", () => {
      const path = Array.from({ length: 120 }, () => ({
        room: { kind: "shop" as const },
      }));
      const svg = buildDungeonSummarySvg({
        progress: runIn(shopRoom(), { depth: 120, path }),
        fell: false,
        coin: 0,
      });
      expect(svg).toContain("THE LAST 48 ROOMS");
      expect(svg).toContain(">120</text>");
      expect(svg).not.toContain(">72</text>");
    });
  });

  describe("the scene", () => {
    const scene = (room: Room, doors: Room[] = []) =>
      buildDungeonSceneSvg({
        phase: doors.length > 0 ? "doors" : "room",
        depth: 4,
        room,
        doors,
      });

    it("draws the enemy's name and all three stats", () => {
      const svg = scene(fightRoom(card("Zed", "wit", [3, 11, 4])));
      expect(svg).toContain("Card Zed");
      for (const stat of ["3", "11", "4"])
        expect(svg).toContain(`>${stat}</text>`);
    });

    it("draws doors without what is behind them", () => {
      const svg = scene(fightRoom(weak("e")), [
        fightRoom(card("Zed", "wit", [3, 11, 4])),
        shopRoom(),
      ]);
      expect(svg).toContain("WIT ROOM");
      expect(svg).toContain("SHOP");
      expect(svg).not.toContain("Zed");
      expect(svg).not.toContain("Whetstone");
    });

    it("renders every kind of room to a PNG", async () => {
      const rooms: Room[] = [
        generateFight(9, "boss", source()),
        generateShop([], seeded(2)),
        generateEvent(3, seeded(3)),
      ];
      for (const room of rooms) {
        const buffer = await renderDungeonScene({
          phase: "room",
          depth: 4,
          room,
          doors: [],
        });
        expect(buffer!.subarray(0, 4).toString("hex")).toBe("89504e47");
      }
      const doors = await renderDungeonScene({
        phase: "doors",
        depth: 4,
        room: rooms[0],
        doors: [rooms[0], rooms[1]],
      });
      expect(doors!.subarray(0, 4).toString("hex")).toBe("89504e47");
    });
  });

  describe("the buff list", () => {
    const buff = (
      name: string,
      mods: Record<string, number>,
      rooms: number | null,
    ) => ({
      name,
      note: "",
      mods,
      rooms,
    });

    it("adds up the for-the-run buffs and merges identical timed ones", () => {
      const lines = buffLines([
        buff("Whetstone", { power: 1 }, null),
        buff("Whetstone", { power: 1 }, null),
        buff("Owl Feather", { wit: 1 }, null),
        buff("War Paint", { type: 2 }, 3),
        buff("War Paint", { type: 2 }, 3),
        buff("War Paint", { type: 2 }, 1),
      ]);
      expect(lines).toEqual([
        "-# 💪 Your cards: +2 Power, +1 Wit · War Paint ×2: +4 type stat _(3 rooms)_ · War Paint: +2 type stat _(1 room)_",
      ]);
    });

    it("puts each buff under what it changes, in a fixed order", () => {
      const lines = buffLines([
        buff("Treasure Map", { scout: 1 }, 2),
        buff("Deep Pockets", { geld: 25 }, null),
        buff("Hex Doll", { enemy: 1 }, 4),
        buff("Quick Hands", { cooldown: -1 }, null),
      ]);
      expect(lines).toEqual([
        "-# 🧿 Enemies: Hex Doll: −1 all stats _(4 rooms)_",
        "-# 🪙 Geld: +25% from fights",
        "-# ⏱️ Rest: 1 room shorter",
        "-# 🗺️ Doors: Treasure Map: enemies shown _(2 door choices)_",
      ]);
      expect(buffLines([])).toEqual([]);
    });
  });

  describe("shop prices", () => {
    it("hold at the listed price through the warm-up", () => {
      expect(shopPrice(12, 1)).toBe(12);
      expect(shopPrice(12, 4)).toBe(12);
      expect(shopPrice(12, DUNGEON.warmup.rooms)).toBe(12);
    });

    it("rise with depth after the first boss", () => {
      expect(shopPrice(12, 6)).toBe(18);
      expect(shopPrice(12, 11)).toBe(24);
      expect(shopPrice(12, 41)).toBe(60);
    });

    it("are charged at the depth the shop is found", () => {
      const early = generateShop([], seeded(4)).offers;
      const deep = generateShop([], seeded(4), DUNGEON, 31).offers;
      expect(deep.map((offer) => offer.name)).toEqual(
        early.map((offer) => offer.name),
      );
      deep.forEach((offer, i) =>
        expect(offer.price).toBe(shopPrice(early[i].price, 31)),
      );
    });
  });

  describe("Secret Art enemies", () => {
    const fullArts = [
      ...["a", "b", "c"].map((id) =>
        card(id, "wit", [3, 9, 3], "", "full_art"),
      ),
      ...["s1", "s2", "s3"].map((id) => ({
        ...card(id, "wit", [3, 9, 3], "", "full_art"),
        secretArt: true,
      })),
    ];

    it("turn up about as often as secretArtEnemyChance, not as often as they are in the pool", () => {
      const runs = 4000;
      let secret = 0;
      for (let seed = 0; seed < runs; seed++) {
        const fight = generateFight(20, "boss", {
          pool: fullArts,
          random: seeded(seed),
        });
        if (fight.enemy.secretArt) secret++;
      }
      const expected = runs * DUNGEON.secretArtEnemyChance;
      expect(secret).toBeGreaterThan(expected * 0.5);
      expect(secret).toBeLessThan(expected * 1.5);
    });

    it("still fight when they are all a tier has", () => {
      const onlySecret = fullArts.filter((enemy) => enemy.secretArt);
      expect(
        generateFight(20, "boss", { pool: onlySecret, random: seeded(1) }).enemy
          .secretArt,
      ).toBe(true);
    });
  });

  describe("sneak peeks", () => {
    const PREVIEW = [card("next", "wit", [3, 8, 4])];
    const peek = (seed: number, config = DUNGEON) =>
      generateDoors(
        { depth: 2, room: fightRoom(weak("e")), buffs: [] },
        { ...source(seed), preview: PREVIEW },
        false,
        config,
      ).filter(
        (door): door is FightRoom => door.kind === "fight" && !!door.preview,
      );

    it("puts a Sudden enemy behind about one door choice in previewEvery", () => {
      const runs = 3000;
      let seen = 0;
      for (let seed = 0; seed < runs; seed++) {
        const shown = peek(seed);
        expect(shown.length).toBeLessThanOrEqual(1);
        for (const door of shown) {
          expect(door.enemy.name).toBe("Sudden Card next");
          expect(door.tier).toBe("normal");
        }
        seen += shown.length;
      }
      const expected = runs / DUNGEON.previewEvery;
      expect(seen).toBeGreaterThan(expected * 0.5);
      expect(seen).toBeLessThan(expected * 1.5);
    });

    it("says so on the door, so the player can choose it", () => {
      // Spread out: this generator's first draw barely moves between neighbouring seeds.
      const shown = Array.from({ length: 300 }, (_, i) =>
        peek(i * 7919),
      ).flat();
      expect(shown.length).toBeGreaterThan(0);
      for (const door of shown) expect(doorHint(door)).toContain("sneak peek");
    });

    it("never previews behind a boss door, or when switched off", () => {
      for (let seed = 0; seed < 300; seed++) {
        const boss = generateDoors(
          {
            depth: DUNGEON.bossEvery - 1,
            room: fightRoom(weak("e")),
            buffs: [],
          },
          { ...source(seed), preview: PREVIEW, random: () => 0 },
        );
        expect(boss.some((door) => door.kind === "fight" && door.preview)).toBe(
          false,
        );
        expect(peek(seed, { ...DUNGEON, previewEvery: 0 })).toHaveLength(0);
      }
    });

    it("rolls the same dice as before when there is nothing to preview", () => {
      const room = fightRoom(weak("e"));
      for (let seed = 0; seed < 20; seed++) {
        const plain = generateDoors(
          { depth: 2, room, buffs: [] },
          source(seed),
        );
        const empty = generateDoors(
          { depth: 2, room, buffs: [] },
          { ...source(seed), preview: [] },
        );
        expect(empty).toEqual(plain);
      }
    });

    const definition = (
      id: string,
      set: number,
      active: boolean,
      extra: Partial<V2CardDefinitionRecord> = {},
    ) =>
      ({
        id,
        card_name: id,
        set,
        active,
        art: "art.webp",
        secret_art: false,
        ...extra,
      }) as V2CardDefinitionRecord;

    it("previews only the first set with nothing out, without secrets or unfinished art", () => {
      const picked = previewCards([
        definition("released", 3, true),
        definition("held-back", 3, false),
        definition("next", 4, false),
        definition("next-secret", 4, false, { secret_art: true }),
        definition("next-no-art", 4, false, { art: "" }),
        definition("later", 5, false),
        definition("unset", 0, false),
      ]);
      expect(picked.map((entry) => entry.id)).toEqual(["next"]);
    });

    it("previews nothing when every set is out", () => {
      expect(
        previewCards([definition("a", 1, true), definition("b", 2, true)]),
      ).toEqual([]);
    });
  });

  describe("effects that reach into the hand", () => {
    const HAND = [
      card("h0", "power", [7, 4, 4]),
      card("h1", "wit", [3, 9, 3]),
      card("h2", "heart", [4, 3, 8]),
    ];
    const withHand = (seed = 1): RoomSource => ({
      ...source(seed),
      hand: HAND,
    });
    const stinger = (failEffect: EventRoom["failEffect"]): EventRoom => ({
      ...eventRoom(99),
      failEffect,
    });

    it("sings the strongest ready card to sleep, and keeps both doors open", () => {
      const state = runIn(
        stinger({ kind: "sleep", rooms: 3, pick: "strongest" }),
      );
      const { state: next, passed } = playEvent(state, HAND[0], withHand());
      expect(passed).toBe(false);
      // h0 was played and rests; of the two left awake, h1's 9 is the biggest.
      // Counted like a cooldown: resting the next 3 rooms reads 4 from this one.
      expect(cooldownLeft(next, "h1")).toBe(4);
      expect(cooldownLeft(next, "h2")).toBe(0);
      expect(next.doors).toHaveLength(2);
      expect(next.recap?.lines.join("\n")).toContain(
        "Card h1** falls asleep for 3 rooms",
      );
    });

    it("never wakes a card that is already resting for longer", () => {
      const state = runIn(
        stinger({ kind: "sleep", rooms: 1, pick: "strongest" }),
        {
          readyAt: { h1: 9 },
        },
      );
      const next = playEvent(state, HAND[0], withHand()).state;
      expect(next.readyAt.h1).toBe(9);
    });

    it("marks every resting card for a redraw, and only those", () => {
      const state = runIn(stinger({ kind: "redraw", pick: "resting" }), {
        readyAt: { h2: 5 },
      });
      // h0 rests from being played, h2 was already resting.
      expect(playEvent(state, HAND[0], withHand()).state.redraw).toEqual([
        "h0",
        "h2",
      ]);
    });

    it("marks the whole hand for a full redraw, and a count for a random one", () => {
      expect(
        skipEvent(runIn(stinger({ kind: "redraw", pick: "all" })), withHand())
          .redraw,
      ).toEqual(["h0", "h1", "h2"]);
      for (let seed = 0; seed < 20; seed++) {
        const marked = skipEvent(
          runIn(stinger({ kind: "redraw", pick: "random", count: 2 })),
          withHand(seed),
        ).redraw!;
        expect(new Set(marked).size).toBe(2);
      }
    });

    it("refuses a Fresh Shuffle with nothing resting", () => {
      const shop: ShopRoom = {
        kind: "shop",
        offers: [
          {
            name: "Fresh Shuffle",
            blurb: "",
            price: 10,
            sold: false,
            effect: { kind: "redraw", pick: "resting" },
          },
        ],
      };
      expect(() => buyOffer(runIn(shop, { geld: 20 }), 0, withHand())).toThrow(
        "nothing to swap",
      );
      const bought = buyOffer(
        runIn(shop, { geld: 20, readyAt: { h1: 5 } }),
        0,
        withHand(),
      );
      expect(bought.redraw).toEqual(["h1"]);
      expect(bought.geld).toBe(10);
    });

    it("deals each replacement into its old card's place, from cards not in hand", () => {
      const dealt = redealHand(
        ["a", "b", "c"],
        ["c", "a"],
        ["a", "b", "c", "d", "e"],
        () => 0,
      );
      expect(dealt.hand).toEqual(["e", "b", "d"]);
      expect(dealt.swapped).toEqual([
        { from: "c", to: "d" },
        { from: "a", to: "e" },
      ]);
    });

    it("swaps what it can when the deck runs out", () => {
      const dealt = redealHand(
        ["a", "b"],
        ["a", "b"],
        ["a", "b", "c"],
        () => 0,
      );
      expect(dealt.hand).toEqual(["c", "b"]);
      expect(dealt.swapped).toHaveLength(1);
    });
  });

  describe("tricks: fog, maps, idols, echoes, dice and coffee", () => {
    const HAND = [card("h0", "power", [7, 4, 4]), card("h1", "wit", [3, 9, 3])];
    /** Dice that land where they are told, in order. */
    const dice = (...faces: number[]) => {
      let next = 0;
      return () =>
        (faces[Math.min(next++, faces.length - 1)] - 1) / DUNGEON.event.die +
        0.01;
    };
    const at = (_room: EventRoom, random: () => number): RoomSource => ({
      pool: POOL,
      hand: HAND,
      random,
    });
    const event = (overrides: Partial<EventRoom>): EventRoom => ({
      ...eventRoom(9),
      ...overrides,
    });
    const FOG: Buff = { name: "Fog", note: "", mods: { fog: 1 }, rooms: 1 };
    const MAP: Buff = { name: "Map", note: "", mods: { scout: 1 }, rooms: 3 };

    it("lets a map see through fog", () => {
      expect(doorSight({ buffs: [] })).toBe("plain");
      expect(doorSight({ buffs: [FOG] })).toBe("fogged");
      expect(doorSight({ buffs: [MAP] })).toBe("scouted");
      expect(doorSight({ buffs: [FOG, MAP] })).toBe("scouted");
    });

    it("fogs only the doors right after the event", () => {
      const room = event({
        failEffect: { kind: "buff", buff: FOG },
      });
      // Power 7 + 1 misses a 9, and leaves both doors open under the fog.
      const failed = playEvent(runIn(room), HAND[0], at(room, dice(1))).state;
      expect(failed.doors).toHaveLength(2);
      expect(doorSight(failed)).toBe("fogged");
      expect(doorSight(chooseDoor(failed, 0))).toBe("plain");
    });

    it("keeps a map for three door choices", () => {
      let state: DungeonState = runIn(fightRoom(weak("e")), {
        phase: "doors",
        doors: [fightRoom(weak("x"))],
        buffs: [MAP],
      });
      for (let choice = 1; choice <= 3; choice++) {
        expect(doorSight(state)).toBe("scouted");
        state = {
          ...chooseDoor(state, 0),
          phase: "doors",
          doors: [fightRoom(weak("x"))],
        };
      }
      expect(doorSight(state)).toBe("plain");
    });

    it("pays the idol's gold with a nap, and naps anyway on a miss", () => {
      const room = event({
        reward: {
          kind: "many",
          effects: [
            { kind: "geld", amount: 20 },
            { kind: "sleep", rooms: 2, pick: "random" },
          ],
        },
        failEffect: { kind: "sleep", rooms: 2, pick: "random" },
      });
      const passed = playEvent(runIn(room), HAND[0], at(room, dice(6))).state;
      expect(passed.geld).toBe(20);
      expect(cooldownLeft(passed, "h1")).toBeGreaterThan(0);

      const failed = playEvent(runIn(room), HAND[0], at(room, dice(1))).state;
      expect(failed.geld).toBe(0);
      expect(cooldownLeft(failed, "h1")).toBeGreaterThan(0);
      expect(failed.doors).toHaveLength(2);
    });

    it("starts the fight count over in the echo chamber", () => {
      const room = event({ reward: { kind: "resetLeg" } });
      const mid = playFight(
        runIn(fightRoom(weak("e"))),
        strong("s"),
        source(),
      ).state;
      expect(nextSlot(mid)).toBe(2);
      const echoed = playEvent(
        { ...mid, room, phase: "room" },
        HAND[0],
        at(room, dice(6)),
      ).state;
      expect(nextSlot(echoed)).toBe(1);
    });

    it("spends a loaded die on a miss, and only on a miss", () => {
      const room = event({});
      const saved = playEvent(
        runIn(room, { rerolls: 1 }),
        HAND[0],
        at(room, dice(1, 5)),
      );
      expect(saved.passed).toBe(true);
      expect(saved.state.rerolls).toBe(0);
      expect(saved.state.recap?.lines[0]).toContain("loaded die");

      const lucky = playEvent(
        runIn(room, { rerolls: 1 }),
        HAND[0],
        at(room, dice(6)),
      );
      expect(lucky.passed).toBe(true);
      expect(lucky.state.rerolls).toBe(1);
    });

    it("wakes a resting card with coffee, in any room", () => {
      const tired = runIn(shopRoom(), { coffee: 1, readyAt: { h1: 9 } });
      const awake = drinkCoffee(tired, HAND[1]);
      expect(cooldownLeft(awake, "h1")).toBe(0);
      expect(awake.coffee).toBe(0);
      expect(awake.step).toBe(tired.step + 1);
      expect(() => drinkCoffee(awake, HAND[1])).toThrow("out of coffee");
      expect(() =>
        drinkCoffee(runIn(shopRoom(), { coffee: 1 }), HAND[0]),
      ).toThrow("already awake");
    });

    describe("in the message", () => {
      const base = {
        runId: "run1",
        userId: "u1",
        playerName: "Fen",
        entryFee: DUNGEON.entryFee,
        state: "active" as const,
        hand: HAND.map((entry, index) => ({ card: entry, index })),
      };
      const doors = [fightRoom(card("Lurker", "wit", [3, 9, 3])), shopRoom()];

      it("hides the doors in fog, and names the enemy under a map", () => {
        const fogged = textOf(
          composeDungeonMessage(
            {
              ...base,
              progress: runIn(fightRoom(weak("e")), {
                phase: "doors",
                doors,
                buffs: [FOG],
              }),
            },
            { scene: null, hand: null },
          ),
        );
        expect(fogged).toContain("???");
        expect(fogged).not.toContain("Wit room");

        const mapped = textOf(
          composeDungeonMessage(
            {
              ...base,
              progress: runIn(fightRoom(weak("e")), {
                phase: "doors",
                doors,
                buffs: [MAP],
              }),
            },
            { scene: null, hand: null },
          ),
        );
        expect(mapped).toContain("Door 1:");
        expect(mapped).toContain("Card Lurker");
      });

      it("offers a wake button for each resting card while coffee lasts", () => {
        const text = textOf(
          composeDungeonMessage(
            {
              ...base,
              progress: runIn(fightRoom(weak("e")), {
                coffee: 1,
                readyAt: { h1: 9 },
              }),
            },
            { scene: null, hand: null },
          ),
        );
        expect(text).toContain("v2_dungeon:run1:0:w1");
        expect(text).not.toContain(":w0");
        expect(text).toContain("1 coffee");
      });
    });
  });
});
