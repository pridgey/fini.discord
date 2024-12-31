import { SlashCommandBuilder } from "@discordjs/builders";
import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  CommandInteraction,
  ComponentType,
} from "discord.js";
import type { CardDefinitionRecord } from "../types/PocketbaseTables";
import { pb } from "../utilities/pocketbase";
import { randomNumber } from "../utilities/randomNumber";
import { createCardImage } from "../modules/finicards/generateCardImage";
import path from "path";

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
    const commonCards = cardDefinitions.filter(
      (cd) => cd.rarity === "c" || cd.rarity === "i"
    );
    const uncommonCards = cardDefinitions.filter((cd) => cd.rarity === "u");
    const fullartCards = cardDefinitions.filter((cd) => cd.rarity === "fa");

    // Unique type for both the database record and image buffer
    type CardDefinitionWithBuffer = CardDefinitionRecord & {
      buffer: Buffer;
    };

    // Carousel images
    const images: CardDefinitionWithBuffer[] = [];

    const packRarities = generatePackRarities();

    for (let i = 0; i < packRarities.length; i++) {
      let card;

      if (packRarities[i] === "c") {
        // Get random common card
        const randomIndex = randomNumber(0, commonCards.length - 1, true);
        card = commonCards[randomIndex];
        // remove card from collection
        commonCards.splice(randomIndex, 1);
      } else if (packRarities[i] === "u") {
        // Get random uncommon card
        const randomIndex = randomNumber(0, uncommonCards.length - 1, true);
        card = uncommonCards[randomIndex];
        // remove card from collection
        uncommonCards.splice(randomIndex, 1);
      } else {
        // Get random full art card
        const randomIndex = randomNumber(0, fullartCards.length - 1, true);
        card = fullartCards[randomIndex];
        // remove card from collection
        fullartCards.splice(randomIndex, 1);
      }

      // Push buffer to array
      const buffer = await createCardImage(card);
      images.push({
        ...card,
        buffer,
      });
    }

    // state for the current displayed image
    let currentImageIndex = -1;

    // Small helper function to build the discord attachment
    const getImageAttachment = (buffer?: Buffer) => {
      // Get parameter or default to current interaction index
      const workingBuffer = buffer ?? images[currentImageIndex].buffer;

      // Generate image attachment
      const image = new AttachmentBuilder(workingBuffer, {
        name: "image.jpg",
      });

      return image;
    };

    const openPackButton = new ButtonBuilder()
      .setCustomId("open-pack")
      .setLabel("Open Pack")
      .setStyle(ButtonStyle.Secondary);

    const openPackRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      openPackButton
    );

    const button1 = new ButtonBuilder()
      .setCustomId("button-prev")
      .setLabel("<- Prev Card")
      .setStyle(ButtonStyle.Secondary);

    const button2 = new ButtonBuilder()
      .setCustomId("button-next")
      .setLabel("Next Card ->")
      .setStyle(ButtonStyle.Secondary);

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      button1,
      button2
    );

    // Initial image (booster pack cover)
    const coverImage = new AttachmentBuilder(
      path.join(__dirname, "../modules/finicards", "BoosterPackCover.png")
    );

    // Initial response
    const interactionResponse = await interaction.editReply({
      content: `Here is your 5 card booster pack:`,
      components: [openPackRow],
      files: [coverImage],
    });

    // Filter ensures only the original user can interact with the buttons
    const collectorFilter = (i) => i.user.id === interaction.user.id;

    const collector = interactionResponse.createMessageComponentCollector({
      componentType: ComponentType.Button,
      filter: collectorFilter,
      time: 3_600_000,
    });

    // Event that fires when the collector times out
    collector.on("end", async (i) => {
      const endedInteraction = i.at(0);

      // Build all attachments
      const imageAttachments = images.map((img) =>
        getImageAttachment(img.buffer)
      );

      endedInteraction?.editReply({
        content: `${endedInteraction.user} pulled 5 cards:`,
        files: imageAttachments,
        components: [],
      });
    });

    // Event that fires when a user interacts with the buttons
    collector.on("collect", async (i) => {
      // Opening the pack
      if (i.customId === "open-pack") {
        currentImageIndex = 0;
      }

      // Using the arrows
      if (i.customId === "button-prev") {
        if (currentImageIndex <= 0) {
          currentImageIndex = images.length - 1;
        } else {
          currentImageIndex = currentImageIndex - 1;
        }
      }

      if (i.customId === "button-next") {
        if (currentImageIndex >= images.length - 1) {
          currentImageIndex = 0;
        } else {
          currentImageIndex = currentImageIndex + 1;
        }
      }

      await interactionResponse.edit({
        content: `Card ${currentImageIndex + 1} of 5: ${
          images[currentImageIndex].card_name
        }:`,
        components: [row],
        files: [getImageAttachment()],
      });

      await i.update({});
    });
  } else {
    await interaction.reply("Under construction");
  }
};
