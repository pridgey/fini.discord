import type {
  CardRarity,
  V2CardDefinitionRecord,
} from "../../types/PocketbaseTablesV2";
import {
  getCardDefinitions,
  getLegendaryHolders,
  getPopulationCounts,
  ownedDefinitionIds,
  legendaryKey,
  grantCard,
  rollCopyKeyword,
} from "./cardStore";
import {
  LEGENDARY_EFFECTS,
  LEGENDARY_ODDS,
  rollLegendaryEffect,
  rollLegendaryTier,
  type LegendaryTier,
} from "./legendary";
import type { OwnedCard } from "./types";

/**
 * v2 pack generation.
 *
 * Three rarities instead of six, and prestige moved onto the cosmetic Foil axis:
 * foil can roll on any card at any rarity, never changes a stat, and is therefore
 * infinitely printable without power creep.
 */

export type PackOdds = Record<CardRarity, number>;

/** Percentages, summing to 100. */
export const PACK_ODDS: PackOdds = {
  common: 70,
  uncommon: 25,
  full_art: 5,
};

/**
 * A set pack's odds: leaner on rares than a pack drawn from every set. A set
 * pack narrows the draw to one set, which made it the way to farm that set's
 * full-arts; this keeps it a way to fill out a set's commons and uncommons.
 */
export const SET_PACK_ODDS: PackOdds = {
  common: 75,
  uncommon: 22,
  full_art: 3,
};

export const PACK_SIZE = 5;

/** Chance any single card in a pack comes back foil. */
export const FOIL_CHANCE = 0.03;

/**
 * Chance a pack holds a Secret Art. Its own roll, on top of the pack's usual
 * odds: a Secret Art takes the place of one card in the pack, and never comes
 * out of the full-art slot.
 */
export const SECRET_ART_CHANCE = 0.01;

/** What a pack drawn from every set costs, and one drawn from a single set. */
export const PACK_COST = 25;
export const SET_PACK_COST = 40;

/**
 * The sets a pack can be bought from on their own. A set listed before its
 * cards are active answers "isn't out yet" - and it only shows in Discord once
 * the commands are registered again, so that can wait for launch day.
 */
export const BOOSTER_SETS = [1, 2, 3, 4] as const;

/** Order used when a rarity is exhausted and we fall back down the ladder. */
const FALLBACK_ORDER: CardRarity[] = ["full_art", "uncommon", "common"];

type Random = () => number;

/** Rolls one rarity against the odds table. Pure, so tests can pin the roll. */
export const rollRarity = (
  odds: PackOdds = PACK_ODDS,
  random: Random = Math.random,
): CardRarity => {
  const roll = random() * 100;
  let cumulative = 0;
  for (const rarity of FALLBACK_ORDER.slice().reverse()) {
    cumulative += odds[rarity];
    if (roll < cumulative) return rarity;
  }
  return "common";
};

export const rollPackRarities = (
  size: number = PACK_SIZE,
  odds: PackOdds = PACK_ODDS,
  random: Random = Math.random,
): CardRarity[] => Array.from({ length: size }, () => rollRarity(odds, random));

/** Definitions of a rarity that still have room left in the server population. */
const availableOfRarity = (
  definitions: V2CardDefinitionRecord[],
  counts: Map<string, number>,
  rarity: CardRarity,
): V2CardDefinitionRecord[] =>
  definitions.filter(
    (definition) =>
      definition.rarity === rarity &&
      // Secret Arts are full-arts by rule, but only their own roll finds them.
      !definition.secret_art &&
      (definition.population <= 0 ||
        (counts.get(definition.id ?? "") ?? 0) < definition.population),
  );

/**
 * Picks a card of `rarity`, walking down the rarity ladder if that tier is
 * exhausted for the server. Returns null only when the entire pool is claimed.
 */
export const selectCard = (
  definitions: V2CardDefinitionRecord[],
  counts: Map<string, number>,
  rarity: CardRarity,
  random: Random = Math.random,
): V2CardDefinitionRecord | null => {
  const startIndex = FALLBACK_ORDER.indexOf(rarity);
  const ladder = FALLBACK_ORDER.slice(startIndex < 0 ? 0 : startIndex);

  for (const tier of ladder) {
    const pool = availableOfRarity(definitions, counts, tier);
    if (pool.length > 0) {
      return pool[Math.floor(random() * pool.length)];
    }
  }

  return null;
};

/** Secret Arts with room left in the server population. */
export const availableSecretArts = (
  definitions: V2CardDefinitionRecord[],
  counts: Map<string, number>,
): V2CardDefinitionRecord[] =>
  definitions.filter(
    (definition) =>
      !!definition.secret_art &&
      (definition.population <= 0 ||
        (counts.get(definition.id ?? "") ?? 0) < definition.population),
  );

/** Full-arts that can come out Legendary: every one but the Secret Arts, which are not animated. */
export const availableLegendaries = (
  definitions: V2CardDefinitionRecord[],
): V2CardDefinitionRecord[] =>
  definitions.filter(
    (definition) => definition.rarity === "full_art" && !definition.secret_art,
  );

/**
 * A Legendary of `tier`: an animation, and a card that has no Legendary with
 * that animation on the server yet - each card has one per animation there.
 * The rolled animation is tried first, then the tier's others; null when every
 * card has every animation of the tier.
 */
export const pickLegendary = (
  pool: V2CardDefinitionRecord[],
  holders: Set<string>,
  tier: LegendaryTier,
  random: Random,
): { definition: V2CardDefinitionRecord; effect: string } | null => {
  const rolled = rollLegendaryEffect(tier, random());
  const effects = [
    rolled,
    ...Object.keys(LEGENDARY_EFFECTS)
      .filter(
        (effect) => LEGENDARY_EFFECTS[effect] === tier && effect !== rolled,
      )
      .sort(),
  ];
  for (const effect of effects) {
    const open = pool.filter(
      (definition) => !holders.has(legendaryKey(definition.id ?? "", effect)),
    );
    if (open.length > 0)
      return { definition: open[Math.floor(random() * open.length)], effect };
  }
  return null;
};

export type OpenPackInput = {
  userId: string;
  serverId: string;
  identifier: string;
  size?: number;
  odds?: PackOdds;
  foilChance?: number;
  /** Chance this pack holds a Secret Art. Defaults to `SECRET_ART_CHANCE`. */
  secretArtChance?: number;
  /**
   * Draw only from this release set. Everything in the pack comes from it -
   * a Secret Art or a Legendary too - so a set with none of those has none
   * to give. Absent, the pack draws from every set.
   */
  set?: number;
  /** Chance this pack holds a Legendary, by tier. Defaults to `LEGENDARY_ODDS`. */
  legendaryOdds?: Record<LegendaryTier, number>;
  random?: Random;
};

export type OpenPackResult = {
  pulls: OwnedCard[];
  /** Cards the pack wanted to hand out but could not, because the pool is dry. */
  shortfall: number;
};

/** Rolls a pack and writes the pulls to the user's v2 collection. */
export const openPack = async (
  input: OpenPackInput,
): Promise<OpenPackResult> => {
  const random = input.random ?? Math.random;
  const size = input.size ?? PACK_SIZE;
  const foilChance = input.foilChance ?? FOIL_CHANCE;

  const everything = await getCardDefinitions();
  const definitions = input.set
    ? everything.filter((definition) => definition.set === input.set)
    : everything;
  if (definitions.length === 0) {
    return { pulls: [], shortfall: size };
  }

  const counts = await getPopulationCounts(input.serverId);
  // What the player held before this pack, so its pulls can say they're new.
  const held = await ownedDefinitionIds(input.userId, input.serverId);
  const rarities = rollPackRarities(
    size,
    input.odds ?? (input.set ? SET_PACK_ODDS : PACK_ODDS),
    random,
  );

  const pulls: OwnedCard[] = [];
  let shortfall = 0;

  // Rolled only while there is a Secret Art to find, so a pool without any
  // opens exactly as it did before they existed.
  const secretArts = availableSecretArts(definitions, counts);
  const secretSlot =
    secretArts.length > 0 &&
    random() < (input.secretArtChance ?? SECRET_ART_CHANCE)
      ? Math.floor(random() * rarities.length)
      : -1;

  // The same again for a Legendary: its own roll, taking the place of one
  // card - and never the Secret Art's place, should a pack hold both.
  const legendaries = availableLegendaries(definitions);
  const legendaryHolders =
    legendaries.length > 0
      ? await getLegendaryHolders(input.serverId)
      : new Set<string>();
  const legendaryTier =
    legendaries.length > 0
      ? rollLegendaryTier(random(), input.legendaryOdds ?? LEGENDARY_ODDS)
      : null;
  let legendarySlot = legendaryTier
    ? Math.floor(random() * rarities.length)
    : -1;
  if (legendarySlot >= 0 && legendarySlot === secretSlot) {
    legendarySlot = (legendarySlot + 1) % rarities.length;
  }

  for (const [slot, rarity] of rarities.entries()) {
    const pickedLegendary =
      slot === legendarySlot && legendaryTier
        ? pickLegendary(legendaries, legendaryHolders, legendaryTier, random)
        : null;
    const legendary = pickedLegendary?.effect ?? "";
    const definition = pickedLegendary
      ? pickedLegendary.definition
      : slot === secretSlot
        ? secretArts[Math.floor(random() * secretArts.length)]
        : selectCard(definitions, counts, rarity, random);

    if (!definition) {
      shortfall += 1;
      continue;
    }

    const definitionId = definition.id ?? "";
    // A Legendary takes none of its card's ordinary copies.
    if (!legendary)
      counts.set(definitionId, (counts.get(definitionId) ?? 0) + 1);

    const foil = random() < foilChance;
    const record = await grantCard({
      userId: input.userId,
      serverId: input.serverId,
      identifier: input.identifier,
      definitionId,
      foil,
      // Rolled here, per pull: the same card comes out of different packs
      // with different keywords.
      keyword: rollCopyKeyword(definition.rarity, random),
      legendary,
      acquiredFrom: "pack",
    });

    // The first copy of a card is new; a second of it in the same pack isn't.
    const isNew = !held.has(definitionId);
    held.add(definitionId);
    pulls.push({ ...record, definition, isNew });
  }

  return { pulls, shortfall };
};
