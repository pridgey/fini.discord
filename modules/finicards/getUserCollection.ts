import {
  CardDefinitionRecord,
  UserCardRecord,
} from "../../types/PocketbaseTables";
import { pb } from "../../utilities/pocketbase";
import { sortBy } from "lodash";

type CardCollectionRecord = CardDefinitionRecord & { userCardID: string };

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
  const allUserCards: CardCollectionRecord[] = allUserCardRecords.map((ucr) => {
    const cardDefinition = allCards.find((ac) => ac.id === ucr.card);

    return {
      ...cardDefinition!,
      userCardID: ucr.id ?? "unknown card id",
    };
  });

  // Sort user cards
  const legendaryCards = sortBy(
    allUserCards.filter((c) => c.rarity === "l"),
    "card_name"
  );
  const fullArtCards = sortBy(
    allUserCards.filter((c) => c.rarity === "fa"),
    "card_name"
  );
  const uncommonCards = sortBy(
    allUserCards.filter((c) => c.rarity === "u"),
    "card_name"
  );
  const commonCards = sortBy(
    allUserCards.filter((c) => c.rarity === "c"),
    "card_name"
  );
  const rareItemCards = sortBy(
    allUserCards.filter((c) => c.rarity === "ri"),
    "card_name"
  );
  const itemCards = sortBy(
    allUserCards.filter((c) => c.rarity === "i"),
    "card_name"
  );

  // Return user's cards in order of rarity
  return [
    ...legendaryCards,
    ...fullArtCards,
    ...uncommonCards,
    ...commonCards,
    ...rareItemCards,
    ...itemCards,
  ];
};
