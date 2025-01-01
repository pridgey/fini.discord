import { CardDefinitionRecord } from "../../types/PocketbaseTables";
import { randomNumber } from "../../utilities/randomNumber";

/**
 * Function to calculate which rarities will appear in a given booster pack
 * @returns an array of 5 rarities
 */
export const generateBoosterPackRarities = (): Partial<
  CardDefinitionRecord["rarity"]
>[] => {
  // Probabilities for non-item cards (these add up to 100)
  const probabilities = {
    l: 0.5, // 0.5% chance for legendary
    fa: 4.5, // 4.5% chance for full-art
    u: 25, // 25% chance for uncommon
    c: 70, // 70% chance for common
  };

  // Helper function that will generate a single rarity given the above probabilities
  const generateSingleRarity = (): Partial<CardDefinitionRecord["rarity"]> => {
    const rand = randomNumber(0, 100, true);
    let cumulativeProb = 0;

    // Randomly pick a rarity
    for (const [rarity, prob] of Object.entries(probabilities)) {
      cumulativeProb += prob;
      if (rand < cumulativeProb)
        return rarity as Partial<CardDefinitionRecord["rarity"]>;
    }

    // Default to common, though likely to return above
    return "c";
  };

  // Each booster pack should have 2 or 3 random cards
  const numItemCards = randomNumber(2, 3, true);
  const numNormalCards = 5 - numItemCards;

  // Generate the normal cards first
  const normalCards = Array.from({ length: numNormalCards }, () =>
    generateSingleRarity()
  );

  // Generate the item cards
  const itemCards = Array.from({ length: numItemCards }, () => "i" as const);

  // Combine and shuffle the arrays
  const allCards = [...normalCards, ...itemCards];

  // Fisher-Yates shuffle
  for (let i = allCards.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [allCards[i], allCards[j]] = [allCards[j], allCards[i]];
  }

  return allCards;
};
