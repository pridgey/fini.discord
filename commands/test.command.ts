import { SlashCommandBuilder } from "@discordjs/builders";
import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  CommandInteraction,
  ComponentType,
} from "discord.js";
import type {
  CardDefinitionRecord,
  HammerspaceRecord,
} from "../types/PocketbaseTables";
import { pb } from "../utilities/pocketbase";
import { randomNumber } from "../utilities/randomNumber";
import { createCardImage } from "../modules/finicards/generateCardImage";

export const data = new SlashCommandBuilder()
  .setName("test")
  .setDescription("Testing new commands");

export const execute = async (
  interaction: CommandInteraction,
  logCommand: () => void
) => {
  if (interaction.user.id === "255016605191241729") {
    await interaction.deferReply();

    // Generate rarities
    function generatePackRarities(): Partial<CardDefinitionRecord["rarity"]>[] {
      // Probabilities (these add up to 100)
      const probabilities = {
        c: 70, // 70% chance for common
        u: 25, // 25% chance for uncommon
        fa: 5, // 5% chance for full-art
      };

      const generateSingleRarity = (): Partial<
        CardDefinitionRecord["rarity"]
      > => {
        const rand = Math.random() * 100;
        if (rand < probabilities.c) return "c";
        if (rand < probabilities.c + probabilities.u) return "u";
        return "fa";
      };

      // Generate 5 rarities for the pack
      return Array.from({ length: 5 }, () => generateSingleRarity());
    }

    // Get all card definitions (probably not a great way to do this)
    const cardDefinitions = await pb
      .collection<CardDefinitionRecord>("card_definition")
      .getFullList();
    const commonCards = cardDefinitions.filter((cd) => cd.rarity === "c");
    const uncommonCards = cardDefinitions.filter((cd) => cd.rarity === "u");
    const fullartCards = cardDefinitions.filter((cd) => cd.rarity === "fa");

    // Carousel images
    const images: any[] = [];

    const packRarities = generatePackRarities();

    console.log("PACK DEBUG:", {
      packRarities,
      allCards: cardDefinitions.length,
      common: commonCards.length,
      uncommon: uncommonCards.length,
      fullart: fullartCards.length,
    });

    for (let i = 0; i < packRarities.length; i++) {
      let card;

      if (packRarities[i] === "c") {
        // Get random common card
        const randomIndex = randomNumber(0, commonCards.length - 1, true);
        card = commonCards[randomIndex];
        // remove card from collection
        commonCards.splice(randomIndex, 1);

        console.log("Debug pick card", { randomIndex, card });
      } else if (packRarities[i] === "u") {
        // Get random uncommon card
        const randomIndex = randomNumber(0, uncommonCards.length - 1, true);
        card = uncommonCards[randomIndex];
        // remove card from collection
        uncommonCards.splice(randomIndex, 1);

        console.log("Debug pick card", { randomIndex, card });
      } else {
        // Get random full art card
        const randomIndex = randomNumber(0, fullartCards.length - 1, true);
        card = fullartCards[randomIndex];
        // remove card from collection
        fullartCards.splice(randomIndex, 1);

        console.log("Debug pick card", { randomIndex, card });
      }

      console.log("DEBUG Generation:", { card, rarity: packRarities[i] });

      // Push buffer to array
      const buffer = await createCardImage(card);
      images.push(buffer);
    }

    let currentImageIndex = 0;

    const getImageAttachment = () => {
      const image = new AttachmentBuilder(images[currentImageIndex], {
        name: "image.jpg",
      });

      return image;
    };

    const button1 = new ButtonBuilder()
      .setCustomId("button-prev")
      .setLabel("<-")
      .setStyle(ButtonStyle.Secondary);

    const button2 = new ButtonBuilder()
      .setCustomId("button-next")
      .setLabel("->")
      .setStyle(ButtonStyle.Secondary);

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      button1,
      button2
    );

    // Initial response
    const interactionResponse = await interaction.editReply({
      components: [row],
      files: [getImageAttachment()],
    });

    // Filter ensures only the original user can interact with the buttons
    const collectorFilter = (i) => i.user.id === interaction.user.id;

    const collector = interactionResponse.createMessageComponentCollector({
      componentType: ComponentType.Button,
      filter: collectorFilter,
      time: 3_600_000,
    });

    collector.on("collect", async (i) => {
      if (i.customId === "button-prev") {
        if (currentImageIndex === 0) {
          currentImageIndex = images.length - 1;
        } else {
          currentImageIndex = currentImageIndex - 1;
        }
      }

      if (i.customId === "button-next") {
        if (currentImageIndex === images.length - 1) {
          currentImageIndex = 0;
        } else {
          currentImageIndex = currentImageIndex + 1;
        }
      }

      await interactionResponse.edit({
        components: [row],
        files: [getImageAttachment()],
      });

      await i.update({});
    });
  } else {
    await interaction.reply("Under construction");
  }
};
