import { SlashCommandBuilder } from "@discordjs/builders";
import { ChatInputCommandInteraction } from "discord.js";
import { ALL_CHAT_TYPES } from "../modules/aiChat/chatTypes";
import { clearHistory } from "../utilities/chatHistory";

export const data = new SlashCommandBuilder()
  .setName("clear")
  .setDescription("Clear all of your hey fini history (for all AI chats)");

export const execute = async (
  interaction: ChatInputCommandInteraction,
  logCommand: () => void,
) => {
  try {
    // Clear each history individually, catching errors so one unreachable
    // backend doesn't leave the rest of the user's history behind
    for (const chatType of ALL_CHAT_TYPES) {
      try {
        await clearHistory(
          interaction.user.id,
          interaction.guildId ?? "unknown",
          chatType,
        );
      } catch (err) {
        console.error(`Error clearing ${chatType} history:`, err);
      }
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
