import type { CardRarity, CardType } from "../../types/PocketbaseTablesV2";

/**
 * Every tuning dial in one place.
 *
 * The design doc calls out `typeMultiplier` as "the single number defining game
 * feel" and expects extended tuning, so nothing here is inlined at a call site.
 * `resolveMatch` takes an optional partial override of this object, which is
 * what `scripts/finicards_v2_simulate.ts` sweeps.
 */
export type BattleRules = {
  /** Damage bonus when the attacker's type beats the defender's type. */
  typeMultiplier: number;
  /** Multiplier in every other case. There is deliberately no penalty dial. */
  neutralMultiplier: number;
  /** Points every card's stat spread must total. */
  statTotal: number;
  /** Minimum value any single stat may hold. */
  statFloor: number;
  /** Max single stat per rarity - governs the spike, not the total. */
  spikeCeiling: Record<CardRarity, number>;
  /** Cards per lineup / rounds per match. */
  rounds: number;
  /** Whether keyword effects are applied. Phase 1 ships with this off. */
  keywordsEnabled: boolean;
  /** Damage above this counts double toward the tiebreaker for `Overwhelm`. */
  overwhelmThreshold: number;
  /** What happens when rounds won AND tiebreaker damage are both equal. */
  drawResolution: "draw" | "defender";
};

export const RULES: BattleRules = {
  typeMultiplier: 1.5,
  neutralMultiplier: 1.0,
  statTotal: 15,
  statFloor: 1,
  spikeCeiling: {
    common: 7,
    uncommon: 9,
    full_art: 12,
  },
  rounds: 3,
  keywordsEnabled: false,
  overwhelmThreshold: 10,
  drawResolution: "draw",
};

/** Power > Wit > Heart > Power. Maps a type to the type it beats. */
export const TYPE_BEATS: Record<CardType, CardType> = {
  power: "wit",
  wit: "heart",
  heart: "power",
};

/** Maps a type to the type that beats it. Used by `Adapt`. */
export const TYPE_BEATEN_BY: Record<CardType, CardType> = {
  wit: "power",
  heart: "wit",
  power: "heart",
};

/** Order used to break stat ties when deriving a type. */
export const TYPE_PRIORITY: CardType[] = ["power", "wit", "heart"];

export const TYPE_EMOJI: Record<CardType, string> = {
  power: "🔴",
  wit: "🔵",
  heart: "🟢",
};

export const RARITY_LABEL: Record<CardRarity, string> = {
  common: "Common",
  uncommon: "Uncommon",
  full_art: "Full Art",
};

/** Default deck cost by rarity. Populated now so Phase 3 has data to read. */
export const RARITY_COST: Record<CardRarity, number> = {
  common: 2,
  uncommon: 3,
  full_art: 5,
};

/** Does `attacker` beat `defender` on the type wheel? */
export const beatsType = (attacker: CardType, defender: CardType): boolean =>
  TYPE_BEATS[attacker] === defender;

/**
 * The multiplier an attacker of `attacker` type gets against `defender` type.
 * Losing the type matchup is not punished - the opponent is simply rewarded.
 */
export const typeMultiplierFor = (
  attacker: CardType,
  defender: CardType,
  rules: BattleRules = RULES,
): number =>
  beatsType(attacker, defender) ? rules.typeMultiplier : rules.neutralMultiplier;
