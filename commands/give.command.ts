import { SlashCommandBuilder } from "@discordjs/builders";
import { CommandInteraction, MessageEmbed } from "discord.js";
import { commafyNumber } from "./../utilities";
import { getUserBalance, removeCoin, addCoin } from "./../modules";

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

export const execute = async (interaction: CommandInteraction) => {
  const luckyFuck = interaction.options.getUser("who");
  const amount = Math.abs(Math.round(interaction.options.getNumber("amount")));

  getUserBalance(interaction.user.id, interaction.guildId).then((balance) => {
    if (balance < amount) {
      interaction.reply(
        `You don't have enough Finicoin to give away ${commafyNumber(
          amount
        )}. You only have ${commafyNumber(balance)} Finicoins`
      );
    } else {
      // Everything should be good
      removeCoin(interaction.user.id, interaction.guildId, amount).then(() => {
        addCoin(luckyFuck.id, interaction.guildId, amount).then(
          ({ balance: addedBalance }) => {
            const embed = new MessageEmbed()
              .setTitle("Finicoin Transaction")
              .setDescription(
                `${interaction.user.username} gave ${
                  luckyFuck.username
                } ${commafyNumber(amount)} Finicoin`
              )
              .addField(
                `${interaction.user.username} Balance`,
                commafyNumber(balance - amount),
                true
              )
              .addField(
                `${luckyFuck.username} Balance`,
                commafyNumber(addedBalance),
                true
              );

            interaction.reply({
              embeds: [embed],
            });
          }
        );
      });
    }
  });
};
