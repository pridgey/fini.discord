import { availablePopulationByRarity } from "../modules/finicards/availablePopulationByRarity";
import { createCardImage } from "../modules/finicards/generateCardImage";
import { getCardPopulationCounts } from "../modules/finicards/getCardPopulationCounts";
import {
  CardDefinitionRecord,
  UserCardRecord,
} from "../types/PocketbaseTables";
import { pb } from "../utilities/pocketbase";
import { writeFile } from "fs/promises";

const serverId = "1313711612527513680";

const getUnSelectedCards = async () => {
  let allCardDefinitions = await pb
    .collection<CardDefinitionRecord>("card_definition")
    .getFullList();

  allCardDefinitions.filter((c) => c.set !== 3);

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

  const populationCounts = await getCardPopulationCounts(serverId);
  const populationByName = {};

  populationCounts.forEach((population, cardId) => {
    const cardName = allCardDefinitions.find((d) => d.id === cardId);

    if (cardName) {
      populationByName[`${cardName.card_name}-[${cardName.rarity}]`] =
        population;
    }
  });

  console.log("Population Counts:", { populationByName });

  const available = await availablePopulationByRarity(serverId);

  console.log("Available:", { available });
};

const allByRarity = async () => {
  const user = await pb.collection<UserCardRecord>("user_card").getFullList({
    filter: `card.rarity = "fa" && server_id = "813622219569758258"`,
  });

  for (let i = 0; i < user.length; i++) {
    console.log(`Card: ${user[i].card}`);
  }

  console.log(`${user.length}`);
};

const getCard = async (id: string) => {
  const cardDefinition = await pb
    .collection<CardDefinitionRecord>("card_definition")
    .getOne(id);

  const imageBuffer = await createCardImage(cardDefinition);

  if (Buffer.isBuffer(imageBuffer)) {
    await writeFile("test_card.png", new Uint8Array(imageBuffer));
  }
};

getUnSelectedCards();
