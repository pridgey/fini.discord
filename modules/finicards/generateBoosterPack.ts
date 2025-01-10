import {
  CardDefinitionRecord,
  UserCardRecord,
} from "../../types/PocketbaseTables";
import { pb } from "../../utilities/pocketbase";
import { generateBoosterPackRarities } from "./generateBoosterPackRarities";
import { createCardImage } from "./generateCardImage";
import { getCardPopulationCounts } from "./getCardPopulationCounts";
import { selectAvailableCard } from "./selectAvailableCard";

type CardDefinitionWithBuffer = CardDefinitionRecord & {
  buffer: Buffer;
};

type GenerateBoosterPackProps = {
  userId: string;
  serverId: string;
  username: string;
  serverName: string;
};

/**
 * Function to generate a booster pack of fini cards
 * @returns array of selected cards with their image buffer to display in discord
 */
export const generateBoosterPack = async (
  options: GenerateBoosterPackProps
): Promise<CardDefinitionWithBuffer[]> => {
  // Get all card definitions
  const cardDefinitions = await pb
    .collection<CardDefinitionRecord>("card_definition")
    .getFullList({
      filter: `set = 1`,
    });

  // Get current population counts of each card type
  const populationCounts = await getCardPopulationCounts(options.serverId);

  // Group cards by rarity
  const cardsByRarity = {
    i: cardDefinitions.filter((cd) => cd.rarity === "i"),
    c: cardDefinitions.filter((cd) => cd.rarity === "c"),
    u: cardDefinitions.filter((cd) => cd.rarity === "u"),
    fa: cardDefinitions.filter((cd) => cd.rarity === "fa"),
    l: cardDefinitions.filter((cd) => cd.rarity === "l"),
    ri: cardDefinitions.filter((cd) => cd.rarity === "ri"),
  };

  // Generate pack rarities
  const packRarities = await generateBoosterPackRarities(options.serverId);

  // Array of resulting selections
  const images: CardDefinitionWithBuffer[] = [];

  // For each rarity generated, select a card
  for (const rarity of packRarities) {
    let selectedCard: CardDefinitionRecord | null = null;

    try {
      selectedCard = await selectAvailableCard(
        cardsByRarity[rarity as keyof typeof cardsByRarity],
        populationCounts
      );

      console.log(
        `${options.username} pulled ${selectedCard?.card_name} [${selectedCard?.rarity}]`
      );

      if (selectedCard) {
        // Card id
        const cardId = selectedCard.id ?? "unknown card id";

        // Update the population count map
        const currentCount = populationCounts.get(cardId) || 0;
        populationCounts.set(cardId, currentCount + 1);

        // Create card image and add to pack
        const buffer = await createCardImage(selectedCard);

        // If all is well, add to the carousel
        if (buffer) {
          images.push({
            ...selectedCard,
            buffer,
          });

          // Add card to user
          pb.collection<UserCardRecord>("user_card").create({
            user_id: options.userId,
            server_id: options.serverId,
            identifier: `${options.username}-${options.serverName}`,
            card: cardId,
          });
        }
      }
    } catch (error) {
      console.error(`Failed to select card of rarity ${rarity}:`, error);
      // You might want to handle this error differently depending on your needs
      throw error;
    }
  }

  return images;
};
