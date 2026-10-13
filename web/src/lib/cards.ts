import type { Card, CardType, Meta } from "./types";

/** Everything about a card that is worked out rather than stored. Pure. */

export const TYPE_LABEL: Record<CardType, string> = { power: "Power", wit: "Wit", heart: "Heart" };
export const STAT_SHORT: Record<CardType, string> = { power: "PWR", wit: "WIT", heart: "HRT" };

/** The battle board's glyphs, in a 10x10 box. */
export const TYPE_ICON: Record<CardType, string> = {
  power:
    "M1 9 L1 7.2 C1 4.2 4.8 3 6.3 5.2 L6.3 4.3 C5 4.1 4.6 2.4 5.6 1.6 C6.6 0.8 8.7 0.9 9 2.6 L8.9 7.8 C8.8 8.6 8.2 9 7.4 9 Z M2.9 6.7 C3.5 5.8 4.6 5.6 5.4 6.1",
  wit: "M5 2 C3.6 1 1.8 1.9 2 3.6 C0.8 4.2 0.8 6.2 2.2 6.6 C2.2 8.2 4 8.9 5 8 C6 8.9 7.8 8.2 7.8 6.6 C9.2 6.2 9.2 4.2 8 3.6 C8.2 1.9 6.4 1 5 2 Z M5 2 V8 M3.2 4.4 C4 4.6 4 5.4 3.4 5.8 M6.8 4.4 C6 4.6 6 5.4 6.6 5.8",
  heart: "M5 8.8 L1.7 5.4 A2.1 2.1 0 0 1 5 2.8 A2.1 2.1 0 0 1 8.3 5.4 Z",
};

/** How a card is ranked among the rest: the tiers a player thinks in. */
export type Tier = "common" | "uncommon" | "full_art" | "secret_art" | "legendary";

export const TIERS: Tier[] = ["common", "uncommon", "full_art", "secret_art", "legendary"];

export const TIER_LABEL: Record<Tier, string> = {
  common: "Common",
  uncommon: "Uncommon",
  full_art: "Full Art",
  secret_art: "Secret Art",
  legendary: "Legendary",
};

export const tierOf = (card: Card): Tier =>
  card.legendary ? "legendary" : card.def.secret_art ? "secret_art" : card.def.rarity;

export const legendaryTier = (card: Card, meta: Meta): number =>
  card.legendary ? (meta.legendary[card.legendary]?.tier ?? 1) : 0;

/** The code printed on the card: C, U, FA, SA, L1 to L4 - with F for a foil. */
export const rarityCode = (card: Card, meta: Meta): string => {
  const tier = tierOf(card);
  if (tier === "legendary") return `L${legendaryTier(card, meta)}`;
  if (tier === "secret_art") return "SA";
  if (tier === "full_art") return "FA";
  const letter = tier === "uncommon" ? "U" : "C";
  return card.foil ? `F${letter}` : letter;
};

/** The stat a card fights with. */
export const leadStat = (card: Card): number => card.def[card.def.card_type];

/** "S3 12/240", or "" for a card with no set. */
export const setLabel = (card: Card): string => {
  const { set, number, set_size } = card.def;
  if (!set) return "";
  return number && set_size ? `S${set} ${number}/${set_size}` : `S${set}`;
};

/** "2 of 3" for a copy of a card limited to a handful per server. */
export const limitedLabel = (card: Card): string => {
  const population = card.legendary ? 1 : card.def.population;
  if (!population || population >= 5) return "";
  return `${Math.min(Math.max(card.serial, 1), population)} of ${population}`;
};

export const keywordOf = (card: Card, meta: Meta) =>
  card.keyword
    ? (meta.keywords[card.keyword] ?? {
        name: card.keyword.replace(/_/g, " "),
        grade: "",
        description: "",
      })
    : null;

export type Composition = Record<CardType, number>;

export const compositionOf = (cards: Card[]): Composition => {
  const mix: Composition = { power: 0, wit: 0, heart: 0 };
  for (const card of cards) mix[card.def.card_type] += 1;
  return mix;
};

/* ------------------------------------------------------------- filtering --- */

export type SortKey = "newest" | "name" | "set" | "strongest" | "rarity" | "power" | "wit" | "heart";

export const SORT_LABEL: Record<SortKey, string> = {
  newest: "Newest",
  name: "Name",
  set: "Set number",
  strongest: "Strongest",
  rarity: "Rarest",
  power: "Power",
  wit: "Wit",
  heart: "Heart",
};

export type Filters = {
  search: string;
  types: CardType[];
  tiers: Tier[];
  /** 0 for every set. */
  set: number;
  foil: boolean;
  keyword: boolean;
  sort: SortKey;
};

export const NO_FILTERS: Filters = {
  search: "",
  types: [],
  tiers: [],
  set: 0,
  foil: false,
  keyword: false,
  sort: "newest",
};

export const filtersActive = (filters: Filters): boolean =>
  !!filters.search.trim() ||
  filters.types.length > 0 ||
  filters.tiers.length > 0 ||
  filters.set !== 0 ||
  filters.foil ||
  filters.keyword;

const matchesSearch = (card: Card, meta: Meta, needle: string): boolean =>
  [
    card.def.card_name,
    card.def.series,
    ...(card.def.tags ?? []),
    keywordOf(card, meta)?.name ?? "",
  ].some((value) => value.toLowerCase().includes(needle));

const byName = (a: Card, b: Card): number =>
  a.def.card_name.localeCompare(b.def.card_name, "en", { sensitivity: "base" });

const SORTERS: Record<SortKey, (a: Card, b: Card, meta: Meta) => number> = {
  newest: (a, b) => b.acquired.localeCompare(a.acquired),
  name: byName,
  set: (a, b) => a.def.set - b.def.set || a.def.number - b.def.number,
  strongest: (a, b) => leadStat(b) - leadStat(a),
  rarity: (a, b, meta) =>
    TIERS.indexOf(tierOf(b)) - TIERS.indexOf(tierOf(a)) ||
    legendaryTier(b, meta) - legendaryTier(a, meta) ||
    Number(b.foil) - Number(a.foil),
  power: (a, b) => b.def.power - a.def.power,
  wit: (a, b) => b.def.wit - a.def.wit,
  heart: (a, b) => b.def.heart - a.def.heart,
};

/** The cards that pass `filters`, in its order. Ties fall back to name. */
export const applyFilters = (cards: Card[], filters: Filters, meta: Meta): Card[] => {
  const needle = filters.search.trim().toLowerCase();
  const sorter = SORTERS[filters.sort];
  return cards
    .filter(
      (card) =>
        (!needle || matchesSearch(card, meta, needle)) &&
        (filters.types.length === 0 || filters.types.includes(card.def.card_type)) &&
        (filters.tiers.length === 0 || filters.tiers.includes(tierOf(card))) &&
        (!filters.set || card.def.set === filters.set) &&
        (!filters.foil || card.foil) &&
        (!filters.keyword || !!card.keyword),
    )
    .sort((a, b) => sorter(a, b, meta) || byName(a, b) || a.id.localeCompare(b.id));
};

/* ------------------------------------------------------------------ sets --- */

export type SetProgress = { set: number; owned: number; size: number; secrets: number };

/**
 * How much of each set a collection covers: distinct cards held against the
 * set's printed size. Secret Arts are counted apart - they are not in the
 * size, and the site does not say how many there are.
 */
export const setProgress = (cards: Card[]): SetProgress[] => {
  const sets = new Map<number, { counted: Set<string>; secrets: Set<string>; size: number }>();
  for (const card of cards) {
    if (!card.def.set) continue;
    const entry = sets.get(card.def.set) ?? { counted: new Set(), secrets: new Set(), size: 0 };
    (card.def.secret_art ? entry.secrets : entry.counted).add(card.def.id);
    entry.size = Math.max(entry.size, card.def.set_size);
    sets.set(card.def.set, entry);
  }
  return [...sets.entries()]
    .sort(([a], [b]) => a - b)
    .map(([set, entry]) => ({
      set,
      owned: entry.counted.size,
      size: entry.size,
      secrets: entry.secrets.size,
    }));
};

/* ---------------------------------------------------------------- layout --- */

/** One place in the collection grid: a card (or a pile of its copies), or a blank. */
export type Tile =
  | { kind: "cards"; key: string; cards: Card[] }
  | { kind: "gap"; key: string; number: number; of: number };

export type Section = {
  /** The set these tiles belong to; 0 for cards with none, null when not split by set. */
  set: number | null;
  /** Distinct cards held of the set and its printed size, for the heading. */
  owned: number;
  size: number;
  tiles: Tile[];
};

export type LayoutOptions = {
  /** Leave a blank for each card of a set not yet held. */
  gaps: boolean;
  /** Stack copies of one card into a single tile. */
  piles: boolean;
};

/** Filters that hide cards, as opposed to choosing a set or an order. */
export const narrowing = (filters: Filters): boolean =>
  !!filters.search.trim() ||
  filters.types.length > 0 ||
  filters.tiers.length > 0 ||
  filters.foil ||
  filters.keyword;

/**
 * Blanks only mean something when the grid is a set in number order with
 * nothing filtered out of it - otherwise a blank would not mean "missing".
 */
export const gapsApply = (filters: Filters): boolean => filters.sort === "set" && !narrowing(filters);

const BEST_FIRST: Filters = { ...NO_FILTERS, sort: "rarity" };

/**
 * Lays a collection out for the grid.
 *
 * In set order it is a binder: a section per set, cards by number, and - with
 * `gaps` - a blank for every number not held. Secret Arts are numbered past a
 * set's end, and only the ones held get a place, so how many there are to find
 * is not given away. In any other order it is one run of cards. With `piles`,
 * copies of one card share a tile, best copy on top, wherever the first of
 * them falls.
 */
export const layoutCollection = (
  cards: Card[],
  filters: Filters,
  meta: Meta,
  options: LayoutOptions,
): Section[] => {
  const sorted = applyFilters(cards, filters, meta);

  const tilesOf = (list: Card[]): Extract<Tile, { kind: "cards" }>[] => {
    if (!options.piles) return list.map((card) => ({ kind: "cards", key: card.id, cards: [card] }));
    const piles = new Map<string, Card[]>();
    for (const card of list) piles.set(card.def.id, [...(piles.get(card.def.id) ?? []), card]);
    return [...piles.entries()].map(([id, copies]) => ({
      kind: "cards",
      key: `pile:${id}`,
      cards: applyFilters(copies, BEST_FIRST, meta),
    }));
  };

  if (filters.sort !== "set") {
    return sorted.length ? [{ set: null, owned: 0, size: 0, tiles: tilesOf(sorted) }] : [];
  }

  const progress = new Map(setProgress(cards).map((entry) => [entry.set, entry]));
  const sets = [...new Set(sorted.map((card) => card.def.set))].sort(
    // Cards with no set go last.
    (a, b) => (a || Infinity) - (b || Infinity),
  );
  const withGaps = options.gaps && gapsApply(filters);

  return sets.map((set) => {
    const { owned = 0, size = 0 } = progress.get(set) ?? {};
    const tiles = tilesOf(sorted.filter((card) => card.def.set === set));
    if (!withGaps || !set || !size) return { set, owned, size, tiles };

    const at = (number: number) => tiles.filter((tile) => tile.cards[0].def.number === number);
    const numbered: Tile[] = Array.from({ length: size }, (_, index) => index + 1).flatMap(
      (number): Tile[] => {
        const held = at(number);
        return held.length ? held : [{ kind: "gap", key: `gap:${set}:${number}`, number, of: size }];
      },
    );
    const rest = tiles.filter((tile) => {
      const number = tile.cards[0].def.number;
      return number > size || number < 1;
    });
    return { set, owned, size, tiles: [...numbered, ...rest] };
  });
};

/* ----------------------------------------------------------------- decks --- */

/** Why a deck cannot be saved as it stands, or null if it can. */
export const deckProblem = (
  name: string,
  size: number,
  limits: Meta["limits"],
  otherNames: string[],
): string | null => {
  const clean = name.trim();
  if (!clean) return "Give the deck a name.";
  if (clean.length > limits.maxDeckName) return `Names are limited to ${limits.maxDeckName} characters.`;
  if (otherNames.some((other) => other.trim().toLowerCase() === clean.toLowerCase())) {
    return "You already have a deck with that name.";
  }
  if (size < limits.deckSize) return `Add ${limits.deckSize - size} more to reach ${limits.deckSize}.`;
  if (size > limits.deckSize) return `Remove ${size - limits.deckSize} to get down to ${limits.deckSize}.`;
  return null;
};

/** The strongest cards not already chosen, enough to bring a deck to `target`. */
export const autoFill = (chosen: string[], pool: Card[], target: number): string[] => {
  const taken = new Set(chosen);
  const extra = pool
    .filter((card) => !taken.has(card.id))
    .sort((a, b) => leadStat(b) - leadStat(a) || a.id.localeCompare(b.id))
    .slice(0, Math.max(target - chosen.length, 0))
    .map((card) => card.id);
  return [...chosen, ...extra];
};
