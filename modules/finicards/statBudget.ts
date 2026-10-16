import type { CardRarity, CardType } from "../../types/PocketbaseTablesV2";
import type { BattleRules } from "./rules";
import { RULES, TYPE_PRIORITY } from "./rules";
import type { SpreadValidation, StatSpread } from "./types";

/**
 * The rarity budget. Every card totals `rules.statTotal` points; rarity governs
 * the maximum spike, not the total. That is the whole self-balancing property -
 * a 12/2/1 full-art is a wall against Power and gets shredded by Wit.
 *
 * Nothing else in the module is allowed to write stats directly; authoring,
 * pack generation and legacy conversion all funnel through `normalizeSpread`,
 * so an illegal spread cannot reach the battle engine.
 */

const EMPTY_SPREAD = (): StatSpread => ({ power: 0, wit: 0, heart: 0 });

/** Highest stat wins. Ties break by TYPE_PRIORITY so a spread is never ambiguous. */
export const deriveType = (spread: StatSpread): CardType => {
  let best: CardType = TYPE_PRIORITY[0];
  for (const type of TYPE_PRIORITY) {
    if (spread[type] > spread[best]) best = type;
  }
  return best;
};

export const spreadTotal = (spread: StatSpread): number =>
  spread.power + spread.wit + spread.heart;

/**
 * Coerces any set of raw weights into a legal spread for `rarity`.
 *
 * Proportional scale -> round (largest remainder) -> clamp to
 * [statFloor, spikeCeiling] -> repair the total by moving single points to
 * whichever stat has the most room. Deterministic: the same input always
 * produces the same spread, which is what lets legacy conversion be re-run
 * safely and lets the tests pin exact values.
 */
export const normalizeSpread = (
  raw: Partial<StatSpread>,
  rarity: CardRarity,
  rules: BattleRules = RULES,
): StatSpread => {
  const total = rules.statTotal;
  const floor = rules.statFloor;
  const ceiling = rules.spikeCeiling[rarity];

  if (floor * 3 > total || ceiling * 3 < total) {
    throw new Error(
      `Impossible stat budget for ${rarity}: total ${total} cannot be met with floor ${floor} and ceiling ${ceiling}`,
    );
  }

  // Sanitise: negatives, NaN and missing values all read as 0.
  const weights = EMPTY_SPREAD();
  for (const type of TYPE_PRIORITY) {
    const value = Number(raw[type]);
    weights[type] = Number.isFinite(value) && value > 0 ? value : 0;
  }

  const weightSum = spreadTotal(weights);
  const spread = EMPTY_SPREAD();

  if (weightSum === 0) {
    // No signal at all - split as evenly as the budget allows.
    for (const type of TYPE_PRIORITY) spread[type] = Math.floor(total / 3);
  } else {
    // Proportional scale, largest-remainder rounding.
    const scaled = TYPE_PRIORITY.map((type) => ({
      type,
      exact: (weights[type] / weightSum) * total,
    }));
    for (const entry of scaled) spread[entry.type] = Math.floor(entry.exact);
    const remainders = scaled
      .map((entry) => ({
        type: entry.type,
        fraction: entry.exact - Math.floor(entry.exact),
      }))
      .sort(
        (a, b) =>
          b.fraction - a.fraction ||
          TYPE_PRIORITY.indexOf(a.type) - TYPE_PRIORITY.indexOf(b.type),
      );
    let shortfall = total - spreadTotal(spread);
    for (const entry of remainders) {
      if (shortfall <= 0) break;
      spread[entry.type] += 1;
      shortfall -= 1;
    }
  }

  // Clamp, then repair the total one point at a time.
  for (const type of TYPE_PRIORITY) {
    spread[type] = Math.min(ceiling, Math.max(floor, spread[type]));
  }

  const roomAbove = (type: CardType) => ceiling - spread[type];
  const roomBelow = (type: CardType) => spread[type] - floor;

  let guard = total * 6;
  while (spreadTotal(spread) !== total && guard-- > 0) {
    const over = spreadTotal(spread) > total;
    const candidates = TYPE_PRIORITY.filter((type) =>
      over ? roomBelow(type) > 0 : roomAbove(type) > 0,
    ).sort((a, b) =>
      over
        ? roomBelow(b) - roomBelow(a) ||
          TYPE_PRIORITY.indexOf(a) - TYPE_PRIORITY.indexOf(b)
        : roomAbove(b) - roomAbove(a) ||
          TYPE_PRIORITY.indexOf(a) - TYPE_PRIORITY.indexOf(b),
    );
    if (candidates.length === 0) break;
    spread[candidates[0]] += over ? -1 : 1;
  }

  return spread;
};

/**
 * Checks a spread that already exists (an authored row, say) against the budget.
 * Returns every problem rather than throwing on the first, so an import can
 * report all of a sheet's mistakes in one pass.
 */
export const validateSpread = (
  spread: StatSpread,
  rarity: CardRarity,
  declaredType?: CardType,
  rules: BattleRules = RULES,
): SpreadValidation => {
  const issues: string[] = [];
  const ceiling = rules.spikeCeiling[rarity];
  const total = spreadTotal(spread);

  if (total !== rules.statTotal) {
    issues.push(`Stats total ${total}, expected ${rules.statTotal}`);
  }

  for (const type of TYPE_PRIORITY) {
    if (!Number.isInteger(spread[type])) {
      issues.push(`${type} (${spread[type]}) must be a whole number`);
    }
    if (spread[type] > ceiling) {
      issues.push(
        `${type} (${spread[type]}) exceeds the ${rarity} spike ceiling of ${ceiling}`,
      );
    }
    if (spread[type] < rules.statFloor) {
      issues.push(
        `${type} (${spread[type]}) is below the stat floor of ${rules.statFloor}`,
      );
    }
  }

  if (declaredType && declaredType !== deriveType(spread)) {
    issues.push(
      `Declared type "${declaredType}" is not the highest stat (highest is "${deriveType(spread)}")`,
    );
  }

  return { valid: issues.length === 0, issues };
};

/** Formats a spread the way the design doc writes them: power/wit/heart. */
export const formatSpread = (spread: StatSpread): string =>
  `${spread.power}/${spread.wit}/${spread.heart}`;
