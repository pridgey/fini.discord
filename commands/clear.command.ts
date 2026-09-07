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
  /*
   * Deferred before any deleting starts. Discord closes the initial response
   * window three seconds after the interaction arrives, and clearing is a
   * round trip per record - a 163 record history took four and a half seconds,
   * so the reply came back 10062 Unknown interaction. The history really was
   * gone; the user was told "the application did not respond" and reasonably
   * assumed /clear was broken. Deferring turns those three seconds into
   * fifteen minutes.
   *
   * A failed defer is logged rather than thrown: the clear is still worth
   * attempting, and `respond` falls back to replying directly.
   */
  try {
    await interaction.deferReply();
  } catch (deferErr) {
    console.error("Error deferring /clear reply:", deferErr);
  }

  /**
   * Answers the interaction whichever way it is still open, and treats a
   * failure to answer as unremarkable - by the time we are replying the
   * clearing is already done, and there is nothing left to salvage by throwing.
   */
  const respond = async (content: string) => {
    try {
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply(content);
      } else {
        await interaction.reply(content);
      }
    } catch (replyErr) {
      console.error("Error sending reply:", replyErr);
    }
  };

  try {
    await clearAllHistory(interaction.user.id, interaction.guildId);

    await respond("Your chat history has been cleared.");
  } catch (err) {
    const error: Error = err as Error;
    console.error("Error running /clear command", { error });

    // Say so - a silent failure here reads exactly like a successful clear
    await respond(
      "I couldn't clear your chat history. Give it another go in a moment.",
    );
  } finally {
    logCommand();
  }
};
