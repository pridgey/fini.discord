import { SlashCommandBuilder } from "@discordjs/builders";
import { ChatInputCommandInteraction } from "discord.js";
import { clearHistory } from "../utilities/chatHistory";

export const data = new SlashCommandBuilder()
  .setName("clear")
  .setDescription("Clear all of your hey fini history (for all AI chats)");

export const execute = async (
  interaction: ChatInputCommandInteraction,
  logCommand: () => void,
) => {
  try {
    // Clear each history individually, catching errors to continue even if one fails
    try {
      await clearHistory(
        interaction.user.id,
        interaction.guildId ?? "unknown",
        "openai",
      );
    } catch (err) {
      console.error("Error clearing openai history:", err);
    }

    try {
      await clearHistory(
        interaction.user.id,
        interaction.guildId ?? "unknown",
        "anthropic",
      );
    } catch (err) {
      console.error("Error clearing anthropic history:", err);
    }

    try {
      await clearHistory(
        interaction.user.id,
        interaction.guildId ?? "unknown",
        "ollama",
      );
    } catch (err) {
      console.error("Error clearing ollama history:", err);
    }

    try {
      await interaction.reply("Your chat history has been cleared.");
    } catch (replyErr) {
      console.error("Error sending reply:", replyErr);
    }
  } catch (err) {
    const error: Error = err as Error;
    console.error("Error running /clear command", { error });
  } finally {
    logCommand();
  }
};
