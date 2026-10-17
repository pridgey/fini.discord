import { MessageFlags, type RepliableInteraction } from "discord.js";

/**
 * Tells the person that what they pressed or sent failed, however far the
 * handler got: a fresh interaction gets a reply; one already deferred or
 * answered gets a follow-up, so they aren't left looking at "thinking...".
 * Only they see it. Never throws - it runs when something already has.
 */
export const replyWithError = async (
  interaction: RepliableInteraction,
  content: string,
): Promise<void> => {
  const message = { content, flags: [MessageFlags.Ephemeral] as const };
  try {
    if (interaction.deferred || interaction.replied) {
      await interaction.followUp(message);
    } else {
      await interaction.reply(message);
    }
  } catch (error) {
    console.error("Couldn't tell the user something failed:", error);
  }
};
