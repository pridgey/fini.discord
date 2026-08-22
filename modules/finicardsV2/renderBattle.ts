import { findKeyword } from "./keywords";
import { RARITY_LABEL, TYPE_EMOJI } from "./rules";
import type { BattleCard, OwnedCard } from "./types";

/**
 * Text rendering.
 *
 * Almost everything a player sees is now built with Discord components in
 * `ui/` - containers, galleries, accent colours. What is left here is the text
 * that components cannot improve on: a monospace card face for when an image
 * fails to render, and a compact collection listing whose whole job is to be
 * copy-pasteable card ids.
 */

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
