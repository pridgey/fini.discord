import { dealHand } from "./draw";
import { RULES } from "./rules";
import type { BattleCard, Side } from "./types";

/**
 * Practice battles: one player, both sides.
 *
 * A practice battle is an ordinary battle row whose challenger and defender are
 * the same user - a real challenge can never look like that, because
 * `/finicard battle` refuses to challenge yourself. That makes it a marker
 * that needs no schema change, and it means practice runs through the same
 * dealing, picking, resolution and rendering as a real match, which is the whole
 * point of having it.
 *
 * What differs: both hands are dealt at once, the player picks the challenger's
 * lineup and then the defender's, everything is shown only to them, and nothing
 * touches Finicoin or anyone's record.
 */

type BattleParties = {
  challenger_id: string;
  defender_id: string;
  challenger_lineup?: string[];
};

export const isPractice = (battle: BattleParties): boolean =>
  battle.challenger_id === battle.defender_id;

/**
 * The side a practice player is picking for: the challenger until that lineup
 * is locked, then the defender.
 */
export const practiceSideToPlay = (battle: BattleParties): Side =>
  (battle.challenger_lineup ?? []).length === RULES.rounds
    ? "defender"
    : "challenger";

/**
 * Deals both practice hands.
 *
 * The two decks may be the same deck, or share copies. The defender is dealt
 * around the challenger's hand where the deck is deep enough, so one copy is not
 * on both sides of the board; a deck too small for that is dealt from in full,
 * since a mirrored copy is harmless when nothing is at stake.
 */
export const dealPracticeHands = (
  challengerDeck: BattleCard[],
  defenderDeck: BattleCard[],
  handSize: number,
  random: () => number = Math.random,
): Record<Side, BattleCard[]> => {
  const challenger = dealHand(challengerDeck, handSize, random);
  const dealt = new Set(challenger.map((card) => card.instanceId));
  const untouched = defenderDeck.filter((card) => !dealt.has(card.instanceId));

  return {
    challenger,
    defender: dealHand(
      untouched.length >= handSize ? untouched : defenderDeck,
      handSize,
      random,
    ),
  };
};

/** What to call each side: its deck, told apart when it is the same deck. */
export const practiceNames = (
  challengerDeck: string,
  defenderDeck: string,
): Record<Side, string> =>
  challengerDeck === defenderDeck
    ? { challenger: `${challengerDeck} A`, defender: `${defenderDeck} B` }
    : { challenger: challengerDeck, defender: defenderDeck };
