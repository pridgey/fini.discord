import { SlashCommandBuilder } from "@discordjs/builders";
import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChatInputCommandInteraction,
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
  interaction: ChatInputCommandInteraction,
  logCommand: () => void,
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
        interaction.user.id,
      );

      // Generate the cards of the booster pack and save to user account
      const packImages = await generateBoosterPack({
        userId: interaction.user.id,
        serverId: interaction.guildId ?? "unknown guild id",
        username: interaction.user.username,
        serverName: interaction.guild?.name ?? "unknown guild name",
      });

      const openPackButton = new ButtonBuilder()
        .setCustomId(`booster_pack_open:${interaction.user.id}`)
        .setLabel("Open Pack")
        .setStyle(ButtonStyle.Secondary);

      const openPackRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
        openPackButton,
      );

      // Initial image (booster pack cover)
      const coverImage = new AttachmentBuilder(
        path.join(__dirname, "../modules/finicards", "BoosterPackCover.png"),
      );

      // Initial response
      await interaction.editReply({
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
          "Reserve",
        );

        await interaction.followUp(
          `Uh oh, looks like you only got ${packImages.length} cards.\r\nSince you're missing ${numCardsMissing}, I've reimbursed you ${reimbursement} finicoin.`,
        );
      }
    } else {
      interaction.editReply(
        "You do not have enough finicoin to run these command.",
      );
    }
  } catch (err) {
    console.error("Error during booster pack generation", err);
    interaction.editReply("An error occurred during booster-pack");
  } finally {
    logCommand();
  }
};
