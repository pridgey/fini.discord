import type { CardDefinitionRecord } from "../../types/PocketbaseTables";
import type {
  CardRarity,
  V2CardDefinitionRecord,
} from "../../types/PocketbaseTablesV2";
import { keywordsForRarity } from "./keywords";
import type { BattleRules } from "./rules";
import { RARITY_COST, RULES } from "./rules";
import { deriveType, normalizeSpread } from "./statBudget";
import type { StatSpread } from "./types";

/**
 * Converts the live v1 card pool into v2 rows.
 *
 * This exists so v2 can be play-tested against hundreds of real cards on day
 * one instead of waiting on an authored pool. It is deterministic and idempotent
 * (keyed on `legacy_card`), so it can be re-run after a mapping tweak.
 *
 * The stat mapping, since v2's three stats have no v1 counterpart:
 *
 *   power = strength + endurance     (brute force)
 *   wit   = intellect + agility      (cleverness)
 *   heart = luck x 2                 (the only v1 stat with no physical or
 *                                     mental analogue, so it carries Heart
 *                                     alone and is doubled to stay comparable)
 *
 * Those three weights are then squeezed through `normalizeSpread`, which is what
 * enforces the 15-point total and the rarity spike ceiling. The mapping only has
 * to get the *shape* right; the budget does the balancing.
 */

/** v1 has six rarities; v2 has three plus a cosmetic axis. */
export const LEGACY_RARITY_MAP: Record<
  CardDefinitionRecord["rarity"],
  CardRarity | null
> = {
  c: "common",
  u: "uncommon",
  fa: "full_art",
  // Legendaries become full-arts with the cosmetic flag, per the Foil proposal -
  // prestige without a fourth power tier.
  l: "full_art",
  // Item cards are not battlers. They are skipped, not downgraded.
  i: null,
  ri: null,
};

/** Legendaries carry prestige as a cosmetic, not as extra stats. */
export const LEGACY_FOIL_RARITIES: CardDefinitionRecord["rarity"][] = ["l"];

export const legacyStatWeights = (card: CardDefinitionRecord): StatSpread => ({
  power: (card.strength ?? 0) + (card.endurance ?? 0),
  wit: (card.intellect ?? 0) + (card.agility ?? 0),
  heart: (card.luck ?? 0) * 2,
});

/**
 * How hard to push the dominant stat toward the rarity ceiling.
 *
 * Without this the conversion is useless: v1's five stats are fairly flat across
 * the pool, so proportional scaling gave *every* rarity an average top stat of
 * about 6 - measured across the real 263-card pool, not one full-art reached 11.
 * Rarity became purely cosmetic, and the doc's whole "full-arts are devastating
 * specialists with exploitable holes" idea evaporated.
 *
 * Raising the weights to a power sharpens the difference between them before the
 * budget is applied, so a card that leans Power a little becomes a card that
 * leans Power a lot - at full-art, a lot more. Commons stay at 1.0, which is
 * what keeps them rounded and hole-free.
 */
export const SPIKE_GAMMA: Record<CardRarity, number> = {
  common: 1.0,
  uncommon: 3.5,
  full_art: 7.5,
};

/**
 * Per-channel averages across a pool, used to judge a card's stats against what
 * is *typical* rather than in absolute terms.
 *
 * This matters because the three channels are not fed equally: Power draws on
 * two v1 stats, Wit on two, and Heart on Luck alone. Measured on the real pool
 * that produced a 62/15/22 type split - most cards were Power, so most matchups
 * were Power vs Power and the type wheel barely turned. Dividing by the channel
 * mean removes that bias without touching any individual card's shape.
 */
export type ChannelMeans = StatSpread;

export const channelMeans = (cards: CardDefinitionRecord[]): ChannelMeans => {
  const totals: StatSpread = { power: 0, wit: 0, heart: 0 };
  let counted = 0;

  for (const card of cards) {
    const weights = legacyStatWeights(card);
    totals.power += weights.power;
    totals.wit += weights.wit;
    totals.heart += weights.heart;
    counted += 1;
  }

  if (counted === 0) return { power: 1, wit: 1, heart: 1 };

  // A channel whose mean is zero must not divide to infinity.
  return {
    power: totals.power / counted || 1,
    wit: totals.wit / counted || 1,
    heart: totals.heart / counted || 1,
  };
};

/** Applies the channel correction and the rarity spike curve to raw weights. */
export const shapeWeights = (
  weights: StatSpread,
  rarity: CardRarity,
  means: ChannelMeans,
): StatSpread => {
  const gamma = SPIKE_GAMMA[rarity];

  const relative: StatSpread = {
    power: weights.power / means.power,
    wit: weights.wit / means.wit,
    heart: weights.heart / means.heart,
  };

  return {
    power: Math.pow(relative.power, gamma),
    wit: Math.pow(relative.wit, gamma),
    heart: Math.pow(relative.heart, gamma),
  };
};

const slugify = (value: string): string =>
  (value ?? "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

/**
 * Tags are free to add and expensive to retrofit, so be generous. Series and
 * colour come across as-is, plus a `legacy` marker so converted cards can be
 * excluded from a curated event with one filter.
 */
export const legacyTags = (card: CardDefinitionRecord): string[] => {
  // Order matters for presentation as well as filtering: the card templates show
  // the first two tags, and the series is already printed in the header, so the
  // descriptive ones lead and the `legacy` marker trails.
  const tags = new Set<string>();
  if (card.type) tags.add(slugify(card.type));
  if (card.color) tags.add(slugify(card.color));
  if (card.series) tags.add(slugify(card.series));
  tags.add("legacy");
  return [...tags].filter(Boolean);
};

/** Stable 32-bit FNV-1a, so keyword assignment never shuffles between runs. */
const hashString = (value: string): number => {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
};

/**
 * Picks a keyword deterministically from the pool legal for that rarity.
 * Off by default: Phase 1 ships with no keywords, and `RULES.keywordsEnabled`
 * ignores them even if present. Populating them early is free.
 */
export const assignKeyword = (
  seed: string,
  rarity: CardRarity,
): string => {
  const pool = keywordsForRarity(rarity);
  if (pool.length === 0) return "";
  return pool[hashString(seed) % pool.length].slug;
};

export type ConvertOptions = {
  /** Populate the `keyword` column. Default false - Phase 1 is pure stats. */
  assignKeywords?: boolean;
  /** Carried into every converted row. */
  rules?: BattleRules;
  /**
   * Channel averages to judge this card against. `convertLegacyPool` measures
   * them from the pool; a single-card conversion without them falls back to
   * treating the card's own channels as already comparable.
   */
  means?: ChannelMeans;
};

export type ConversionSkip = {
  legacyId: string;
  cardName: string;
  reason: string;
};

export type ConversionResult = {
  converted: V2CardDefinitionRecord[];
  skipped: ConversionSkip[];
};

/** Converts one v1 row. Returns null for rows that have no v2 equivalent. */
export const convertLegacyCard = (
  card: CardDefinitionRecord,
  options: ConvertOptions = {},
): V2CardDefinitionRecord | null => {
  const rarity = LEGACY_RARITY_MAP[card.rarity];
  if (!rarity) return null;

  const rules = options.rules ?? RULES;
  const means = options.means ?? { power: 1, wit: 1, heart: 1 };
  const spread = normalizeSpread(
    shapeWeights(legacyStatWeights(card), rarity, means),
    rarity,
    rules,
  );
  const legacyId = card.id ?? "";

  return {
    card_name: card.card_name,
    series: card.series ?? "",
    rarity,
    power: spread.power,
    wit: spread.wit,
    heart: spread.heart,
    card_type: deriveType(spread),
    tags: legacyTags(card),
    keyword: options.assignKeywords
      ? assignKeyword(legacyId || card.card_name, rarity)
      : "",
    cost: RARITY_COST[rarity],
    set_piece: "",
    art_url: "",
    legacy_card: legacyId,
    population: card.population ?? 0,
    active: true,
  };
};

/** Converts a whole pool, reporting what was left behind and why. */
export const convertLegacyPool = (
  cards: CardDefinitionRecord[],
  options: ConvertOptions = {},
): ConversionResult => {
  const converted: V2CardDefinitionRecord[] = [];
  const skipped: ConversionSkip[] = [];

  // Measured over the whole pool, so a card's type reflects where it leans
  // relative to its peers rather than which v1 stats happened to feed it.
  const means = options.means ?? channelMeans(cards);
  const withMeans: ConvertOptions = { ...options, means };

  for (const card of cards) {
    const rarity = LEGACY_RARITY_MAP[card.rarity];

    if (!rarity) {
      skipped.push({
        legacyId: card.id ?? "",
        cardName: card.card_name,
        reason: `rarity "${card.rarity}" has no v2 equivalent (item cards are not battlers)`,
      });
      continue;
    }

    const result = convertLegacyCard(card, withMeans);
    if (!result) {
      skipped.push({
        legacyId: card.id ?? "",
        cardName: card.card_name,
        reason: "conversion returned no row",
      });
      continue;
    }

    converted.push(result);
  }

  return { converted, skipped };
};

/** True when a v1 card should also get the cosmetic foil flag on its copies. */
export const legacyGrantsFoil = (card: CardDefinitionRecord): boolean =>
  LEGACY_FOIL_RARITIES.includes(card.rarity);
