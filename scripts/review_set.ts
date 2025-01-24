import sharp from "sharp";
import { createCardImage } from "../modules/finicards/generateCardImage";
import { CardDefinitionRecord } from "../types/PocketbaseTables";
import { pb } from "../utilities/pocketbase";
import path from "path";

const previewSet = async (set: number) => {
  const setCards = await pb
    .collection<CardDefinitionRecord>("card_definition")
    .getFullList({
      filter: `set = ${set}`,
    });

  for (let i = 0; i < setCards.length; i++) {
    const cardBuffer = await createCardImage(setCards[i]);

    await sharp(cardBuffer)
      .png()
      .toFile(
        path.join(__dirname, "test_images", `${setCards[i].card_name}.png`)
      );
  }
};

previewSet(2);
