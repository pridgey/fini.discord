import { findKeyword } from "./keywords";
import { RARITY_LABEL, TYPE_EMOJI } from "./rules";
import type { BattleCard } from "./types";

/**
 * Text rendering.
 *
 * Almost everything a player sees is now built with Discord components in
 * `ui/` - containers, galleries, accent colours. What is left here is the one
 * thing components cannot improve on: a monospace card face, used when an image
 * fails to render.
 *
 * The collection listing that used to live here is gone - the collection is a
 * paginated Components V2 surface now, built by
 * `queries/queryFunctions/finicardCollection.query.ts`.
 */

/** One card as a monospace face. */
export const renderCardFace = (card: BattleCard): string => {
  const keyword = findKeyword(card.keyword);
  const rows: string[] = [
    `${card.name}${card.foil ? " ✨" : ""}`,
    `${card.series || "Unknown series"} · ${card.legendary ? "Legendary" : card.secretArt ? "Secret Art" : RARITY_LABEL[card.rarity]}`,
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
