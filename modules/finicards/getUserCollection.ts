import {
  CardDefinitionRecord,
  UserCardRecord,
} from "../../types/PocketbaseTables";
import { pb } from "../../utilities/pocketbase";

/**
 * Collects all of a user's pulled cards
 * @param userId
 * @param serverId
 * @returns array sorted by rarity
 */
export const getUserCollection = async (userId: string, serverId: string) => {
  // All card definitions
  const allCards = await pb
    .collection<CardDefinitionRecord>("card_definition")
    .getFullList();

  // All the users current cards
  const allUserCardRecords = await pb
    .collection<UserCardRecord>("user_card")
    .getFullList({
      filter: `server_id = "${serverId}" && user_id = "${userId}"`,
    });

  // All user card definitions
  const allUserCards = allCards.filter((ac) =>
    allUserCardRecords.some((au) => au.card === ac.id)
  );

  // Sort user cards
  const legendaryCards = allUserCards.filter((c) => c.rarity === "l");
  const fullArtCards = allUserCards.filter((c) => c.rarity === "fa");
  const uncommonCards = allUserCards.filter((c) => c.rarity === "u");
  const commonCards = allUserCards.filter((c) => c.rarity === "c");
  const itemCards = allUserCards.filter((c) => c.rarity === "i");

  // Return user's cards in order of rarity
  return [
    ...legendaryCards,
    ...fullArtCards,
    ...uncommonCards,
    ...commonCards,
    ...itemCards,
  ];
};
