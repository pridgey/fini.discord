import { RepliableInteraction, MessageFlags } from "discord.js";

/**
 * Discord user id allowed to run owner-only actions. Set ADMIN_ID in .env.
 */
export const ADMIN_ID = process.env.ADMIN_ID ?? "";

export const isAdmin = (userId: string) => !!ADMIN_ID && userId === ADMIN_ID;

/**
 * Gate an owner-only interaction. Hiding a button isn't enough on its own -
 * custom ids are clickable by anyone who can see the message - so handlers
 * need to check again on their own.
 *
 * @returns true when the user may proceed
 */
export const requireAdmin = async (
  interaction: RepliableInteraction,
  action = "do that",
) => {
  if (isAdmin(interaction.user.id)) return true;

  await interaction.reply({
    content: ADMIN_ID
      ? `❌ Only the bot admin can ${action}.`
      : "❌ No bot admin is configured (`ADMIN_ID` is unset), so owner-only actions are disabled.",
    flags: [MessageFlags.Ephemeral],
  });

  return false;
};
