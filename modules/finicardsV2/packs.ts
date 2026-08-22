import type {
  CardRarity,
  V2CardDefinitionRecord,
} from "../../types/PocketbaseTablesV2";
import {
  getCardDefinitions,
  getPopulationCounts,
  grantCard,
} from "./cardStore";
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

export const PACK_SIZE = 5;

/** Chance any single card in a pack comes back foil. */
export const FOIL_CHANCE = 0.03;

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

export type OpenPackInput = {
  userId: string;
  serverId: string;
  identifier: string;
  size?: number;
  odds?: PackOdds;
  foilChance?: number;
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

  const definitions = await getCardDefinitions();
  if (definitions.length === 0) {
    return { pulls: [], shortfall: size };
  }

  const counts = await getPopulationCounts(input.serverId);
  const rarities = rollPackRarities(size, input.odds ?? PACK_ODDS, random);

  const pulls: OwnedCard[] = [];
  let shortfall = 0;

  for (const rarity of rarities) {
    const definition = selectCard(definitions, counts, rarity, random);

    if (!definition) {
      shortfall += 1;
      continue;
    }

    const definitionId = definition.id ?? "";
    counts.set(definitionId, (counts.get(definitionId) ?? 0) + 1);

    const foil = random() < foilChance;
    const record = await grantCard({
      userId: input.userId,
      serverId: input.serverId,
      identifier: input.identifier,
      definitionId,
      foil,
      acquiredFrom: "pack",
    });

    pulls.push({ ...record, definition });
  }

  return { pulls, shortfall };
};
