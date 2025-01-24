import { readFile } from "fs/promises";
import path, { join } from "path";
import sharp from "sharp";
import { CardDefinitionRecord } from "../../types/PocketbaseTables";
import { pb } from "../../utilities/pocketbase";
import {
  cardColorDictionary,
  cardImageSizeDictionary,
  cardLayoutDictionary,
  pillXDictionary,
  pillYDictionary,
} from "./dictionaries";
import { createGifOverlay } from "./createGifOverlay";

// Function to create the card image used in discord
export const createCardImage = async (
  cardDefinitionRecord: CardDefinitionRecord
) => {
  try {
    // Get the card template svg code
    const templateFileContents = await readFile(
      join(
        __dirname,
        "card templates",
        cardLayoutDictionary[cardDefinitionRecord.rarity]
      )
    );
    let templateSVG = templateFileContents.toString();

    // Get the card's image
    const imageUrl = pb.files.getUrl(
      cardDefinitionRecord,
      cardDefinitionRecord.image
    );
    const res = await fetch(imageUrl);
    const data = await res.arrayBuffer();

    // Resize card image to ensure size and fit
    const cardImageSize = cardImageSizeDictionary[cardDefinitionRecord.rarity];
    const cardImage_sharp = sharp(data);
    const resizedBuffer = await cardImage_sharp
      .resize({
        width: cardImageSize.width,
        height: cardImageSize.height,
        fit: "cover",
      })
      .png()
      .toBuffer();

    const base64String = `data:image/png;base64,${resizedBuffer.toString(
      "base64"
    )}`;

    // Card color type
    const colorType = cardColorDictionary[cardDefinitionRecord.color];

    // Card Name
    templateSVG = templateSVG.replace(
      "{card_name}",
      cardDefinitionRecord.card_name
    );
    // Card Color
    templateSVG = templateSVG.replace("{color_start}", colorType.start);
    templateSVG = templateSVG.replace("{color_stop}", colorType.stop);
    // Card Type
    templateSVG = templateSVG.replace("{type}", cardDefinitionRecord.type);
    // Series
    templateSVG = templateSVG.replace("{series}", cardDefinitionRecord.series);
    // Card Id
    templateSVG = templateSVG.replace(
      "{card_id}",
      cardDefinitionRecord.id ?? "unknown id"
    );
    // Rarity
    templateSVG = templateSVG.replace(
      "{rarity}",
      cardDefinitionRecord.rarity.toUpperCase()
    );
    // Strength
    const strengthScore = determineAbilityGrade(cardDefinitionRecord.strength);
    templateSVG = templateSVG.replace("{strength}", strengthScore);
    templateSVG = templateSVG.replace(
      "{strength_color}",
      strengthScore === "S" ? "url(#paint1_linear_383_359)" : "white"
    );
    // Agility
    const agilityScore = determineAbilityGrade(cardDefinitionRecord.agility);
    templateSVG = templateSVG.replace("{agility}", agilityScore);
    templateSVG = templateSVG.replace(
      "{agility_color}",
      agilityScore === "S" ? "url(#paint1_linear_383_359)" : "white"
    );
    // Endurance
    const enduranceScore = determineAbilityGrade(
      cardDefinitionRecord.endurance
    );
    templateSVG = templateSVG.replace("{endurance}", enduranceScore);
    templateSVG = templateSVG.replace(
      "{endurance_color}",
      enduranceScore === "S" ? "url(#paint1_linear_383_359)" : "white"
    );
    // Intellect
    const intellectScore = determineAbilityGrade(
      cardDefinitionRecord.intellect
    );
    templateSVG = templateSVG.replace("{intellect}", intellectScore);
    templateSVG = templateSVG.replace(
      "{intellect_color}",
      intellectScore === "S" ? "url(#paint1_linear_383_359)" : "white"
    );
    // Luck
    const luckScore = determineAbilityGrade(cardDefinitionRecord.luck);
    templateSVG = templateSVG.replace("{luck}", luckScore);
    templateSVG = templateSVG.replace(
      "{luck_color}",
      luckScore === "S" ? "url(#paint1_linear_383_359)" : "white"
    );

    // Card Image
    templateSVG = templateSVG.replace("{image_base64}", base64String);

    // If item card, replace description
    if (["i", "ri"].includes(cardDefinitionRecord.rarity)) {
      templateSVG = templateSVG.replace(
        "{card_description}",
        cardDefinitionRecord.description
      );
    }

    // If a common or uncommon, generate pips
    if (["c", "u"].includes(cardDefinitionRecord.rarity)) {
      // Strength
      templateSVG = templateSVG.replace(
        "{strength_pips}",
        generateAbilityPipsSVG(
          "strength",
          strengthScore,
          cardDefinitionRecord.rarity as "c" | "u",
          cardDefinitionRecord.color
        )
      );

      // Agility
      templateSVG = templateSVG.replace(
        "{agility_pips}",
        generateAbilityPipsSVG(
          "agility",
          agilityScore,
          cardDefinitionRecord.rarity as "c" | "u",
          cardDefinitionRecord.color
        )
      );

      // Endurance
      templateSVG = templateSVG.replace(
        "{endurance_pips}",
        generateAbilityPipsSVG(
          "endurance",
          enduranceScore,
          cardDefinitionRecord.rarity as "c" | "u",
          cardDefinitionRecord.color
        )
      );

      // Intellect
      templateSVG = templateSVG.replace(
        "{intellect_pips}",
        generateAbilityPipsSVG(
          "intellect",
          intellectScore,
          cardDefinitionRecord.rarity as "c" | "u",
          cardDefinitionRecord.color
        )
      );

      // Luck
      templateSVG = templateSVG.replace(
        "{luck_pips}",
        generateAbilityPipsSVG(
          "luck",
          luckScore,
          cardDefinitionRecord.rarity as "c" | "u",
          cardDefinitionRecord.color
        )
      );
    }

    // Export and save image file
    const sharpItem = sharp(Buffer.from(templateSVG), { density: 300 });
    const modifiedImage = await sharpItem.resize({ width: 600 });
    let imageBuffer;
    if (cardDefinitionRecord.color === "light") {
      // Light Card
      imageBuffer = await modifiedImage
        .modulate({
          brightness: 1.75, // Multiplier (1 = no change, >1 = brighter, <1 = darker)
          saturation: 0.3, // Color saturation (1 = no change, >1 = more color, <1 = less color)
          hue: 0, // Specify hue rotation in degrees (-360 to 360)
          lightness: 1.5, // Adjusts the lightness by scaling luminance (specific to older versions)
        })
        .png()
        .toBuffer();
    } else {
      imageBuffer = await modifiedImage.png().toBuffer();
    }

    // =================================================

    if (cardDefinitionRecord.color === "light") {
      try {
        const gifBuffer = await createGifOverlay(
          imageBuffer,
          path.join(__dirname, "generated card images", "doggo.gif")
        );

        console.log("Debug Gif Buffer:", gifBuffer.slice(0, 15));

        await sharp(gifBuffer, { animated: true })
          .gif()
          .toFile(path.join(__dirname, "generated card images", "new_gif.gif"));
      } catch (error) {
        console.error("Operation failed:", error);
      }
    }

    // =================================================

    return imageBuffer;
  } catch (err) {
    console.error(err);
  }
};

// Utility function to generate the correct number and placement of ability score pips
const generateAbilityPipsSVG = (
  abilityName: string,
  ability: string,
  rarity: "c" | "u",
  color: CardDefinitionRecord["color"]
) => {
  let resultingSvg = "";

  let numberOfPips = 0;

  switch (ability) {
    case "S":
      numberOfPips = 6;
      break;
    case "A":
      numberOfPips = 5;
      break;
    case "B":
      numberOfPips = 4;
      break;
    case "C":
      numberOfPips = 3;
      break;
    case "D":
      numberOfPips = 2;
      break;
    case "F":
    default:
      numberOfPips = 1;
      break;
  }

  for (let i = 1; i < numberOfPips + 1; i++) {
    resultingSvg += `<rect x="${pillXDictionary[i]}" y="${pillYDictionary[rarity][abilityName]}" width="72" height="20" rx="4" fill="${cardColorDictionary[color].pip}"/>`;
  }

  return resultingSvg;
};

// Utility function to calculate the letter score of a card's ability score
const determineAbilityGrade = (ability: number) => {
  if (ability > 20) {
    return "S";
  }
  if (ability > 16) {
    return "A";
  }
  if (ability > 12) {
    return "B";
  }
  if (ability > 8) {
    return "C";
  }
  if (ability > 4) {
    return "D";
  }
  return "F";
};
