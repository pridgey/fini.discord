import { SlashCommandBuilder } from "@discordjs/builders";
import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  CommandInteraction,
  ComponentType,
} from "discord.js";
import { createCardImage } from "../modules/finicards/generateCardImage";
import { getUserCollection } from "../modules/finicards/getUserCollection";
import type { CardDefinitionRecord } from "../types/PocketbaseTables";

export const data = new SlashCommandBuilder()
  .setName("card-collection")
  .setDescription("List my finicard collection.");

export const execute = async (
  interaction: CommandInteraction,
  logCommand: () => void
) => {
  try {
    await interaction.deferReply();

    // Get all user cards
    const userCards = await getUserCollection(
      interaction.user.id,
      interaction.guildId ?? "unknown guild id"
    );

    if (userCards.length === 0) {
      interaction.editReply("You've not opened any booster packs yet.");
    } else {
      // state for the current displayed image
      let currentImageIndex = 0;

      // Small helper function to build the discord attachment
      const getImageAttachment = async (card: CardDefinitionRecord) => {
        const buffer = await createCardImage(card);

        if (buffer) {
          // Generate image attachment
          const image = new AttachmentBuilder(buffer, {
            name: "image.jpg",
          });

          return image;
        } else {
          return new AttachmentBuilder("");
        }
      };

      // Navigation buttons
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

      // Initial image
      const currentImageAttachment = await getImageAttachment(
        userCards[currentImageIndex]
      );

      // Initial response
      const interactionResponse = await interaction.editReply({
        content: `Card ${currentImageIndex + 1} of ${userCards.length}: ${
          userCards[currentImageIndex].card_name
        }:`,
        components: [row],
        files: [currentImageAttachment],
      });

      // Filter ensures only the original user can interact with the buttons
      const collectorFilter = (i) => i.user.id === interaction.user.id;

      const collector = interactionResponse.createMessageComponentCollector({
        componentType: ComponentType.Button,
        filter: collectorFilter,
        time: 600_000, // 10 min
      });

      // Event that fires when the collector times out
      collector.on("end", async (i) => {
        const endedInteraction = i.at(0);

        endedInteraction?.editReply({
          content: `Interaction timeout`,
          files: [],
          components: [],
        });
      });

      // Event that fires when a user interacts with the buttons
      collector.on("collect", async (i) => {
        // Using the arrows
        if (i.customId === "button-prev") {
          if (currentImageIndex <= 0) {
            currentImageIndex = userCards.length - 1;
          } else {
            currentImageIndex = currentImageIndex - 1;
          }
        }

        if (i.customId === "button-next") {
          if (currentImageIndex >= userCards.length - 1) {
            currentImageIndex = 0;
          } else {
            currentImageIndex = currentImageIndex + 1;
          }
        }

        // Get navigated card image
        const navigatedImageAttachment = await getImageAttachment(
          userCards[currentImageIndex]
        );

        await interactionResponse.edit({
          content: `Card ${currentImageIndex + 1} of ${userCards.length}: ${
            userCards[currentImageIndex].card_name
          }:`,
          components: [row],
          files: [navigatedImageAttachment],
        });

        await i.update({});
      });
    }
  } catch (err) {
    console.error("Error during user collection", err);
    if (interaction.replied) {
      interaction.editReply("Error during card-collection");
    } else {
      interaction.reply("Error during card-collection");
    }
  } finally {
    logCommand();
  }
};
