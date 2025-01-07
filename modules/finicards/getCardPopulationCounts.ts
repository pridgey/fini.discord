import { UserCardRecord } from "../../types/PocketbaseTables";
import { pb } from "./../../utilities/pocketbase";

/**
 * Helper function to get the current card population counts (count of pulled counts by players)
 */
export const getCardPopulationCounts = async (serverid: string) => {
  // Get the count of each card in user inventories
  const userCards = await pb
    .collection<UserCardRecord>("user_card")
    .getFullList({
      filter: `server_id = "${serverid}"`,
    });
  const populationCounts = new Map<string, number>();

  userCards.forEach((card: UserCardRecord) => {
    const currentCount = populationCounts.get(card.card) || 0;
    populationCounts.set(card.card, currentCount + 1);
  });

  return populationCounts;
};
