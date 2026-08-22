import type { CardType } from "../../../types/PocketbaseTablesV2";
import { RARITY_LABEL, TYPE_BEATS, TYPE_EMOJI } from "../rules";
import type { BattleCard, Side } from "../types";

/**
 * Shared presentation vocabulary for the v2 Discord surfaces.
 *
 * Kept apart from the message builders so that colour, wording and card
 * shorthand stay identical across the challenge, the reveal, the picker and the
 * result. A player should be able to recognise "this block is mine" by colour
 * alone, and that only works if one place decides the colours.
 */

/** Accent colours, keyed by side, so a block's owner is obvious at a glance. */
export const SIDE_ACCENT: Record<Side, number> = {
  challenger: 0x5865f2,
  defender: 0xe15c7e,
};

export const NEUTRAL_ACCENT = 0x4d5490;
export const DRAW_ACCENT = 0x9aa1c4;

export const TYPE_ACCENT: Record<CardType, number> = {
  power: 0xf2913d,
  wit: 0x5865f2,
  heart: 0xe15c7e,
};

export const TYPE_NAME: Record<CardType, string> = {
  power: "Power",
  wit: "Wit",
  heart: "Heart",
};

/** `🔴 Power` - the emoji alone is ambiguous to a new player. */
export const typeTag = (type: CardType): string =>
  `${TYPE_EMOJI[type]} ${TYPE_NAME[type]}`;

/** The type wheel in one line, for anywhere a player might need reminding. */
export const TYPE_WHEEL = `${TYPE_EMOJI.power} Power ▸ ${TYPE_EMOJI.wit} Wit ▸ ${TYPE_EMOJI.heart} Heart ▸ ${TYPE_EMOJI.power} Power`;

/** The mechanic in one line. Deliberately the shortest true statement of it. */
export const MECHANIC_HINT = `-# ${TYPE_WHEEL} — beating your opponent's type deals **×1.5**. Slot 1 fights their slot 1.`;

/** The same, trimmed for the picker, where the slot rule is already obvious. */
export const WHEEL_HINT = `-# ${TYPE_WHEEL} — beating their type deals **×1.5**.`;

/** `🔴🔴🔵🟢🟢` from a type tally. */
export const compositionString = (
  counts: Record<CardType, number>,
): string =>
  TYPE_EMOJI.power.repeat(counts.power) +
    TYPE_EMOJI.wit.repeat(counts.wit) +
    TYPE_EMOJI.heart.repeat(counts.heart) || "—";

/** `🔴🔴🔵🟢🟢` - a hand's shape at a glance, order deliberately meaningless. */
export const compositionOf = (cards: BattleCard[]): string => {
  const counts: Record<CardType, number> = { power: 0, wit: 0, heart: 0 };
  for (const card of cards) counts[card.type] += 1;
  return compositionString(counts);
};

/** `9/4/2` in the doc's power/wit/heart order. */
export const statLine = (card: BattleCard): string =>
  `${card.stats.power}/${card.stats.wit}/${card.stats.heart}`;

/** One scannable line per card: the text companion to the card image. */
export const cardLine = (card: BattleCard): string =>
  `${TYPE_EMOJI[card.type]} **${card.name}**${card.foil ? " ✨" : ""} \`${statLine(card)}\` · ${TYPE_NAME[card.type]} ${card.stats[card.type]}`;

/**
 * A very compact form for listing an opponent's hand inside a picker.
 *
 * Keeps the name: the emoji alone tells you what types they hold, but choosing a
 * counter means knowing *which* card carries the big number.
 */
export const cardChip = (card: BattleCard): string => {
  const name = card.name.length > 12 ? `${card.name.slice(0, 11)}…` : card.name;
  return `${TYPE_EMOJI[card.type]} ${name} **${card.stats[card.type]}**`;
};

export const rarityLabel = (card: BattleCard): string =>
  RARITY_LABEL[card.rarity];

/**
 * Why an attack got its multiplier.
 *
 * This is the single most useful thing to put on a round: players learn the type
 * wheel from seeing "Heart beats Power" attached to a number they care about, not
 * from reading a rules post.
 */
export const explainMultiplier = (
  attackerType: CardType,
  defenderType: CardType,
  multiplier: number,
  attackerName: string,
): string => {
  if (multiplier > 1) {
    return `${typeTag(attackerType)} beats ${typeTag(defenderType)} — **×${multiplier}** to ${attackerName}`;
  }
  if (TYPE_BEATS[defenderType] === attackerType) {
    return `${typeTag(attackerType)} loses to ${typeTag(defenderType)} — no bonus`;
  }
  if (attackerType === defenderType) {
    return `${typeTag(attackerType)} mirror — no bonus, the higher stat wins`;
  }
  return `${typeTag(attackerType)} vs ${typeTag(defenderType)} — no bonus`;
};
