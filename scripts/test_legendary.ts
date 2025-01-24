import path from "path";
import { createCardImage } from "../modules/finicards/generateCardImage";
import { CardDefinitionRecord } from "../types/PocketbaseTables";
import { pb } from "../utilities/pocketbase";
import sharp from "sharp";

const createLegendary = async (cardId: string) => {
  const cardDefinition = await pb
    .collection<CardDefinitionRecord>("card_definition")
    .getFirstListItem(`id = "${cardId}"`);

  const cardBuffer = await createCardImage(cardDefinition);

  if (cardBuffer) {
    await sharp(cardBuffer)
      .png()
      .toFile(path.join(__dirname, "test_images", `${cardId}.png`));
  }
};

// Legendary Umberlee
createLegendary("p07uy003hixrns9");
