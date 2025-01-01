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
import { generateBoosterPack } from "../modules/finicards/generateBoosterPack";

export const data = new SlashCommandBuilder()
  .setName("test")
  .setDescription("Testing new commands");

export const execute = async (
  interaction: CommandInteraction,
  logCommand: () => void
) => {
  if (
    interaction.user.id === "255016605191241729" ||
    interaction.user.id === "1260813127973470238" ||
    interaction.user.id === "1138921518949212270"
  ) {
    await interaction.deferReply();

    try {
      // Generate the cards of the booster pack and save to user account
      const packImages = await generateBoosterPack({
        userId: interaction.user.id,
        serverId: interaction.guildId ?? "unknown guild id",
        username: interaction.user.username,
        serverName: interaction.guild?.name ?? "unknown guild name",
      });

      // state for the current displayed image
      let currentImageIndex = -1;

      // Small helper function to build the discord attachment
      const getImageAttachment = (buffer?: Buffer) => {
        // Get parameter or default to current interaction index
        const workingBuffer = buffer ?? packImages[currentImageIndex].buffer;

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
        const imageAttachments = packImages.map((img) =>
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
            currentImageIndex = packImages.length - 1;
          } else {
            currentImageIndex = currentImageIndex - 1;
          }
        }

        if (i.customId === "button-next") {
          if (currentImageIndex >= packImages.length - 1) {
            currentImageIndex = 0;
          } else {
            currentImageIndex = currentImageIndex + 1;
          }
        }

        await interactionResponse.edit({
          content: `Card ${currentImageIndex + 1} of 5: ${
            packImages[currentImageIndex].card_name
          }:`,
          components: [row],
          files: [getImageAttachment()],
        });

        await i.update({});
      });
    } catch (err) {
      console.error("Error during booster pack generation", err);
    }
  } else {
    await interaction.reply("Under construction");
  }
};
