import type {
  CardRarity,
  CardType,
  V2CardDefinitionRecord,
} from "../../types/PocketbaseTablesV2";
import { recordRound, resolveRound } from "./battleEngine";
import { toBattleCard } from "./cardStore";
import {
  KEYWORDS,
  createSideState,
  rollKeyword,
  type SideState,
} from "./keywords";
import { RULES, TYPE_PRIORITY, type BattleRules } from "./rules";
import type { BattleCard, RoundResult, Side } from "./types";

/**
 * Dungeons: one player, one room at a time, for as long as they can keep going.
 *
 * A run deals a hand from a deck and drops the player into room 1. Only the
 * current room is ever visible. Once it is dealt with, two doors appear with a
 * hint of what is behind each - "a Wit room", "a shop", "an event" - and the
 * player picks one. There is no last room: enemies grow with depth until the
 * hand cannot answer them, and the question is when to walk out.
 *
 *   - **Fights** are one clash on the battle engine. Winning pays geld.
 *   - **Shops** sell buffs for geld. They last for the run and no longer.
 *   - **Events** ask for a card and roll its stat against a target. Passing
 *     pays a boon; failing costs the choice of door, never the run.
 *
 * A card that is played - into a fight or an event - is on cooldown for the
 * next `cooldownRooms` rooms. Every kind of room counts, so a shop or an event
 * is also a breather.
 *
 * There is still no second combat system: a fight is `resolveRound`, with the
 * player as the challenger and the dungeon as the defender. A run has no fixed
 * length, so keywords see it as a string of three-fight matches ("legs") - slot
 * 1, 2, 3, then slot 1 again with fresh keyword state. That keeps every keyword
 * worth what it is worth in a battle: `Momentum` tops out at +2, `Vanguard`
 * fires every third fight, `Last Stand` likewise.
 *
 * Pure: no Pocketbase, no Discord, no clock. Randomness is passed in.
 */

export type DungeonConfig = {
  /** Cards dealt for the run. */
  handSize: number;
  /** Finicoin paid to the Reserve to enter. Never refunded. */
  entryFee: number;
  /** Rooms a played card sits out. 2 = back in the third room after its own. */
  cooldownRooms: number;
  /** Fights per keyword "match". */
  legLength: number;
  /** Finicoin per geld when a run ends. The dial a difficulty setting moves. */
  coinPerGeld: number;
  /** Share of the geld kept by a run that ends in a lost fight. */
  fallenKeep: number;
  /** Every Nth room is a boss, behind both doors. */
  bossEvery: number;
  /** First depth an elite can stand behind a door. */
  eliteFrom: number;
  /**
   * The gentle opening. For the first `rooms` rooms enemies are drawn from
   * commons (the boss from uncommons) and fight `points` stat points down, so a
   * new hand gets a few rooms of geld and a first boss it can beat.
   */
  warmup: { rooms: number; points: number };
  /** Geld for winning a fight: `(base + depth * perDepth) * tier multiplier`. */
  geld: { base: number; perDepth: number; elite: number; boss: number };
  /** Stat points an enemy gets on top of its printed spread. */
  enemyPoints: { perDepth: number; elite: number; boss: number };
  /** What the second door can be, as weights. The first is always a fight. */
  doorOdds: { fight: number; elite: number; shop: number; event: number };
  /** An event passes on `stat + d(die) >= baseTarget + depth / depthPerPoint`. */
  event: { baseTarget: number; depthPerPoint: number; die: number };
  /** Items on a shop's shelf. */
  shopOffers: number;
  /**
   * Door choices that can go by without a shop on offer before one is forced.
   * Keeps a run of bad rolls from leaving geld with nowhere to go.
   */
  shopPity: number;
  /** Ward charms a run starts with. Each one forgives a lost fight. */
  startingWards: number;
  /**
   * Percent chance that the Nth boss beaten drops a full-art rather than an
   * uncommon. The last entry holds for every boss after it. Deliberately not a
   * straight line: uncommons for a long while, then the odds climb fast.
   */
  bossFullArtOdds: number[];
};

/**
 * Tuned with `scripts/finicards_v2_simulate.ts --dungeon --keywords`. The fee
 * goes to the Reserve and the payout comes back out of it; `coinPerGeld` is set
 * so a typical deck played carefully comes out ahead of its fee, and a run that
 * ends in an early fall does not.
 */
export const DUNGEON: DungeonConfig = {
  handSize: 6,
  entryFee: 15,
  cooldownRooms: 2,
  legLength: RULES.rounds,
  coinPerGeld: 0.25,
  fallenKeep: 0.5,
  bossEvery: 5,
  eliteFrom: 6,
  warmup: { rooms: 5, points: 2 },
  geld: { base: 4, perDepth: 1, elite: 1.75, boss: 3 },
  enemyPoints: { perDepth: 0.4, elite: 2, boss: 3 },
  doorOdds: { fight: 30, elite: 15, shop: 25, event: 30 },
  event: { baseTarget: 9, depthPerPoint: 4, die: 6 },
  shopOffers: 3,
  shopPity: 4,
  startingWards: 1,
  bossFullArtOdds: [0, 0, 0, 10, 25, 50, 80, 100],
};

/** The player attacks as the challenger; the dungeon answers as the defender. */
export const PLAYER_SIDE: Side = "challenger";
export const DUNGEON_SIDE: Side = "defender";

type Random = () => number;

/** A move the rules do not allow. The message is written for the player. */
export class DungeonRuleError extends Error {}

const refuse = (message: string): never => {
  throw new DungeonRuleError(message);
};

const pick = <T,>(items: T[], random: Random): T =>
  items[Math.min(items.length - 1, Math.floor(random() * items.length))];

/* -------------------------------------------------------------------------- */
/* Buffs                                                                      */
/* -------------------------------------------------------------------------- */

/** Everything a buff can move. A buff is a partial one of these. */
export type Mods = {
  /** Added to that stat on every card the player plays. */
  power: number;
  wit: number;
  heart: number;
  /** Added to a card's own type stat. */
  type: number;
  /** Taken off every stat of every enemy. */
  enemy: number;
  /** Percent more geld from fights. */
  geld: number;
  /** Added to event rolls. */
  roll: number;
  /** Added to the cooldown, in rooms. Negative is faster. */
  cooldown: number;
};

const NO_MODS: Mods = {
  power: 0,
  wit: 0,
  heart: 0,
  type: 0,
  enemy: 0,
  geld: 0,
  roll: 0,
  cooldown: 0,
};

export type Buff = {
  name: string;
  /** What it does, in a few words. */
  note: string;
  mods: Partial<Mods>;
  /** Rooms left including the current one, or null for the rest of the run. */
  rooms: number | null;
};

/** Something a shop sells or an event pays. Plain data, stored on the room. */
export type Effect =
  | { kind: "buff"; buff: Buff }
  /** Every card on cooldown comes back now. */
  | { kind: "recover" }
  | { kind: "geld"; amount: number }
  /** One lost fight is survived. */
  | { kind: "ward" };

export const modsOf = (state: Pick<DungeonState, "buffs">): Mods => {
  const total = { ...NO_MODS };
  for (const buff of state.buffs) {
    for (const key of Object.keys(buff.mods) as (keyof Mods)[]) {
      total[key] += buff.mods[key] ?? 0;
    }
  }
  return total;
};

/** A hand card as it fights this room: printed stats plus the run's buffs. */
export const buffedCard = (card: BattleCard, mods: Mods): BattleCard => {
  const stats = { ...card.stats };
  for (const type of TYPE_PRIORITY) {
    stats[type] += mods[type] + (type === card.type ? mods.type : 0);
  }
  return { ...card, stats };
};

/** An enemy with the run's hexes applied. A stat never goes below nothing. */
export const weakenedEnemy = (enemy: BattleCard, mods: Mods): BattleCard => {
  if (mods.enemy === 0) return enemy;
  const stats = { ...enemy.stats };
  for (const type of TYPE_PRIORITY) {
    stats[type] = Math.max(0, stats[type] - mods.enemy);
  }
  return { ...enemy, stats };
};

/* -------------------------------------------------------------------------- */
/* Rooms                                                                      */
/* -------------------------------------------------------------------------- */

export type FightTier = "normal" | "elite" | "boss";

export type FightRoom = {
  kind: "fight";
  tier: FightTier;
  enemy: BattleCard;
  /** Geld for winning, before buffs. */
  geld: number;
};

export type ShopOffer = {
  name: string;
  blurb: string;
  price: number;
  effect: Effect;
  sold: boolean;
};

export type ShopRoom = { kind: "shop"; offers: ShopOffer[] };

export type EventRoom = {
  kind: "event";
  title: string;
  text: string;
  /** The stat the played card rolls with. */
  stat: CardType;
  /** `stat + die` has to reach this. */
  target: number;
  reward: Effect;
  passText: string;
  failText: string;
};

export type Room = FightRoom | ShopRoom | EventRoom;

/** What a door, or a room on the path, was - as much as a door's hint says. */
export type RoomTag =
  | { kind: "fight"; tier: FightTier; type: CardType }
  | { kind: "shop" }
  | { kind: "event" };

/** One room the run walked through, for the end-of-run summary. */
export type PathNode = {
  room: RoomTag;
  /** How it went. Absent for a shop, or the room a run walked out of. */
  result?: "won" | "warded" | "fell" | "passed" | "failed";
  /** The door that was not taken to get here. */
  skipped?: RoomTag;
};

/** Running totals for the end-of-run summary. */
export type RunStats = {
  geldEarned: number;
  geldSpent: number;
  eventsPassed: number;
  /** Fights won per hand card, by card name. */
  cardWins: Record<string, number>;
};

/** What the last click did, for the top of the message. */
export type Recap = {
  /** The clash, when the click was a card played into a fight. */
  round?: RoundResult;
  lines: string[];
};

/**
 * Everything a run has to remember between clicks. Plain data, stored as json.
 *
 * `step` goes up on every accepted click and every button carries the step it
 * was drawn for, so a double-click or a button on an old message is refused
 * rather than played twice.
 */
export type DungeonState = {
  version: 2;
  /** 1-based number of the current room. */
  depth: number;
  step: number;
  /** "room": the current room is still to be dealt with. "doors": pick the next. */
  phase: "room" | "doors";
  room: Room;
  /** The rooms behind the doors on offer. Fixed when the doors appear. */
  doors: Room[];
  geld: number;
  /** Card id → the depth at which it can be played again. */
  readyAt: Record<string, number>;
  buffs: Buff[];
  wards: number;
  fightsWon: number;
  bossesWon: number;
  /** Door choices since a shop was last on offer. */
  sinceShop: number;
  /** Every room entered, in order. */
  path: PathNode[];
  stats: RunStats;
  /**
   * Cards won from bosses, as the rarity each will be drawn at. They are
   * banked: granted when the run ends, however it ends.
   */
  loot: CardRarity[];
  /** The current three-fight keyword match. */
  leg: { rounds: RoundResult[]; states: Record<Side, SideState> };
  recap: Recap | null;
};

/** The enemy pool and the dice, handed to anything that builds rooms. */
export type RoomSource = { pool: BattleCard[]; random?: Random };

/** A pool card nobody owns, flattened for the engine. The base of an enemy. */
export const enemyCard = (definition: V2CardDefinitionRecord): BattleCard =>
  toBattleCard({
    id: `enemy-${definition.id ?? ""}`,
    user_id: "",
    server_id: "",
    identifier: "",
    card: definition.id ?? "",
    foil: false,
    acquired_from: "dungeon",
    definition,
  });

/* ---------------------------------------------------------------- enemies -- */

/**
 * How an enemy spends the points depth gives it. Enemies are not bound by the
 * stat budget or the spike ceilings - they only have to be interesting.
 */
type Affix = {
  name: string;
  spend: (stats: Record<CardType, number>, type: CardType, points: number) => void;
};

const others = (type: CardType): CardType[] =>
  TYPE_PRIORITY.filter((other) => other !== type);

const AFFIXES: Affix[] = [
  {
    // Hits like a truck, folds to its counter.
    name: "Hulking",
    spend: (stats, type, points) => {
      stats[type] += points;
    },
  },
  {
    // Nothing gets through; outlast it on the type wheel.
    name: "Warded",
    spend: (stats, type, points) => {
      const [first, second] = others(type);
      stats[first] += Math.ceil(points / 2);
      stats[second] += Math.floor(points / 2);
    },
  },
  {
    name: "Ancient",
    spend: (stats, type, points) => {
      const each = Math.floor(points / 3);
      for (const stat of TYPE_PRIORITY) stats[stat] += each;
      stats[type] += points - each * 3;
    },
  },
  {
    // Half its points for a stat, the other half traded for a new trick.
    name: "Cunning",
    spend: (stats, type, points) => {
      stats[type] += Math.ceil(points / 2);
    },
  },
];

const RARITY_LADDER: CardRarity[] = ["common", "uncommon", "full_art"];

/** Deeper rooms draw their enemies from better cards. Weights, not percent. */
const tierWeights = (depth: number): Record<CardRarity, number> => ({
  common: Math.max(10, 70 - depth * 6),
  uncommon: 30,
  full_art: Math.max(0, (depth - 3) * 5),
});

const rollTier = (depth: number, random: Random): CardRarity => {
  const weights = tierWeights(depth);
  let roll = random() * (weights.common + weights.uncommon + weights.full_art);
  for (const rarity of RARITY_LADDER) {
    roll -= weights[rarity];
    if (roll < 0) return rarity;
  }
  return "common";
};

/** The tiers to try, nearest first. A thin pool gets easier before harder. */
const tiersFor = (rarity: CardRarity): CardRarity[] => {
  const index = RARITY_LADDER.indexOf(rarity);
  return [
    rarity,
    ...RARITY_LADDER.slice(0, index).reverse(),
    ...RARITY_LADDER.slice(index + 1),
  ];
};

export const fightGeld = (
  depth: number,
  tier: FightTier,
  config: DungeonConfig = DUNGEON,
): number => {
  const multiplier =
    tier === "boss" ? config.geld.boss : tier === "elite" ? config.geld.elite : 1;
  return Math.round(
    (config.geld.base + depth * config.geld.perDepth) * multiplier,
  );
};

/**
 * The points an enemy at `depth` has on top of its printed spread. Negative
 * in the warm-up rooms, where enemies fight below it.
 */
export const enemyPoints = (
  depth: number,
  tier: FightTier,
  config: DungeonConfig = DUNGEON,
): number =>
  Math.floor((depth - 1) * config.enemyPoints.perDepth) +
  (tier === "boss"
    ? config.enemyPoints.boss
    : tier === "elite"
      ? config.enemyPoints.elite
      : 0) -
  (depth <= config.warmup.rooms ? config.warmup.points : 0);

/**
 * Builds the fight for a room at `depth`, avoiding the types in `avoid` when
 * the pool allows - which is what makes two fight doors a real choice.
 */
export const generateFight = (
  depth: number,
  tier: FightTier,
  { pool, random = Math.random }: RoomSource,
  avoid: CardType[] = [],
  config: DungeonConfig = DUNGEON,
): FightRoom => {
  const typed = pool.filter((card) => !avoid.includes(card.type));
  const candidates = typed.length > 0 ? typed : pool;
  const warmup = depth <= config.warmup.rooms;
  const wanted: CardRarity =
    tier === "boss"
      ? warmup
        ? "uncommon"
        : "full_art"
      : warmup
        ? "common"
        : rollTier(depth, random);
  const ranked = tiersFor(wanted)
    .map((rarity) => candidates.filter((card) => card.rarity === rarity))
    .find((matches) => matches.length > 0)!;
  const base = pick(ranked, random);

  const points = enemyPoints(depth, tier, config);
  const stats = { ...base.stats };
  let name = base.name;
  // An enemy is built on a pool card, and a card has no keyword of its own -
  // copies do. So the enemy rolls one the way a pulled copy would.
  let keyword = rollKeyword(base.rarity, random(), random());

  if (points > 0) {
    const affix = pick(AFFIXES, random);
    affix.spend(stats, base.type, points);
    name = `${affix.name} ${base.name}`;
    if (affix.name === "Cunning") keyword = pick(KEYWORDS, random).slug;
  } else if (points < 0) {
    // Warm-up enemies swing softer than their card says.
    stats[base.type] = Math.max(1, stats[base.type] + points);
    name = `Drowsy ${base.name}`;
  }

  // Anything worth a title fights with a trick, even if its card has none.
  if (tier !== "normal" && !keyword) keyword = pick(KEYWORDS, random).slug;

  return {
    kind: "fight",
    tier,
    geld: fightGeld(depth, tier, config),
    enemy: {
      ...base,
      instanceId: `enemy-${depth}-${Math.floor(random() * 1e9).toString(36)}`,
      name,
      stats,
      keyword,
    },
  };
};

/* ------------------------------------------------------------------ shops -- */

type Ware = Omit<ShopOffer, "sold"> & {
  /** Sold once per run: a second copy would do nothing, or too much. */
  unique?: boolean;
};

const statWare = (name: string, stat: CardType, label: string): Ware => ({
  name,
  blurb: `+1 ${label} on all your cards, for the run`,
  price: 12,
  effect: {
    kind: "buff",
    buff: { name, note: `+1 ${label}`, mods: { [stat]: 1 }, rooms: null },
  },
});

/* A temporary buff bought in a room is ticked once on the way out of it, so
   "the next 3 rooms" is stored as 4. */
const WARES: Ware[] = [
  statWare("Whetstone", "power", "Power"),
  statWare("Puzzle Box", "wit", "Wit"),
  statWare("Locket", "heart", "Heart"),
  {
    name: "War Paint",
    blurb: "+2 to each card's type stat for the next 3 rooms",
    price: 8,
    effect: {
      kind: "buff",
      buff: { name: "War Paint", note: "+2 type stat", mods: { type: 2 }, rooms: 4 },
    },
  },
  {
    name: "Smelling Salts",
    blurb: "Every card on cooldown is ready now",
    price: 8,
    effect: { kind: "recover" },
  },
  {
    name: "Quick Hands",
    blurb: "Cards cool down one room faster, for the run",
    price: 20,
    unique: true,
    effect: {
      kind: "buff",
      buff: {
        name: "Quick Hands",
        note: "cooldowns 1 room shorter",
        mods: { cooldown: -1 },
        rooms: null,
      },
    },
  },
  {
    name: "Lucky Coin",
    blurb: "+1 to every event roll, for the run",
    price: 8,
    effect: {
      kind: "buff",
      buff: { name: "Lucky Coin", note: "+1 event rolls", mods: { roll: 1 }, rooms: null },
    },
  },
  {
    name: "Deep Pockets",
    blurb: "+25% geld from fights, for the run",
    price: 12,
    effect: {
      kind: "buff",
      buff: { name: "Deep Pockets", note: "+25% geld", mods: { geld: 25 }, rooms: null },
    },
  },
  {
    name: "Ward Charm",
    blurb: "Survive one lost fight - the charm breaks instead of the run",
    price: 18,
    effect: { kind: "ward" },
  },
  {
    name: "Hex Doll",
    blurb: "Enemies have −1 to every stat for the next 3 rooms",
    price: 10,
    effect: {
      kind: "buff",
      buff: { name: "Hex Doll", note: "enemies −1 all stats", mods: { enemy: 1 }, rooms: 4 },
    },
  },
];

export const generateShop = (
  owned: Buff[],
  random: Random = Math.random,
  config: DungeonConfig = DUNGEON,
): ShopRoom => {
  const shelf = WARES.filter(
    (ware) => !ware.unique || !owned.some((buff) => buff.name === ware.name),
  );
  const offers: ShopOffer[] = [];

  while (offers.length < config.shopOffers && shelf.length > 0) {
    const index = Math.min(shelf.length - 1, Math.floor(random() * shelf.length));
    const [{ unique: _unique, ...ware }] = shelf.splice(index, 1);
    offers.push({ ...ware, sold: false });
  }

  return { kind: "shop", offers };
};

/* ----------------------------------------------------------------- events -- */

type Encounter = Pick<
  EventRoom,
  "title" | "text" | "stat" | "passText" | "failText"
> & { reward: (depth: number) => Effect };

const tempBuff = (name: string, note: string, mods: Partial<Mods>): Effect => ({
  kind: "buff",
  buff: { name, note, mods, rooms: 4 },
});

const ENCOUNTERS: Encounter[] = [
  {
    title: "The Jammed Portcullis",
    text: "A rusted gate blocks a side passage. Something glints behind it.",
    stat: "power",
    reward: (depth) => ({ kind: "geld", amount: 6 + depth }),
    passText: "The gate shrieks upward. A forgotten purse is yours.",
    failText: "It does not move, and the noise has closed off the other way round.",
  },
  {
    title: "The Arm-Wrestling Ogre",
    text: "An ogre slaps an elbow onto a barrel and grins at you.",
    stat: "power",
    reward: () => tempBuff("Fired Up", "+2 type stat", { type: 2 }),
    passText: "The barrel splinters under the ogre's knuckles. Your hand is buzzing.",
    failText: "The ogre wins, laughs, and bars one of the doors behind you.",
  },
  {
    title: "The Riddling Door",
    text: "A brass face on the door clears its throat and asks you a riddle.",
    stat: "wit",
    reward: () => ({ kind: "recover" }),
    passText: "It opens onto a quiet alcove. Your cards catch their breath.",
    failText: "Wrong. The face sulks, and a lock clicks somewhere ahead.",
  },
  {
    title: "The Sleeping Guard",
    text: "A guard snores at a desk, patrol notes spread out under one hand.",
    stat: "wit",
    reward: () => tempBuff("Stolen Notes", "enemies −1 all stats", { enemy: 1 }),
    passText: "You read every page. You know exactly what is waiting ahead.",
    failText: "The guard stirs. You bolt down the only corridor left.",
  },
  {
    title: "The Gambler's Table",
    text: "Three cups, one pea, and a goblin who is very sure of himself.",
    stat: "wit",
    reward: (depth) => ({ kind: "geld", amount: 8 + depth }),
    passText: "Left cup. The goblin pays up without a word.",
    failText: "It was never under any of them. He points you at the exit he prefers.",
  },
  {
    title: "The Weeping Statue",
    text: "A stone figure cries quietly in an alcove, one hand held out.",
    stat: "heart",
    reward: () => ({ kind: "ward" }),
    passText: "It stops crying and presses a charm into your palm.",
    failText: "It turns its face to the wall, and a door grinds shut with it.",
  },
  {
    title: "A Lost Spirit",
    text: "A pale shape drifts in circles, asking the way out.",
    stat: "heart",
    reward: () => ({ kind: "recover" }),
    passText: "You walk it to the stairs. It leaves a warmth that wakes your cards.",
    failText: "It does not trust you, and its wailing collapses a passage.",
  },
  {
    title: "The Campfire Stranger",
    text: "Someone is cooking over a small fire and has made far too much.",
    stat: "heart",
    reward: () =>
      tempBuff("Warm Meal", "+1 all stats", { power: 1, wit: 1, heart: 1 }),
    passText: "You share the meal and a story. Everyone feels better for it.",
    failText: "You say the wrong thing. The stranger kicks out the fire and blocks a door.",
  },
];

export const eventTarget = (
  depth: number,
  config: DungeonConfig = DUNGEON,
): number =>
  config.event.baseTarget + Math.floor(depth / config.event.depthPerPoint);

export const generateEvent = (
  depth: number,
  random: Random = Math.random,
  config: DungeonConfig = DUNGEON,
): EventRoom => {
  const { reward, ...encounter } = pick(ENCOUNTERS, random);
  return {
    kind: "event",
    ...encounter,
    target: eventTarget(depth, config),
    reward: reward(depth),
  };
};

/** The chance, 0-1, that `card` passes `room` with the run's buffs applied. */
export const eventChance = (
  room: EventRoom,
  card: BattleCard,
  mods: Mods,
  config: DungeonConfig = DUNGEON,
): number => {
  const needed = room.target - buffedCard(card, mods).stats[room.stat] - mods.roll;
  const passing = config.event.die - needed + 1;
  return Math.min(1, Math.max(0, passing / config.event.die));
};

/* ------------------------------------------------------------------ doors -- */

/**
 * Builds the rooms behind the doors out of a room at `depth`.
 *
 * One door is always a fight, and after a shop or an event both are: a run
 * cannot be walked through on side rooms. `restricted` - the price of a failed
 * event - leaves a single fight door and no choice.
 */
export const generateDoors = (
  state: Pick<DungeonState, "depth" | "room" | "buffs"> & { sinceShop?: number },
  source: RoomSource,
  restricted = false,
  config: DungeonConfig = DUNGEON,
): Room[] => {
  const random = source.random ?? Math.random;
  const depth = state.depth + 1;
  const fight = (tier: FightTier, avoid: CardType[] = []) =>
    generateFight(depth, tier, source, avoid, config);

  if (depth % config.bossEvery === 0) {
    const first = fight("boss");
    return restricted ? [first] : [first, fight("boss", [first.enemy.type])];
  }

  const first = fight("normal");
  if (restricted) return [first];

  const odds = { ...config.doorOdds };
  if (depth < config.eliteFrom) odds.elite = 0;
  if (state.room.kind !== "fight") {
    odds.shop = 0;
    odds.event = 0;
  }

  // Overdue for a shop, and this is a choice that is allowed to hold one.
  const owed = odds.shop > 0 && (state.sinceShop ?? 0) >= config.shopPity;

  let roll = random() * (odds.fight + odds.elite + odds.shop + odds.event);
  const second: Room =
    owed || (roll -= odds.shop) < 0
      ? generateShop(state.buffs, random, config)
      : (roll -= odds.event) < 0
        ? generateEvent(depth, random, config)
        : (roll -= odds.elite) < 0
          ? fight("elite", [first.enemy.type])
          : fight("normal", [first.enemy.type]);

  // Shuffled, so the plain fight is not always the left-hand door.
  return random() < 0.5 ? [first, second] : [second, first];
};

/* -------------------------------------------------------------------------- */
/* The run                                                                    */
/* -------------------------------------------------------------------------- */

const freshLeg = (): DungeonState["leg"] => ({
  rounds: [],
  states: { challenger: createSideState(), defender: createSideState() },
});

export const tagOf = (room: Room): RoomTag =>
  room.kind === "fight"
    ? { kind: "fight", tier: room.tier, type: room.enemy.type }
    : { kind: room.kind };

/** Records how the current room went on the run's path. */
const mark = (state: DungeonState, result: PathNode["result"]): void => {
  const node = state.path.at(-1);
  if (node) node.result = result;
};

/** Room 1 is always a plain fight. Null only when the pool is empty. */
export const createRun = (
  source: RoomSource,
  config: DungeonConfig = DUNGEON,
): DungeonState | null => {
  if (source.pool.length === 0) return null;
  const room = generateFight(1, "normal", source, [], config);

  return {
    version: 2,
    depth: 1,
    step: 0,
    phase: "room",
    room,
    doors: [],
    geld: 0,
    readyAt: {},
    buffs: [],
    wards: config.startingWards,
    fightsWon: 0,
    bossesWon: 0,
    sinceShop: 0,
    path: [{ room: tagOf(room) }],
    stats: { geldEarned: 0, geldSpent: 0, eventsPassed: 0, cardWins: {} },
    loot: [],
    leg: freshLeg(),
    recap: null,
  };
};

/** The chance, 0-100, that boss number `boss` (1-based) drops a full-art. */
export const bossFullArtChance = (
  boss: number,
  config: DungeonConfig = DUNGEON,
): number => {
  const odds = config.bossFullArtOdds;
  return odds[Math.min(odds.length, Math.max(1, boss)) - 1] ?? 0;
};

/** Rooms until `cardId` can be played again. 0 is ready. */
export const cooldownLeft = (state: DungeonState, cardId: string): number =>
  Math.max(0, (state.readyAt[cardId] ?? 0) - state.depth);

/** The slot the next fight is, in its three-fight keyword match. 1-based. */
export const nextSlot = (
  state: DungeonState,
  config: DungeonConfig = DUNGEON,
): number => (state.leg.rounds.length % config.legLength) + 1;

const applyEffect = (state: DungeonState, effect: Effect): void => {
  switch (effect.kind) {
    case "buff":
      state.buffs.push(structuredClone(effect.buff));
      return;
    case "recover":
      state.readyAt = {};
      return;
    case "geld":
      state.geld += effect.amount;
      return;
    case "ward":
      state.wards += 1;
      return;
  }
};

/** What an effect is, said in a few words. */
export const describeEffect = (effect: Effect): string => {
  switch (effect.kind) {
    case "buff":
      return `${effect.buff.name} (${effect.buff.note}${
        effect.buff.rooms === null ? "" : `, next ${effect.buff.rooms - 1} rooms`
      })`;
    case "recover":
      return "every card on cooldown is ready";
    case "geld":
      return `${effect.amount} geld`;
    case "ward":
      return "a ward charm";
  }
};

const startCooldown = (
  state: DungeonState,
  cardId: string,
  config: DungeonConfig,
): void => {
  const rooms = Math.max(0, config.cooldownRooms + modsOf(state).cooldown);
  if (rooms > 0) state.readyAt[cardId] = state.depth + rooms + 1;
};

const openDoors = (
  state: DungeonState,
  source: RoomSource,
  restricted: boolean,
  config: DungeonConfig,
): void => {
  state.doors = generateDoors(state, source, restricted, config);
  state.sinceShop = state.doors.some((door) => door.kind === "shop")
    ? 0
    : state.sinceShop + 1;
  state.phase = "doors";
};

/** Copies the state for a move, and checks the move is legal right now. */
const begin = <K extends Room["kind"]>(
  state: DungeonState,
  kind: K,
): DungeonState & { room: Extract<Room, { kind: K }> } => {
  if (state.phase !== "room" || state.room.kind !== kind) {
    refuse("That isn't something you can do in this room.");
  }
  const next = structuredClone(state);
  next.step += 1;
  return next as DungeonState & { room: Extract<Room, { kind: K }> };
};

const assertReady = (state: DungeonState, card: BattleCard): void => {
  if (cooldownLeft(state, card.instanceId) > 0) {
    refuse(`${card.name} is still on cooldown.`);
  }
};

export type FightResult =
  /** The room is cleared and the doors are open. */
  | "won"
  /** A draw: the enemy still stands and another card has to be played. */
  | "stalemate"
  /** Lost, but a ward charm broke instead of the run. */
  | "warded"
  /** Lost. The run is over. */
  | "fell";

export type FightOutcome = {
  state: DungeonState;
  round: RoundResult;
  result: FightResult;
};

/**
 * Plays `card` into the current fight.
 *
 * Never mutates the state it is given, so a failed write cannot leave a run
 * half-advanced. For keywords that read a lineup, the player's is the cards
 * played so far this leg plus this one.
 */
export const playFight = (
  state: DungeonState,
  card: BattleCard,
  source: RoomSource,
  rules: BattleRules = RULES,
  config: DungeonConfig = DUNGEON,
): FightOutcome => {
  assertReady(state, card);
  const next = begin(state, "fight");
  const mods = modsOf(next);

  if (next.leg.rounds.length >= config.legLength) next.leg = freshLeg();
  const { rounds, states } = next.leg;

  const player = buffedCard(card, mods);
  const enemy = weakenedEnemy(next.room.enemy, mods);

  const round = resolveRound({
    slot: rounds.length + 1,
    lineupLength: config.legLength,
    challengerCard: player,
    defenderCard: enemy,
    challengerState: states.challenger,
    defenderState: states.defender,
    rules,
    challengerLineup: [...rounds.map((played) => played.challenger.card), player],
    defenderLineup: [...rounds.map((played) => played.defender.card), enemy],
    history: rounds,
  });

  recordRound(round, states.challenger, states.defender);
  rounds.push(round);
  startCooldown(next, card.instanceId, config);

  let result: FightResult;
  const lines: string[] = [];

  if (round.winner === PLAYER_SIDE) {
    result = "won";
    const geld = Math.floor(next.room.geld * (1 + mods.geld / 100));
    next.geld += geld;
    next.stats.geldEarned += geld;
    next.stats.cardWins[card.name] = (next.stats.cardWins[card.name] ?? 0) + 1;
    next.fightsWon += 1;
    mark(next, "won");
    lines.push(`**${next.room.enemy.name}** falls. **+${geld} geld**.`);

    if (next.room.tier === "boss") {
      next.bossesWon += 1;
      const random = source.random ?? Math.random;
      const rarity: CardRarity =
        random() * 100 < bossFullArtChance(next.bossesWon, config)
          ? "full_art"
          : "uncommon";
      next.loot.push(rarity);
      lines.push(
        `🎴 The boss drops ${rarity === "full_art" ? "a **full-art** card" : "an **uncommon** card"}. It's banked - yours when the run ends, however it ends.`,
      );
    }
    openDoors(next, source, false, config);
  } else if (round.winner === "draw") {
    result = "stalemate";
    lines.push(
      `A stalemate - **${next.room.enemy.name}** is still standing. Play another card.`,
    );
  } else if (next.wards > 0) {
    result = "warded";
    next.wards -= 1;
    mark(next, "warded");
    lines.push(
      `**${next.room.enemy.name}** wins, but your ward charm shatters and you slip past. No geld.`,
    );
    openDoors(next, source, false, config);
  } else {
    result = "fell";
    mark(next, "fell");
    lines.push(`**${next.room.enemy.name}** wins. The run ends here.`);
  }

  next.recap = { round, lines };
  return { state: next, round, result };
};

export type EventOutcome = {
  state: DungeonState;
  passed: boolean;
  die: number;
  total: number;
};

/** Plays `card` at the current event: its stat plus a die against the target. */
export const playEvent = (
  state: DungeonState,
  card: BattleCard,
  source: RoomSource,
  config: DungeonConfig = DUNGEON,
): EventOutcome => {
  assertReady(state, card);
  const next = begin(state, "event");
  const mods = modsOf(next);
  const random = source.random ?? Math.random;
  const room = next.room;

  const stat = buffedCard(card, mods).stats[room.stat];
  const die = 1 + Math.min(config.event.die - 1, Math.floor(random() * config.event.die));
  const total = stat + mods.roll + die;
  const passed = total >= room.target;

  startCooldown(next, card.instanceId, config);
  if (passed) {
    applyEffect(next, room.reward);
    next.stats.eventsPassed += 1;
    if (room.reward.kind === "geld") next.stats.geldEarned += room.reward.amount;
  }
  mark(next, passed ? "passed" : "failed");

  const working = `${stat}${mods.roll ? ` + ${mods.roll}` : ""} + 🎲 ${die} = **${total}** vs ${room.target}`;
  next.recap = {
    lines: [
      `**${room.title}** — ${card.name} rolls ${working}: ${passed ? "passed" : "failed"}.`,
      passed
        ? `${room.passText} You gain ${describeEffect(room.reward)}.`
        : `${room.failText} Only one door is left open.`,
    ],
  };

  openDoors(next, source, !passed, config);
  return { state: next, passed, die, total };
};

/** Walks past an event with no card to spare. Counts as failing it. */
export const skipEvent = (
  state: DungeonState,
  source: RoomSource,
  config: DungeonConfig = DUNGEON,
): DungeonState => {
  const next = begin(state, "event");
  mark(next, "failed");
  next.recap = {
    lines: [
      `**${next.room.title}** — you leave it alone. ${next.room.failText} Only one door is left open.`,
    ],
  };
  openDoors(next, source, true, config);
  return next;
};

export const buyOffer = (state: DungeonState, index: number): DungeonState => {
  const next = begin(state, "shop");
  const offer = next.room.offers[index];

  if (!offer || offer.sold) refuse("That's already gone from the shelf.");
  if (next.geld < offer.price) {
    refuse(`${offer.name} costs ${offer.price} geld and you have ${next.geld}.`);
  }

  next.geld -= offer.price;
  next.stats.geldSpent += offer.price;
  offer.sold = true;
  applyEffect(next, offer.effect);
  next.recap = {
    lines: [`Bought **${offer.name}** for ${offer.price} geld — ${offer.blurb}.`],
  };
  return next;
};

export const leaveShop = (
  state: DungeonState,
  source: RoomSource,
  config: DungeonConfig = DUNGEON,
): DungeonState => {
  const next = begin(state, "shop");
  next.recap = null;
  openDoors(next, source, false, config);
  return next;
};

/** Steps through a door into the next room, one room older. */
export const chooseDoor = (state: DungeonState, index: number): DungeonState => {
  if (state.phase !== "doors") refuse("There are no doors to pick yet.");
  const room = state.doors[index];
  if (!room) refuse("That door isn't there.");

  const next = structuredClone(state);
  next.step += 1;
  next.depth += 1;
  next.room = room;
  next.path.push({
    room: tagOf(room),
    ...(state.doors.length > 1
      ? { skipped: tagOf(state.doors[index === 0 ? 1 : 0]) }
      : {}),
  });
  next.doors = [];
  next.phase = "room";
  next.recap = null;
  next.buffs = next.buffs.flatMap((buff) =>
    buff.rooms === null
      ? [buff]
      : buff.rooms > 1
        ? [{ ...buff, rooms: buff.rooms - 1 }]
        : [],
  );
  return next;
};

/* -------------------------------------------------------------------------- */
/* Doors, as the player sees them                                             */
/* -------------------------------------------------------------------------- */

const TYPE_LABEL: Record<CardType, string> = {
  power: "Power",
  wit: "Wit",
  heart: "Heart",
};

/** What a door gives away about the room behind it - the kind, never the detail. */
export const doorHint = (room: Room): string => {
  if (room.kind === "shop") return "Shop";
  if (room.kind === "event") return "Event";
  const type = `${TYPE_LABEL[room.enemy.type]} room`;
  return room.tier === "boss"
    ? `Boss · ${type}`
    : room.tier === "elite"
      ? `Elite ${type}`
      : type;
};

/* -------------------------------------------------------------------------- */
/* Payout                                                                     */
/* -------------------------------------------------------------------------- */

export type DungeonPayout = {
  /** Geld the run was holding when it ended. */
  geld: number;
  /** Geld that counted - less than `geld` after a fall. */
  kept: number;
  /** Finicoin paid. */
  coin: number;
};

export const coinFor = (geld: number, config: DungeonConfig = DUNGEON): number =>
  Math.floor(Math.max(0, geld) * config.coinPerGeld);

/** Walking out keeps everything; falling in a fight keeps `fallenKeep` of it. */
export const payoutFor = (
  geld: number,
  fell: boolean,
  config: DungeonConfig = DUNGEON,
): DungeonPayout => {
  const kept = fell ? Math.floor(geld * config.fallenKeep) : geld;
  return { geld, kept, coin: coinFor(kept, config) };
};

/** What a finished run paid. Stored on the run, so it is only ever paid once. */
export type DungeonReward = (
  | ({ kind: "coin" } & DungeonPayout & { amount: number })
  | { kind: "none" }
) & {
  /** Boss drops, already in the player's collection. */
  cards?: BattleCard[];
};
