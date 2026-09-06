import { SlashCommandBuilder } from "@discordjs/builders";
import { ChatInputCommandInteraction } from "discord.js";
import { clearAllHistory } from "../utilities/clearAllHistory";

export const data = new SlashCommandBuilder()
  .setName("clear")
  .setDescription("Clear all of your hey fini history (for all AI chats)");

export const execute = async (
  interaction: ChatInputCommandInteraction,
  logCommand: () => void,
) => {
  try {
    await clearAllHistory(interaction.user.id, interaction.guildId);

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
