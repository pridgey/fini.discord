import type { CardType } from "../../../types/PocketbaseTablesV2";
import { findKeyword, type KeywordDefinition } from "../keywords";
import { legendaryCode } from "../legendary";
import { RARITY_LABEL, RULES, TYPE_BEATS, TYPE_EMOJI } from "../rules";
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

/** The most cards a tally is drawn out for, one emoji each, before it is counted. */
const TALLY_DRAWN_UP_TO = 8;

/**
 * A type tally. A hand or a pack is drawn out, `🟠🟠🔵🔴🔴`, so its shape
 * reads at a glance; anything bigger - a deck, a collection - is counted,
 * `🟠 12 · 🔵 9 · 🔴 4`, because a row of two hundred emoji says nothing and
 * is longer than a message may be.
 */
export const compositionString = (counts: Record<CardType, number>): string => {
  const total = counts.power + counts.wit + counts.heart;
  if (total === 0) return "—";
  if (total <= TALLY_DRAWN_UP_TO) {
    return (
      TYPE_EMOJI.power.repeat(counts.power) +
      TYPE_EMOJI.wit.repeat(counts.wit) +
      TYPE_EMOJI.heart.repeat(counts.heart)
    );
  }
  return (["power", "wit", "heart"] as const)
    .filter((type) => counts[type] > 0)
    .map((type) => `${TYPE_EMOJI[type]} ${counts[type]}`)
    .join(" · ");
};

/** `🟠🟠🔵🔴🔴` - a hand's shape at a glance, order deliberately meaningless. */
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
 * The keyword a card will actually fight with, or null.
 *
 * Null while keywords are switched off, even on a card that carries one: naming
 * a keyword that will not fire invites a player to build a lineup around it.
 */
export const activeKeyword = (card: BattleCard): KeywordDefinition | null =>
  RULES.keywordsEnabled ? findKeyword(card.keyword) : null;

/**
 * One line of an opponent's hand inside a picker.
 *
 * The type stat leads, in a fixed-width column, because choosing a counter
 * means finding the card that carries the big number - and a column of numbers
 * can be scanned where a run of chips on one wrapped line could not.
 */
export const cardChip = (card: BattleCard): string => {
  const keyword = activeKeyword(card);
  const stat = String(card.stats[card.type]).padStart(2, " ");
  return `${TYPE_EMOJI[card.type]} \`${stat}\` ${card.name}${keyword ? ` · _${keyword.name}_` : ""}`;
};

/**
 * What each keyword among `cards` does, one small line apiece and each keyword
 * once. Cards are tagged with the keyword's name alone; this is the legend.
 */
export const keywordGlossary = (cards: BattleCard[]): string[] => {
  const seen = new Map<string, KeywordDefinition>();
  for (const card of cards) {
    const keyword = activeKeyword(card);
    if (keyword) seen.set(keyword.slug, keyword);
  }
  return [...seen.values()].map(
    (keyword) => `-# **${keyword.name}** — ${keyword.description}`,
  );
};

/**
 * The same legend for a single hand, naming the cards that carry each keyword.
 *
 * Used where the hand is an image: the strip can only fit the keyword's name,
 * so this is where a player reads what it does without leaving the message.
 */
export const keywordLegend = (cards: BattleCard[]): string[] => {
  const carriers = new Map<
    string,
    { keyword: KeywordDefinition; names: string[] }
  >();
  for (const card of cards) {
    const keyword = activeKeyword(card);
    if (!keyword) continue;
    const entry = carriers.get(keyword.slug) ?? { keyword, names: [] };
    entry.names.push(card.name);
    carriers.set(keyword.slug, entry);
  }
  return [...carriers.values()].map(
    ({ keyword, names }) =>
      `-# **${keyword.name}** · ${names.join(", ")} — ${keyword.description}`,
  );
};

/**
 * Every keyword in a battle, hand by hand - the long form behind the picker's
 * Keywords button, for when the two hands carry too many to list inline.
 */
export const keywordSheet = (
  hands: { name: string; cards: BattleCard[] }[],
): string =>
  [
    "### Abilities in this battle",
    ...hands.map(({ name, cards }) => {
      const legend = keywordLegend(cards);
      return [
        `**${name}'s hand**`,
        ...(legend.length > 0 ? legend : ["-# No abilities."]),
      ].join("\n");
    }),
  ].join("\n\n");

export const rarityLabel = (card: BattleCard): string =>
  card.legendary
    ? `Legendary ${legendaryCode(card.legendary) ?? ""}`.trim()
    : card.secretArt
      ? "Secret Art"
      : RARITY_LABEL[card.rarity];

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
