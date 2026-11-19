import type { CardRarity } from "../../types/PocketbaseTablesV2";
import { KEYWORDS, rollKeyword } from "./keywords";

/**
 * What a card boon does to a copy (dungeon items, issue #8). Pure: the
 * command checks the copy is the player's, writes the change, and spends the
 * boon.
 *
 *   - **Name Tag** - a nickname, in place of the card's name
 *   - **Reroll Token** - a new keyword, always a different one
 *   - **Ability Scroll** - three new keywords to choose from
 *   - **Foil Kit** - the copy turns foil
 *
 * A keyword is rolled at the card's rarity's odds, like a new copy's - so a
 * common still tends to roll something strong - but never blank, and never
 * the one it had.
 */

/** Longest nickname, so it fits where a card's name goes. */
export const NICKNAME_MAX = 32;

/**
 * A nickname as typed, made safe to print: no Discord formatting or mentions,
 * single spaces, at most `NICKNAME_MAX`. Null when nothing's left.
 */
export const cleanNickname = (raw: string): string | null => {
  const cleaned = raw
    .replace(/[*_~`|<>@#:\\[\]()]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, NICKNAME_MAX)
    .trim();
  return cleaned.length > 0 ? cleaned : null;
};

/** A keyword for a copy of `rarity` that isn't blank and isn't `current`. */
export const rerolledKeyword = (
  rarity: CardRarity,
  current: string,
  random: () => number = Math.random,
  avoid: string[] = [],
): string => {
  const taken = new Set([current, ...avoid]);
  // The rarity's odds, as a new copy rolls - tried a few times, since they
  // can land on blank or on what it had.
  for (let attempt = 0; attempt < 40; attempt++) {
    const slug = rollKeyword(rarity, random(), random());
    if (slug && !taken.has(slug)) return slug;
  }
  // Odds that keep missing: any other keyword, evenly.
  const rest = KEYWORDS.filter((keyword) => !taken.has(keyword.slug));
  return rest[Math.floor(random() * rest.length)].slug;
};

/** Three new keywords to choose from, all different, none the one it has. */
export const scrollChoices = (
  rarity: CardRarity,
  current: string,
  random: () => number = Math.random,
): string[] => {
  const choices: string[] = [];
  while (choices.length < 3)
    choices.push(rerolledKeyword(rarity, current, random, choices));
  return choices;
};
