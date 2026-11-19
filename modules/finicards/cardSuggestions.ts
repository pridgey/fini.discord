import { toBattleCard } from "./cardStore";
import { findKeyword } from "./keywords";
import type { OwnedCard } from "./types";
import { rarityLabel } from "./ui/theme";

/**
 * Suggestions for the card-id options of `/finicard sell` and `/finicard
 * trade`. Two copies of one card can differ - their ability, foil, a Legendary
 * animation - so a card is still traded by id; these just spare the typing.
 * Each suggestion says what sets its copy apart, and fills in only the id.
 */

const RANK: Record<string, number> = {
  common: 0,
  uncommon: 1,
  full_art: 2,
  summoned: 4,
};

/** "Goku · Full Art · Edge · foil · abc123" */
export const copyLabel = (copy: OwnedCard): string => {
  const card = toBattleCard(copy);
  return [
    // A nicknamed copy shows both, so it can be found by either.
    card.cardName && card.cardName !== card.name
      ? `${card.name} (${card.cardName})`
      : card.name,
    rarityLabel(card),
    findKeyword(card.keyword)?.name,
    card.foil ? "foil" : undefined,
    copy.id,
  ]
    .filter(Boolean)
    .join(" · ");
};

const rank = (copy: OwnedCard) => {
  const card = toBattleCard(copy);
  return card.legendary ? 5 : card.secretArt ? 3 : (RANK[card.rarity] ?? 0);
};

/**
 * Cards from `copies` - the player's own, or their trading partner's - that
 * match what's being typed. In a list (`multi`), the ids already typed are
 * kept and only what follows them is searched: by name, ability, rarity, or
 * the start of an id. Rarest first; never a copy already in the list.
 */
export const cardSuggestions = (
  copies: OwnedCard[],
  typed: string,
  multi = false,
): { name: string; value: string }[] => {
  const ids = new Set(copies.map((copy) => copy.id ?? ""));
  const words = typed.trim().split(/[\s,]+/).filter(Boolean);
  const chosen: string[] = [];
  if (multi) {
    while (words.length && ids.has(words[0].toLowerCase())) {
      chosen.push(words.shift()!.toLowerCase());
    }
  }
  const query = words.join(" ").toLowerCase();
  const prefix = chosen.length ? `${chosen.join(" ")} ` : "";

  return copies
    .filter((copy) => copy.id && !chosen.includes(copy.id))
    .map((copy) => ({ copy, label: copyLabel(copy) }))
    // The words of a card, or the start of its id - letters that happen to
    // sit in the middle of an id aren't a match.
    .filter(
      ({ copy, label }) =>
        !query ||
        label
          .slice(0, label.length - (copy.id ?? "").length)
          .toLowerCase()
          .includes(query) ||
        (copy.id ?? "").startsWith(query),
    )
    .sort(
      (a, b) =>
        rank(b.copy) - rank(a.copy) || a.label.localeCompare(b.label),
    )
    .slice(0, 25)
    .map(({ copy, label }) => ({
      name: (prefix ? `${prefix}+ ${label}` : label).slice(0, 100),
      value: `${prefix}${copy.id}`,
    }));
};
