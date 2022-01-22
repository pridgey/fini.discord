import { SlashCommandBuilder } from "@discordjs/builders";
import { CommandInteraction } from "discord.js";
import { commafyNumber, db } from "../utilities";
import { BankRecord } from "../types";

export const data = new SlashCommandBuilder()
  .setName("balance")
  .setDescription("How much Finicoin do I have?");

export const execute = async (interaction: CommandInteraction) => {
  db()
    .select<BankRecord>(
      "Bank",
      { Field: "User", Value: interaction.user.id },
      interaction.guildId
    )
    .then((result) => {
      if (result[0]) {
        interaction.reply(
          `You currently have ${commafyNumber(result[0].Balance)} Finicoins`
        );
      } else {
        interaction.reply("You current have 0 Finicoins");
      }
    });
};
