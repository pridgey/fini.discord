import { SlashCommandBuilder } from "@discordjs/builders";
import { ChatInputCommandInteraction, MessageFlags } from "discord.js";
import { todaysRoundFor } from "../modules/dailies/geo/daily";

/**
 * The daily games. Each posts itself in the bot channel; this brings today's
 * round back for anyone who missed the post.
 */
export const data = new SlashCommandBuilder()
  .setName("daily")
  .setDescription("Play today's daily games")
  .addSubcommand((sub) =>
    sub.setName("geo").setDescription("Today's location round: guess where the photos were taken"),
  );

export const execute = async (
  interaction: ChatInputCommandInteraction,
  logCommand: () => void,
) => {
  logCommand();
  if (!interaction.guildId) {
    await interaction.reply({ content: "The daily is played in a server.", flags: [MessageFlags.Ephemeral] });
    return;
  }
  await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
  await interaction.editReply(await todaysRoundFor(interaction.guildId, interaction.user.id));
};
