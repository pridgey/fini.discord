import { SlashCommandBuilder } from "@discordjs/builders";
import { ChatInputCommandInteraction } from "discord.js";
import { getUserBalance, addCoin } from "./../modules/finicoin";

/*
Current Fini workout reward rules:

Walking: 0.5 Finicoin per minute
Running: 1 Finicoin per minute
Biking: 1 Finicoin per minute
Jumping Jacks: 0.5 Finicoin per jump
Push-ups: 0.5 Finicoin per push-up
Squats: 0.5 Finicoin per squat
Sit-ups: 0.5 Finicoin per sit-up
Planking: 1 Finicoin per 10 seconds
*/

export const data = new SlashCommandBuilder()
  .setName("workout-reward")
  .setDescription("Admin Command to reward Finicoin to a user")
  .addUserOption((opt) =>
    opt
      .setName("who")
      .setDescription("Who are you giving Finicoin to?")
      .setRequired(true),
  )
  .addNumberOption((opt) =>
    opt
      .setName("amount")
      .setDescription("How much are you rewarding?")
      .setRequired(true)
      .setMinValue(1),
  );

export const execute = async (
  interaction: ChatInputCommandInteraction,
  logCommand: () => void,
) => {
  await interaction.deferReply();

  try {
    const luckyFuck = interaction.options.getUser("who");
    const amount = Math.abs(
      Math.round(
        Number(interaction?.options?.get("amount")?.value?.toString()) || 0,
      ),
    );

    const userId = interaction.user.id;
    const username = interaction.user.username;
    const guildId = interaction.guildId ?? "unknown server id";
    const guildname = interaction.guild?.name ?? "unknown server name";

    if (userId !== "255016605191241729") {
      await interaction.editReply(
        `Sorry ${interaction.user}, only Pridgey can run this command.`,
      );
      return;
    }

    // Now give it to the recipient
    await addCoin(
      luckyFuck?.id || "unknown user id",
      guildId,
      amount,
      username,
      guildname,
      "Reserve",
    );

    // Get new balance
    const recipientNewBalance = await getUserBalance(
      luckyFuck?.id || "",
      guildId,
    );

    // Respond
    await interaction.editReply(
      `${luckyFuck} has received ${amount} by the admin. Way to go!\n${luckyFuck} balance: ${recipientNewBalance}`,
    );
  } catch (err) {
    console.error("Error running /workout-reward command:", { err });
    await interaction.editReply("An error occurred running /workout-reward.");
  } finally {
    logCommand();
  }
};
