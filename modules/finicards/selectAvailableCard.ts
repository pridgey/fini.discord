import { CardDefinitionRecord } from "../../types/PocketbaseTables";

/**
 * Function to randomly select a card from the available population
 * @param cards Cards to select from
 * @param populationCounts The current counts of claimed cards
 * @returns A selected card, or null when no more cards are available for that rarity
 */
export const selectAvailableCard = async (
  cards: CardDefinitionRecord[],
  populationCounts: Map<string, number>
): Promise<CardDefinitionRecord | null> => {
  // Create a copy of the array to shuffle
  const shuffledCards = [...cards];

  // Fisher-Yates shuffle
  for (let i = shuffledCards.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffledCards[i], shuffledCards[j]] = [shuffledCards[j], shuffledCards[i]];
  }

  // Find first card that hasn't reached population limit
  for (const card of shuffledCards) {
    const currentPopulation =
      populationCounts.get(card.id ?? "unknown id") || 0;
    if (currentPopulation < card.population) {
      return card;
    }
  }

  console.error(`No available cards found for rarity ${cards[0].rarity}`);

  return null;
};
