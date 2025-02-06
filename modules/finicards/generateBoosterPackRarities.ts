import { CardDefinitionRecord } from "../../types/PocketbaseTables";
import { randomNumber } from "../../utilities/randomNumber";
import { availablePopulationByRarity } from "./availablePopulationByRarity";

/**
 * Function to calculate which rarities will appear in a given booster pack
 * @returns an array of 5 rarities
 */
export const generateBoosterPackRarities = async (
  serverId: string
): Promise<Partial<CardDefinitionRecord["rarity"]>[]> => {
  // Probabilities for non-item cards (these add up to 100)
  const probabilities = {
    l: 0.5, // 0.5% chance for legendary
    fa: 4.5, // 4.5% chance for full-art
    ri: 5, // 5% chance for rare-item
    u: 20, // 20% chance for uncommon
    c: 70, // 70% chance for common
  };

  // Generate available population by rarity
  const rarityPopulations = await availablePopulationByRarity(serverId);
  console.log("DEBUG:", { rarityPopulations });

  const allRarities: CardDefinitionRecord["rarity"][] = [
    "ri",
    "i",
    "c",
    "u",
    "fa",
    "l",
  ];

  // Function to ensure selected rarity has population, recursing upwards if none
  const ensureRarityPopulation = (rarity: CardDefinitionRecord["rarity"]) => {
    const populationCount = rarityPopulations[rarity];

    if (populationCount > 0) {
      return rarity;
    } else if (rarity === allRarities.at(-1)) {
      return null;
    } else {
      const currentRarityIndex = allRarities.indexOf(rarity);
      return ensureRarityPopulation(allRarities.at(currentRarityIndex + 1)!);
    }
  };

  // Helper function that will generate a single rarity given the above probabilities
  const generateSingleRarity = (): Partial<
    CardDefinitionRecord["rarity"]
  > | null => {
    const rand = randomNumber(0, 100, true);
    let cumulativeProb = 0;

    // Randomly pick a rarity
    for (const [rarity, prob] of Object.entries(probabilities)) {
      cumulativeProb += prob;
      if (rand < cumulativeProb) {
        return ensureRarityPopulation(
          rarity as Partial<CardDefinitionRecord["rarity"]>
        );
      }
    }

    // Default to common, though likely to return above
    return "c";
  };

  // Each booster pack should have 2 item cards
  const numItemCards = 2;
  const numNormalCards = 5 - numItemCards;

  // Generate the normal cards first
  const normalCards = Array.from({ length: numNormalCards }, () =>
    generateSingleRarity()
  );

  // Generate the item cards
  const itemCards = Array.from({ length: numItemCards }, () => "i" as const);

  // Combine and shuffle the arrays
  let allCards = [...normalCards, ...itemCards];

  // Fisher-Yates shuffle
  for (let i = allCards.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [allCards[i], allCards[j]] = [allCards[j], allCards[i]];
  }

  // Temporarily filter cards
  const resultingRarities: CardDefinitionRecord["rarity"][] = [];

  allCards.forEach((r) => {
    if (r === null) {
      return;
    }
    if (r === "l") {
      resultingRarities.push("fa");
      resultingRarities.push("fa");
    } else {
      resultingRarities.push(r);
    }
  });

  return resultingRarities;
};
