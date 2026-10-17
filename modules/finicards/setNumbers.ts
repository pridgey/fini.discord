import type {
  CardRarity,
  V2CardDefinitionRecord,
} from "../../types/PocketbaseTablesV2";

/**
 * Set numbers: where a card sits in its release set, printed in the footer as
 * "12/217".
 *
 * A set is counted in name order, and a character's cards by rarity, so the
 * common comes before the uncommon before the full-art. Secret Arts are left
 * out of the count - they are secret - and numbered after it, which is how one
 * comes to read "218/217".
 *
 * Every card of a set is counted, active or not: a card held back for later
 * keeps its place, and the gap it leaves is the hint that it exists.
 */

export type SetNumber = {
  /** The card's place in its set, from 1. */
  number: number;
  /** How many cards the set counts. Secret Arts are not among them. */
  setSize: number;
};

const RARITY_ORDER: Record<CardRarity, number> = {
  common: 0,
  uncommon: 1,
  full_art: 2,
};

type Numbered = Pick<
  V2CardDefinitionRecord,
  "id" | "card_name" | "rarity" | "set" | "secret_art"
>;

const inSetOrder = (a: Numbered, b: Numbered): number =>
  a.card_name.localeCompare(b.card_name, "en", { sensitivity: "base" }) ||
  RARITY_ORDER[a.rarity] - RARITY_ORDER[b.rarity] ||
  // Two cards of one name and rarity: any order, so long as it never changes.
  (a.id ?? "").localeCompare(b.id ?? "");

/** Numbers every card that belongs to a set, keyed by definition id. */
export const numberSets = (definitions: Numbered[]): Map<string, SetNumber> => {
  const sets = new Map<number, Numbered[]>();
  for (const definition of definitions) {
    if (!definition.set) continue;
    sets.set(definition.set, [...(sets.get(definition.set) ?? []), definition]);
  }

  const numbers = new Map<string, SetNumber>();
  for (const cards of sets.values()) {
    const counted = cards.filter((card) => !card.secret_art).sort(inSetOrder);
    const secret = cards.filter((card) => card.secret_art).sort(inSetOrder);

    [...counted, ...secret].forEach((card, index) =>
      numbers.set(card.id ?? "", {
        number: index + 1,
        setSize: counted.length,
      }),
    );
  }

  return numbers;
};

/** "12/217", or "" for a card that has not been numbered. */
export const setNumberLabel = (number?: number, setSize?: number): string =>
  number && setSize ? `${number}/${setSize}` : "";
