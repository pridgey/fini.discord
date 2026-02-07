import { SlashCommandBuilder } from "@discordjs/builders";
import { ChatInputCommandInteraction } from "discord.js";
import type { CardSuggestionRecord } from "../types/PocketbaseTables";
import { pb } from "../utilities/pocketbase";

const CARD_NAME_MAX_LENGTH = 200;
const CARD_DESC_MAX_LENGTH = 1000;

export const data = new SlashCommandBuilder()
  .setName("suggest-card")
  .setDescription("Suggest a card for Finicards")
  .addStringOption((option) =>
    option
      .setName("name")
      .setDescription("The name of the card")
      .setRequired(true),
  )
  .addStringOption((option) =>
    option
      .setName("description")
      .setDescription("Any additional description about the card")
      .setRequired(true),
  );

export const execute = async (
  interaction: ChatInputCommandInteraction,
  logCommand: () => void,
) => {
  await interaction.deferReply();
  try {
    const cardName = interaction.options.get("name")?.value?.toString() || "";
    const cardDescription =
      interaction.options.get("description")?.value?.toString() || "";

    if (cardName.length > CARD_NAME_MAX_LENGTH && cardName.length > 0) {
      await interaction.editReply(
        `The Name cannot be longer than ${CARD_NAME_MAX_LENGTH} characters.`,
      );
      return;
    }

    if (
      cardDescription.length > CARD_DESC_MAX_LENGTH &&
      cardDescription.length > 0
    ) {
      await interaction.editReply(
        `The Name cannot be longer than ${CARD_DESC_MAX_LENGTH} characters.`,
      );
      return;
    }

    // Add card to suggestion table
    await pb.collection<CardSuggestionRecord>("card_suggestion").create({
      name: cardName,
      description: cardDescription,
      identifier: `${interaction.user.username}-${
        interaction.guild?.name ?? "unknown guild id"
      }`,
    });

    await interaction.editReply(
      `${cardName} suggestion has been added. Good luck!`,
    );
  } catch (err) {
    console.error("An error occurred during /suggest-card", { err });
    await interaction.editReply("An error occurred during Card Suggestion.");
  } finally {
    logCommand();
  }
};
