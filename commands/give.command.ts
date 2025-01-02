import { SlashCommandBuilder } from "@discordjs/builders";
import { CommandInteraction } from "discord.js";
import { getUserBalance, addCoin } from "./../modules/finicoin";
import { user } from "elevenlabs/api";

export const data = new SlashCommandBuilder()
  .setName("give")
  .setDescription("Give Finicoin to someone else.")
  .addUserOption((opt) =>
    opt
      .setName("who")
      .setDescription("Who are you giving Finicoin to?")
      .setRequired(true)
  )
  .addNumberOption((opt) =>
    opt
      .setName("amount")
      .setDescription("How much are you giving?")
      .setRequired(true)
      .setMinValue(1)
  );

export const execute = async (
  interaction: CommandInteraction,
  logCommand: () => void
) => {
  const luckyFuck = interaction.options.getUser("who");
  const amount = Math.abs(
    Math.round(
      Number(interaction?.options?.get("amount")?.value?.toString()) || 0
    )
  );

  try {
    const userId = interaction.user.id;
    const username = interaction.user.username;
    const guildId = interaction.guildId ?? "unknown server id";
    const guildname = interaction.guild?.name ?? "unknown server name";

    const currentUserBalance = (await getUserBalance(userId, guildId)) || 0;

    if (currentUserBalance < amount) {
      // The user cannot give away that much
      interaction.reply(
        `You don't have enough Finicoin to gift ${amount.toLocaleString()}\nYour current balance: ${currentUserBalance.toLocaleString()}`
      );
    } else {
      // Now give it to the recipient
      await addCoin(
        luckyFuck?.id || "uknown user id",
        guildId,
        amount,
        username,
        guildname,
        userId
      );

      // Get new balances
      const userNewBalance = await getUserBalance(userId, guildId);
      const recipientNewBalance = await getUserBalance(
        luckyFuck?.id || "",
        guildId
      );

      // Log result
      interaction.reply(
        `You've gifted ${amount.toLocaleString()} Finicoin to ${
          luckyFuck?.username
        }.\n${
          luckyFuck?.username
        }'s balance: ${recipientNewBalance?.toLocaleString()}\nYour balance: ${userNewBalance?.toLocaleString()}`
      );
    }
    logCommand();
  } catch (err) {
    console.error("Error running /give command:", { err });
  }
};
