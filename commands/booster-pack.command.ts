import { SlashCommandBuilder } from "@discordjs/builders";
import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  CommandInteraction,
  ComponentType,
} from "discord.js";
import path from "path";
import { generateBoosterPack } from "../modules/finicards/generateBoosterPack";
import { addCoin, getUserBalance } from "../modules/finicoin";

const COMMAND_COST = 25;
const EXPECTED_CARDS = 5;

export const data = new SlashCommandBuilder()
  .setName("booster-pack")
  .setDescription(`Buy a new finicard booster pack (${COMMAND_COST} fc)`);

export const execute = async (
  interaction: CommandInteraction,
  logCommand: () => void
) => {
  await interaction.deferReply();

  try {
    // Ensure user has enough balance
    const currentUserBalance =
      (await getUserBalance(interaction.user.id, interaction.guildId || "")) ||
      0;

    if (currentUserBalance >= COMMAND_COST) {
      // Pay for booster
      await addCoin(
        "Reserve",
        interaction.guildId ?? "unknown guild id",
        COMMAND_COST,
        interaction.user.username,
        interaction.guild?.name ?? "unknown guild name",
        interaction.user.id
      );

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

      const finishButton = new ButtonBuilder()
        .setCustomId("finish")
        .setLabel("Show All")
        .setStyle(ButtonStyle.Secondary);

      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        button1,
        button2
      );

      const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
        finishButton
      );

      // Initial image (booster pack cover)
      const coverImage = new AttachmentBuilder(
        path.join(__dirname, "../modules/finicards", "BoosterPackCover.png")
      );

      // Initial response
      const interactionResponse = await interaction.editReply({
        content: `Here is your ${packImages.length} card booster pack:`,
        components: [openPackRow],
        files: [coverImage],
      });

      // Check if the user got fewer than 5 cards for whatever reason
      if (packImages.length < EXPECTED_CARDS) {
        const numCardsMissing = EXPECTED_CARDS - packImages.length;
        const reimbursement = numCardsMissing * 5;

        // Reimburse user for missing cards
        await addCoin(
          interaction.user.id,
          interaction.guildId ?? "unknown guild id",
          reimbursement,
          interaction.user.username,
          interaction.guild?.name ?? "unknown guild name",
          "Reserve"
        );

        await interaction.followUp(
          `Uh oh, looks like you only got ${packImages.length} cards.\r\nSince you're missing ${numCardsMissing}, I've reimbursed you ${reimbursement} finicoin.`
        );
      }

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

        // Build all attachments
        const imageAttachments = packImages.map((img) =>
          getImageAttachment(img.buffer)
        );

        await endedInteraction?.editReply({
          content: `${endedInteraction.user} pulled ${packImages.length} cards:`,
          files: imageAttachments,
          components: [],
        });
      });

      // Event that fires when a user interacts with the buttons
      collector.on("collect", async (i) => {
        // Finish button
        if (i.customId === "finish") {
          // Build all attachments
          const imageAttachments = packImages.map((img) =>
            getImageAttachment(img.buffer)
          );

          await i.update({
            content: `${interaction.user} pulled ${packImages.length} cards:`,
            files: imageAttachments,
            components: [],
          });

          return;
        }

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
          content: `Card ${currentImageIndex + 1} of ${packImages.length}: ${
            packImages[currentImageIndex].card_name
          }:`,
          components: [row, row2],
          files: [getImageAttachment()],
        });

        await i.update({});
      });
    } else {
      interaction.editReply(
        "You do not have enough finicoin to run these command."
      );
    }
  } catch (err) {
    console.error("Error during booster pack generation", err);
    interaction.editReply("An error occurred during booster-pack");
  } finally {
    logCommand();
  }
};
