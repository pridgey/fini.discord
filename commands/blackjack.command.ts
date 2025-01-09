import { SlashCommandBuilder } from "@discordjs/builders";
import { CommandInteraction } from "discord.js";
import { clearHistory } from "../utilities/chatHistory";

const cardDeck = [];

export const data = new SlashCommandBuilder()
  .setName("blackjack")
  .setDescription("Play Blackjack with Fini")
  .addNumberOption((opt) =>
    opt
      .setName("bet")
      .setDescription("How much are you betting?")
      .setRequired(true)
      .setMinValue(1)
  );

export const execute = async (
  interaction: CommandInteraction,
  logCommand: () => void
) => {
  try {
    await clearHistory(
      interaction.user.id,
      interaction.guildId ?? "unknown",
      "openai"
    );
    await clearHistory(
      interaction.user.id,
      interaction.guildId ?? "unknown",
      "llama"
    );

    await interaction.reply("Your chat history has been cleared.");
  } catch (err) {
    const error: Error = err as Error;
    console.error("Error running /clear command", { error });
  } finally {
    logCommand();
  }
};
