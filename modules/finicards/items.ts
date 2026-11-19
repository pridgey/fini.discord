/**
 * Dungeon items: what they are. Plain data and pure helpers - storing them is
 * `itemStore.ts`, dropping them is the dungeon's job.
 *
 * Three kinds (issue #8):
 *   - **Collection pieces** - a completed set summons a held-back card of the
 *     Summoned rarity. Pieces stay after a claim as keepsakes to sell.
 *   - **Pack boons** - activated, then spent by the player's next pack.
 *   - **Dungeon boons** - one chosen when entering a run.
 *
 * Every item has a tier, 1 to 3. Drops are gated by depth: tier 1 can turn up
 * from room 15, and the higher tiers grow likelier the deeper a run goes. A
 * set's last pieces are its high tiers, so completing one means going deep or
 * trading with someone who did.
 */

export type ItemTier = 1 | 2 | 3;
export type ItemKind = "piece" | "pack_boon" | "dungeon_boon";

export type ItemDefinition = {
  /** Stored on `v2_item.item`; never renamed once items exist. */
  key: string;
  name: string;
  kind: ItemKind;
  tier: ItemTier;
  emoji: string;
  /** What it does, or for a piece what it's part of. */
  blurb: string;
  /** For a piece: the set it belongs to. */
  set?: CollectionKey;
  /** For a piece: how it's named within its set - "4★", "Right Leg", "Green". */
  short?: string;
};

export type CollectionKey = "dragon_balls" | "exodia" | "chaos_emeralds";

export type CollectionSet = {
  key: CollectionKey;
  name: string;
  /** The Summoned card the set calls, by `v2_card_definition.card_name`. */
  summons: string;
  emoji: string;
  /** "Gather all seven to summon Shenron." */
  line: string;
};

export const COLLECTIONS: Record<CollectionKey, CollectionSet> = {
  dragon_balls: {
    key: "dragon_balls",
    name: "Dragon Balls",
    summons: "Shenron",
    emoji: "🐉",
    line: "Gather all seven to summon Shenron.",
  },
  exodia: {
    key: "exodia",
    name: "Exodia",
    summons: "Exodia",
    emoji: "🃏",
    line: "Assemble all five pieces to call Exodia, the Forbidden One.",
  },
  chaos_emeralds: {
    key: "chaos_emeralds",
    name: "Chaos Emeralds",
    summons: "Super Sonic",
    emoji: "💎",
    line: "Hold all seven to go Super.",
  },
};

const piece = (
  set: CollectionKey,
  key: string,
  name: string,
  short: string,
  tier: ItemTier,
  emoji: string,
): ItemDefinition => ({
  key,
  name,
  short,
  kind: "piece",
  tier,
  emoji,
  set,
  blurb: `One of the ${COLLECTIONS[set].name}. ${COLLECTIONS[set].line}`,
});

/** Low stars turn up first; the four-star onward wait for deeper runs. */
const DRAGON_BALLS = [1, 2, 3, 4, 5, 6, 7].map((stars) =>
  piece(
    "dragon_balls",
    `dragon_ball_${stars}`,
    `${stars}-Star Dragon Ball`,
    `${stars}★`,
    stars <= 3 ? 1 : stars <= 6 ? 2 : 3,
    "🟠",
  ),
);

/** The limbs come up from the deep; the head is the rarest piece of all. */
const EXODIA = [
  ["exodia_right_leg", "Right Leg of the Forbidden One", "Right Leg", 2],
  ["exodia_left_leg", "Left Leg of the Forbidden One", "Left Leg", 2],
  ["exodia_right_arm", "Right Arm of the Forbidden One", "Right Arm", 2],
  ["exodia_left_arm", "Left Arm of the Forbidden One", "Left Arm", 2],
  ["exodia_head", "Exodia the Forbidden One", "Head", 3],
] as const;

const CHAOS_EMERALDS = [
  ["green", "🟢", 1],
  ["blue", "🔵", 1],
  ["yellow", "🟡", 1],
  ["cyan", "🩵", 2],
  ["purple", "🟣", 2],
  ["red", "🔴", 2],
  ["white", "⚪", 3],
] as const;

export const ITEMS: ItemDefinition[] = [
  ...DRAGON_BALLS,
  ...EXODIA.map(([key, name, short, tier]) =>
    piece("exodia", key, name, short, tier, "🃏"),
  ),
  ...CHAOS_EMERALDS.map(([colour, emoji, tier]) => {
    const title = `${colour[0].toUpperCase()}${colour.slice(1)}`;
    return piece(
      "chaos_emeralds",
      `chaos_emerald_${colour}`,
      `${title} Chaos Emerald`,
      title,
      tier,
      emoji,
    );
  }),

  /* Pack boons: one per pack, activated before the pack is opened. */
  {
    key: "boon_uncommon_floor",
    name: "Sure Thing",
    kind: "pack_boon",
    tier: 1,
    emoji: "🎟️",
    blurb: "Your next pack holds at least one uncommon.",
  },
  {
    key: "boon_foil",
    name: "Polishing Cloth",
    kind: "pack_boon",
    tier: 1,
    emoji: "✨",
    blurb: "Every card in your next pack is five times as likely to be foil.",
  },
  {
    key: "boon_extra_card",
    name: "Thick Wrapper",
    kind: "pack_boon",
    tier: 2,
    emoji: "📦",
    blurb: "Your next pack opens with six cards instead of five.",
  },
  {
    key: "boon_lucky",
    name: "Four-Leaf Clover",
    kind: "pack_boon",
    tier: 2,
    emoji: "🍀",
    blurb:
      "Better odds in your next pack: uncommons and full-arts come up more often.",
  },

  /* Dungeon boons: one chosen when entering a run. */
  {
    key: "boon_spare_ward",
    name: "Spare Ward",
    kind: "dungeon_boon",
    tier: 1,
    emoji: "🛡️",
    blurb: "Start your next run with an extra ward charm.",
  },
  {
    key: "boon_purse",
    name: "Heavy Purse",
    kind: "dungeon_boon",
    tier: 1,
    emoji: "👛",
    blurb: "Start your next run with 30 geld.",
  },
  {
    key: "boon_scout_map",
    name: "Scout's Map",
    kind: "dungeon_boon",
    tier: 2,
    emoji: "🗺️",
    blurb: "For the first ten rooms of your next run, doors show who's behind them.",
  },
  {
    key: "boon_lantern",
    name: "Hooded Lantern",
    kind: "dungeon_boon",
    tier: 2,
    emoji: "🏮",
    blurb: "No fog for your whole next run.",
  },
  {
    key: "boon_grindstone",
    name: "Grindstone",
    kind: "dungeon_boon",
    tier: 3,
    emoji: "🪨",
    blurb: "Every card gets +1 to its type stat for your whole next run.",
  },
];

const BY_KEY = new Map(ITEMS.map((item) => [item.key, item]));

/** The item with this key, or undefined for one that no longer exists. */
export const itemByKey = (key: string): ItemDefinition | undefined =>
  BY_KEY.get(key);

/** A set's pieces, in order. */
export const piecesOf = (set: CollectionKey): ItemDefinition[] =>
  ITEMS.filter((item) => item.set === set);

/**
 * How far a player's held pieces go toward a set: which pieces they have (and
 * how many of each), which they're missing, and whether it's complete.
 */
export const setProgress = (
  set: CollectionKey,
  held: string[],
): {
  have: { item: ItemDefinition; count: number }[];
  missing: ItemDefinition[];
  complete: boolean;
} => {
  const pieces = piecesOf(set);
  const have = pieces
    .map((item) => ({
      item,
      count: held.filter((key) => key === item.key).length,
    }))
    .filter((entry) => entry.count > 0);
  const missing = pieces.filter(
    (item) => !held.includes(item.key),
  );
  return { have, missing, complete: missing.length === 0 };
};

/* -------------------------------------------------------------- dropping -- */

/** How likely each kind of item is, when one drops. Weights, not percent. */
export const KIND_WEIGHTS: Record<ItemKind, number> = {
  piece: 50,
  pack_boon: 25,
  dungeon_boon: 25,
};

/**
 * How likely each tier is at `depth`. Weights, not percent. From room 15 only
 * tier 1 turns up; tier 2 comes in after room 20 and tier 3 after room 28,
 * each growing until room 35, where it's 40 / 40 / 20.
 */
export const tierWeights = (depth: number): Record<ItemTier, number> => {
  const grow = (from: number, to: number) =>
    Math.min(1, Math.max(0, (depth - from) / (to - from)));
  const two = 40 * grow(20, 35);
  const three = 20 * grow(28, 35);
  return { 1: 100 - two - three, 2: two, 3: three };
};

const weighted = <T extends string | number>(
  weights: Record<T, number>,
  random: () => number,
): T => {
  const entries = Object.entries(weights) as [T, number][];
  let roll = random() * entries.reduce((sum, [, weight]) => sum + weight, 0);
  for (const [value, weight] of entries) {
    if ((roll -= weight) < 0) return value;
  }
  return entries[0][0];
};

/**
 * Rolls an item for a drop at `depth`: a kind, then a tier, then one of that
 * kind and tier. A piece someone holds or carries (`blocked`) can't drop -
 * there's one of each per server - so a tier with none left looks lower, and
 * with no pieces left at all the drop becomes a boon of the tier it rolled.
 */
export const rollItem = (
  depth: number,
  blocked: ReadonlySet<string>,
  random: () => number,
): string => {
  const kind = weighted(KIND_WEIGHTS, random);
  const rolled = Number(weighted(tierWeights(depth), random)) as ItemTier;
  const open = (of: ItemKind, tier: ItemTier) =>
    ITEMS.filter(
      (item) =>
        item.kind === of &&
        item.tier === tier &&
        !(item.kind === "piece" && blocked.has(item.key)),
    );

  for (let tier = rolled; tier >= 1; tier--) {
    const choices = open(kind, tier as ItemTier);
    if (choices.length) return choices[Math.floor(random() * choices.length)].key;
  }
  // Every piece is spoken for: a boon of the rolled tier instead.
  const boons = [
    ...open("pack_boon", rolled),
    ...open("dungeon_boon", rolled),
  ];
  return boons[Math.floor(random() * boons.length)].key;
};

/** A boon of the same tier as `key`, for a piece that was taken before it could be granted. */
export const standInFor = (key: string, random: () => number): string => {
  const tier = itemByKey(key)?.tier ?? 1;
  const boons = ITEMS.filter(
    (item) => item.kind !== "piece" && item.tier === tier,
  );
  return boons[Math.floor(random() * boons.length)].key;
};
