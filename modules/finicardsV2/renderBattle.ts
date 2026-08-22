import type { CardType } from "../../types/PocketbaseTablesV2";
import { findKeyword } from "./keywords";
import { RARITY_LABEL, TYPE_EMOJI } from "./rules";
import type {
  BattleCard,
  MatchResult,
  OwnedCard,
  RoundResult,
  Side,
  SideCombat,
} from "./types";

/**
 * Discord rendering for v2.
 *
 * Deliberately text-only. v1's SVG card templates are built around five stats
 * and six rarities, so reusing them would mean either forking the templates or
 * changing them - and changing them would break the live implementation. Text
 * faces let the mechanics be play-tested now; v2 art is a Phase 2 job.
 *
 * The round-by-round math is shown on purpose: seeing "7 x 1.5 - 3 = 7" is how
 * players learn the type wheel without reading a rules post.
 */

export const compositionString = (
  composition: Record<CardType, number>,
): string =>
  (
    TYPE_EMOJI.power.repeat(composition.power) +
    TYPE_EMOJI.wit.repeat(composition.wit) +
    TYPE_EMOJI.heart.repeat(composition.heart)
  ) || "—";

export const lineupCompositionString = (lineup: BattleCard[]): string => {
  const composition: Record<CardType, number> = { power: 0, wit: 0, heart: 0 };
  for (const card of lineup) composition[card.type] += 1;
  return compositionString(composition);
};

const shortId = (id: string): string => (id ?? "").slice(0, 6);

/** One card as a monospace face. */
export const renderCardFace = (card: BattleCard): string => {
  const keyword = findKeyword(card.keyword);
  const rows: string[] = [
    `${card.name}${card.foil ? " ✨" : ""}`,
    `${card.series || "Unknown series"} · ${RARITY_LABEL[card.rarity]}`,
    "",
    `Power  ${String(card.stats.power).padStart(2, " ")}${card.type === "power" ? "  ◀ type" : ""}`,
    `Wit    ${String(card.stats.wit).padStart(2, " ")}${card.type === "wit" ? "  ◀ type" : ""}`,
    `Heart  ${String(card.stats.heart).padStart(2, " ")}${card.type === "heart" ? "  ◀ type" : ""}`,
    "",
    `Cost ${card.cost}${keyword ? ` · ${keyword.name}` : ""}`,
  ];

  if (keyword) rows.push(`  ${keyword.description}`);
  if (card.tags.length > 0) rows.push(`Tags: ${card.tags.join(", ")}`);
  rows.push(`ID: ${card.instanceId}`);

  return `${TYPE_EMOJI[card.type]} **${card.name}**\n\`\`\`\n${rows.join("\n")}\n\`\`\``;
};

/** The arithmetic behind one attack, written the way the design doc writes it. */
export const renderCombatMath = (combat: SideCombat): string => {
  const multiplied =
    combat.multiplier === 1
      ? `${combat.attackStat}`
      : `${combat.attackStat} × ${combat.multiplier} = ${combat.attackValue}`;
  const bonuses =
    combat.bonuses.length > 0 ? ` _(${combat.bonuses.join(", ")})_` : "";

  return `\`${multiplied} − ${combat.defenseFaced} = ${combat.damage}\`${bonuses}`;
};

const cardLabel = (card: BattleCard): string =>
  `${TYPE_EMOJI[card.type]} ${card.name}${card.foil ? " ✨" : ""}`;

export type MatchNames = Record<Side, string>;

export const renderRound = (
  round: RoundResult,
  names: MatchNames,
): string => {
  const winnerLabel =
    round.winner === "draw" ? "**Draw**" : `**${names[round.winner]}**`;

  const lines = [
    `**Round ${round.slot}** — ${cardLabel(round.challenger.card)} vs ${cardLabel(round.defender.card)}`,
    `${names.challenger}: ${renderCombatMath(round.challenger)}`,
    `${names.defender}: ${renderCombatMath(round.defender)}`,
    `→ ${winnerLabel}`,
  ];

  for (const note of round.notes) lines.push(`  ↳ _${note}_`);

  return lines.join("\n");
};

export const renderMatchResult = (
  result: MatchResult,
  names: MatchNames,
): string => {
  const header = [
    `## ${names.challenger} vs ${names.defender}`,
    `${names.challenger} ${lineupCompositionString(result.rounds.map((r) => r.challenger.card))}  ·  ${names.defender} ${lineupCompositionString(result.rounds.map((r) => r.defender.card))}`,
  ].join("\n");

  const rounds = result.rounds
    .map((round) => renderRound(round, names))
    .join("\n\n");

  const scoreline = `**${result.roundsWon.challenger} – ${result.roundsWon.defender}**`;
  const outcome =
    result.winner === "draw"
      ? `### Draw ${scoreline}`
      : `### ${names[result.winner]} wins ${scoreline}`;

  const decided =
    result.decidedBy === "rounds"
      ? ""
      : result.decidedBy === "damage"
        ? `\n_Decided on total damage: ${result.tiebreakDamage.challenger} vs ${result.tiebreakDamage.defender}._`
        : `\n_Rounds and damage both tied._`;

  return `${header}\n\n${rounds}\n\n${outcome}${decided}`;
};

/** A compact, ID-bearing collection listing - the ids are what you type into a lineup. */
export const renderCollectionPage = (
  cards: OwnedCard[],
  options?: { page?: number; totalPages?: number; ownerLabel?: string },
): string => {
  if (cards.length === 0) {
    return `${options?.ownerLabel ?? "You"} have no v2 cards yet. Try \`/finicard-v2 pack\`.`;
  }

  const lines = cards.map((owned) => {
    const definition = owned.definition;
    const keyword = findKeyword(definition.keyword);
    return [
      `${TYPE_EMOJI[definition.card_type]} **${definition.card_name}**${owned.foil ? " ✨" : ""}`,
      `\`${definition.power}/${definition.wit}/${definition.heart}\``,
      RARITY_LABEL[definition.rarity],
      keyword ? keyword.name : null,
      `\`${owned.id}\``,
    ]
      .filter(Boolean)
      .join(" · ");
  });

  const header = options?.ownerLabel
    ? `### ${options.ownerLabel} — v2 collection`
    : "### v2 collection";
  const footer =
    options?.page && options?.totalPages
      ? `\n\n_Page ${options.page}/${options.totalPages} · stats read power/wit/heart_`
      : "\n\n_Stats read power/wit/heart_";

  return `${header}\n${lines.join("\n")}${footer}`;
};

/**
 * An *unordered* set of three cards, with full stats.
 *
 * Used at the reveal, so it deliberately shows no slot numbers - the whole point
 * of that moment is that both players know the cards and neither knows the order.
 */
export const renderSelection = (
  cards: BattleCard[],
  label: string,
): string => {
  const rows = cards.map((card) => {
    const keyword = findKeyword(card.keyword);
    return `• ${cardLabel(card)} \`${card.stats.power}/${card.stats.wit}/${card.stats.heart}\` ${RARITY_LABEL[card.rarity]}${
      keyword ? ` · ${keyword.name}` : ""
    }`;
  });

  return `**${label}** ${lineupCompositionString(cards)}\n${rows.join("\n")}`;
};

export const renderLineupSummary = (
  lineup: BattleCard[],
  label: string,
): string => {
  const slots = lineup
    .map(
      (card, index) =>
        `${index + 1}. ${cardLabel(card)} \`${card.stats.power}/${card.stats.wit}/${card.stats.heart}\` (${shortId(card.instanceId)})`,
    )
    .join("\n");

  return `**${label}** ${lineupCompositionString(lineup)}\n${slots}`;
};
