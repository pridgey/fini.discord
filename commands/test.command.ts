import { SlashCommandBuilder } from "@discordjs/builders";
import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  CommandInteraction,
  ComponentType,
} from "discord.js";
import type { HammerspaceRecord } from "../types/PocketbaseTables";
import { pb } from "../utilities/pocketbase";

export const data = new SlashCommandBuilder()
  .setName("test")
  .setDescription("Testing new commands");

export const execute = async (
  interaction: CommandInteraction,
  logCommand: () => void
) => {
  const images = [
    "https://i.imgur.com/b46q4qN.jpeg",
    "https://i.imgur.com/zWmdHss.jpeg",
    "https://i.imgur.com/5tIPqaX.mp4",
  ];
  let currentImageIndex = 0;

  const getImage = () => {
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
  const interactionResponse = await interaction.reply({
    components: [row],
    ephemeral: true,
    files: [getImage()],
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
        currentImageIndex = 2;
      } else {
        currentImageIndex = currentImageIndex - 1;
      }
    }

    if (i.customId === "button-next") {
      if (currentImageIndex === 2) {
        currentImageIndex = 0;
      } else {
        currentImageIndex = currentImageIndex + 1;
      }
    }

    await interactionResponse.edit({
      components: [row],
      files: [getImage()],
    });

    await i.update({});
  });
};
