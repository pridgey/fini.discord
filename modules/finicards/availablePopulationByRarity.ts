import {
  CardDefinitionRecord,
  UserCardRecord,
} from "../../types/PocketbaseTables";
import { pb } from "./../../utilities/pocketbase";

/**
 * Helper function to get the available card count by rarity
 */
export const availablePopulationByRarity = async (serverid: string) => {
  // All Card Definitions
  const allCardDefinitions = await pb
    .collection<CardDefinitionRecord>("card_definition")
    .getFullList();

  const getMaxPopulationForRarity = (
    rarity: CardDefinitionRecord["rarity"]
  ) => {
    return allCardDefinitions
      .filter((acd) => acd.rarity === rarity)
      .reduce((currentSum, record) => currentSum + record.population, 0);
  };

  const getCurrentPopulationForRarity = async (
    rarity: CardDefinitionRecord["rarity"]
  ) => {
    const rarityUserCards = await pb
      .collection<UserCardRecord>("user_card")
      .getFullList({
        filter: `card.rarity = "${rarity}" && server_id = "${serverid}"`,
      });
    return rarityUserCards.length;
  };

  const rarityArray: CardDefinitionRecord["rarity"][] = [
    "c",
    "fa",
    "i",
    "l",
    "ri",
    "u",
  ];

  const availablePopulationCounts: Record<
    CardDefinitionRecord["rarity"],
    number
  > = {
    c: 0,
    fa: 0,
    i: 0,
    l: 0,
    ri: 0,
    u: 0,
  };

  for (let i = 0; i < rarityArray.length; i++) {
    const rarity: CardDefinitionRecord["rarity"] = rarityArray[i];
    const maxPopulation = getMaxPopulationForRarity(rarity);
    const currentPopulation = await getCurrentPopulationForRarity(rarity);
    availablePopulationCounts[rarity] = maxPopulation - currentPopulation;
  }

  return availablePopulationCounts;
};
