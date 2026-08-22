import { RULES } from "./rules";
import type { BattleCard } from "./types";

/**
 * Dealing a hand.
 *
 * A battle deals `HAND_SIZE` cards from the chosen deck, and the player then
 * picks `RULES.rounds` of them in slot order. The gap between the two is the
 * decision: five cards and three slots means two cards get left behind, and
 * which two depends on what the opponent is holding.
 */

/** Default cards dealt per battle. Two more than the lineup needs. */
export const HAND_SIZE = RULES.rounds + 2;

/**
 * Draw sizes a battle may be created with.
 *
 * The floor is the lineup size - deal fewer and there is nothing to play. The
 * ceiling is what the picker can encode as single digits and fit in two rows of
 * buttons; `MAX_ENCODABLE_HAND` guards the encoding independently.
 */
export const MIN_HAND_SIZE = RULES.rounds;
export const MAX_HAND_SIZE = 8;

/** Clamps a requested draw size into the legal range. */
export const clampHandSize = (requested: number | null | undefined): number => {
  if (!Number.isFinite(requested ?? NaN)) return HAND_SIZE;
  return Math.min(MAX_HAND_SIZE, Math.max(MIN_HAND_SIZE, Math.round(requested!)));
};

type Random = () => number;

/**
 * Deals `size` distinct cards from `pool`.
 *
 * Distinct by instance, not by name: a player who owns three copies of a card can
 * legitimately be dealt all three, but the same copy must never appear twice or
 * it could be played in two slots at once.
 *
 * Partial Fisher-Yates over a copy of the pool, so it is O(size) and never
 * mutates the caller's array.
 */
export const dealHand = <T,>(
  pool: T[],
  size: number,
  random: Random = Math.random,
): T[] => {
  const deck = [...pool];
  const dealt: T[] = [];
  const count = Math.min(size, deck.length);

  for (let index = 0; index < count; index++) {
    const pick = index + Math.floor(random() * (deck.length - index));
    [deck[index], deck[pick]] = [deck[pick], deck[index]];
    dealt.push(deck[index]);
  }

  return dealt;
};

/** Deals a hand of card ids from a deck's contents. */
export const dealHandFromDeck = (
  cards: BattleCard[],
  size: number = HAND_SIZE,
  random: Random = Math.random,
): string[] => dealHand(cards, size, random).map((card) => card.instanceId);

/**
 * Whether a lineup is a legal play from a dealt hand.
 *
 * The hand is the constraint that makes the whole thing fair: without this check
 * a client could submit any three cards it liked, hand or not.
 */
export const isLegalLineup = (
  lineup: string[],
  hand: string[],
  rounds: number = RULES.rounds,
): boolean => {
  if (lineup.length !== rounds) return false;
  if (new Set(lineup).size !== lineup.length) return false;
  const available = new Set(hand);
  return lineup.every((id) => available.has(id));
};
