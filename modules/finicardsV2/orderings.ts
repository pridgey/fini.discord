import type { BattleCard } from "./types";

/**
 * Slot orderings.
 *
 * Once both sets of three are revealed, the only decision left is the order, and
 * with three cards there are exactly six of them. That is small enough to offer
 * as buttons - so committing an order is a single click with no typing and no
 * chance of fat-fingering a card id.
 */

/** Discord allows at most 25 buttons on one message. */
export const MAX_ORDER_BUTTONS = 25;

/** All orderings of `length` indices, in a stable order. */
export const permutationsOf = (length: number): number[][] => {
  if (length <= 0) return [[]];

  const build = (remaining: number[]): number[][] => {
    if (remaining.length <= 1) return [remaining];
    const results: number[][] = [];
    for (const [index, value] of remaining.entries()) {
      const rest = [...remaining.slice(0, index), ...remaining.slice(index + 1)];
      for (const tail of build(rest)) results.push([value, ...tail]);
    }
    return results;
  };

  return build(Array.from({ length }, (_, index) => index));
};

/**
 * Whether a lineup of `length` cards can be ordered by buttons.
 *
 * 3 cards is 6 orderings and 4 is 24, both of which fit. 5 would be 120, so if
 * `RULES.rounds` is ever raised that far the order picker needs a different UI -
 * this is the guard that says so out loud instead of silently truncating.
 */
export const orderingsFitInButtons = (length: number): boolean =>
  permutationsOf(length).length <= MAX_ORDER_BUTTONS;

/** Applies an ordering to a list, e.g. [2,0,1] over three card ids. */
export const applyOrdering = <T,>(items: T[], ordering: number[]): T[] =>
  ordering.map((index) => items[index]);

/** "Goku → Krillin → Roshi" - what a player sees on the button. */
export const orderingLabel = (
  cards: BattleCard[],
  ordering: number[],
): string =>
  ordering
    .map((index) => cards[index]?.name ?? "?")
    .join(" → ");

/**
 * A button label capped to Discord's 80-character limit, shortening card names
 * from the end so the first slot - the one that matters most - stays readable.
 */
export const shortOrderingLabel = (
  cards: BattleCard[],
  ordering: number[],
  limit = 80,
): string => {
  const full = orderingLabel(cards, ordering);
  if (full.length <= limit) return full;

  const names = ordering.map((index) => cards[index]?.name ?? "?");
  const budget = Math.max(6, Math.floor((limit - 6) / names.length));
  return names
    .map((name) => (name.length > budget ? `${name.slice(0, budget - 1)}…` : name))
    .join(" → ")
    .slice(0, limit);
};
