import sharp from "sharp";
import { createCardImage } from "../modules/finicards/generateCardImage";
import { CardDefinitionRecord } from "../types/PocketbaseTables";
import { pb } from "../utilities/pocketbase";
import path from "path";
import { exists } from "fs/promises";

const previewSet = async (set: number) => {
  const setCards = await pb
    .collection<CardDefinitionRecord>("card_definition")
    .getFullList({
      filter: `set = ${set}`,
    });

  for (let i = 0; i < setCards.length; i++) {
    const fileName = path.join(
      __dirname,
      "test_images",
      `${setCards[i].rarity}-${setCards[i].card_name}-${setCards[i].id}.png`
    );

    const fileExists = await exists(fileName);

    if (!fileExists) {
      const cardBuffer = await createCardImage(setCards[i]);

      await sharp(cardBuffer).png().toFile(fileName);
    }
  }
};

previewSet(3);
