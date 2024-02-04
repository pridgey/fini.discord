import { SlashCommandBuilder } from "@discordjs/builders";
import { CommandInteraction } from "discord.js";
import { getUserBalance, removeCoin, addCoin } from "./../modules/finicoin";

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
    const currentUserBalance =
      (await getUserBalance(interaction.user.id, interaction.guildId || "")) ||
      0;

    if (currentUserBalance < amount) {
      // The user cannot give away that much
      interaction.reply(
        `You don't have enough Finicoin to gift ${amount.toLocaleString()}\nYour current balance: ${currentUserBalance.toLocaleString()}`
      );
    } else {
      // First remove the coin from the gifter
      await removeCoin(interaction.user.id, interaction.guildId || "", amount);

      // Now give it to the recipient
      await addCoin(luckyFuck?.id || "", interaction.guildId || "", amount);

      // Get new balances
      const userNewBalance = await getUserBalance(
        interaction.user.id,
        interaction.guildId || ""
      );
      const recipientNewBalance = await getUserBalance(
        luckyFuck?.id || "",
        interaction.guildId || ""
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
