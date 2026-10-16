/**
 * Legendaries: full-art cards that come to life.
 *
 * A Legendary is a copy of a full-art card carrying one of the animated
 * effects below. It is a full-art by every rule - same stats, same deck cost -
 * and is shown as a looping GIF instead of a still. The effect belongs to the
 * copy (`v2_user_card.legendary`), not to the card: any full-art can come out
 * Legendary, in any of the effects.
 *
 * This file is the rules half - which effects exist, how rare each tier is,
 * how one is rolled. The drawing lives in `cardArt/legendaryGif.ts`.
 */

/** 1 is the least rare, 4 the rarest. */
export type LegendaryTier = 1 | 2 | 3 | 4;

/** Every effect and the tier it belongs to, as Taylor sorted them. */
export const LEGENDARY_EFFECTS: Record<string, LegendaryTier> = {
  breathe: 1,
  drift: 1,
  embers: 2,
  glitter: 2,
  shimmer: 2,
  speedlines: 2,
  cosmos: 3,
  glitch: 3,
  storm: 3,
  etched: 4,
  facets: 4,
  ghost: 4,
  thermal: 4,
  xray: 4,
};

export const LEGENDARY_TIERS: LegendaryTier[] = [1, 2, 3, 4];

/**
 * Chance a pack holds a Legendary of each tier. Tuned for a server opening
 * about a hundred packs a month: a tier 1 about monthly, a tier 4 about twice
 * a year. Rolled once per pack, on top of the pack's usual odds.
 */
export const LEGENDARY_ODDS: Record<LegendaryTier, number> = {
  1: 0.01,
  2: 0.005,
  3: 0.0029,
  4: 0.0017,
};

/** The tier of an effect, or null for a slug that is not one. */
export const legendaryTier = (effect: string | undefined | null): LegendaryTier | null =>
  (effect && LEGENDARY_EFFECTS[effect]) || null;

/** What a Legendary prints where a full-art prints `FA`: L1 to L4. */
export const legendaryCode = (effect: string | undefined | null): string | null => {
  const tier = legendaryTier(effect);
  return tier ? `L${tier}` : null;
};

/**
 * One pack's roll: the tier it holds, or null for none - which is nearly
 * always. A single roll across all four tiers, so a pack holds at most one.
 */
export const rollLegendaryTier = (
  roll: number,
  odds: Record<LegendaryTier, number> = LEGENDARY_ODDS,
): LegendaryTier | null => {
  let cumulative = 0;
  // Rarest first, so a roll near zero is the rarest thing that can happen.
  for (const tier of [...LEGENDARY_TIERS].reverse()) {
    cumulative += odds[tier];
    if (roll < cumulative) return tier;
  }
  return null;
};

/** An effect of `tier`, each as likely as the others in it. */
export const rollLegendaryEffect = (tier: LegendaryTier, roll: number): string => {
  const effects = Object.keys(LEGENDARY_EFFECTS)
    .filter((effect) => LEGENDARY_EFFECTS[effect] === tier)
    .sort();
  return effects[Math.min(Math.floor(roll * effects.length), effects.length - 1)];
};

/** A tier chosen at the tiers' usual proportions, for a pull that is certain. */
export const rollGuaranteedTier = (roll: number): LegendaryTier => {
  const total = LEGENDARY_TIERS.reduce((sum, tier) => sum + LEGENDARY_ODDS[tier], 0);
  return rollLegendaryTier(roll * total) ?? 1;
};
