import {
  CardDefinitionRecord,
  UserCardRecord,
} from "../types/PocketbaseTables";
import { pb } from "../utilities/pocketbase";

const getUnSelectedCards = async () => {
  const allCardDefinitions = await pb
    .collection<CardDefinitionRecord>("card_definition")
    .getFullList();

  const allUserCards = await pb
    .collection<UserCardRecord>("user_card")
    .getFullList();

  const uniqueUserCards = new Set();

  for (let i = 0; i < allUserCards.length; i++) {
    uniqueUserCards.add(allUserCards[i].card);
  }

  const uniqueUserCardsArray = Array.from(uniqueUserCards);

  for (let j = 0; j < allCardDefinitions.length; j++) {
    if (
      !uniqueUserCardsArray.includes(
        allCardDefinitions[j].id ?? "unknown card id"
      )
    ) {
      console.log(
        `No one has: ${allCardDefinitions[j].card_name} [${allCardDefinitions[j].rarity}]`
      );
    }
  }
};

getUnSelectedCards();
