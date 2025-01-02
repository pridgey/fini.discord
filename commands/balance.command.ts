import { SlashCommandBuilder } from "@discordjs/builders";
import { CommandInteraction } from "discord.js";
import { getUserBalance } from "../modules/finicoin";

export const data = new SlashCommandBuilder()
  .setName("balance")
  .setDescription("How much Finicoin do I have?");

export const execute = async (
  interaction: CommandInteraction,
  logCommand: () => void
) => {
  try {
    const userBalance = await getUserBalance(
      interaction.user.id,
      interaction.guildId ?? "unknown server id"
    );

    await interaction.reply(
      `You currently have ${(userBalance ?? 0).toLocaleString()} Finicoin.`
    );
  } catch (err) {
    const error: Error = err as Error;
    console.error("Error running /balance command", { error });
  } finally {
    logCommand();
  }
};
