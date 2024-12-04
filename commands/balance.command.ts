import { SlashCommandBuilder } from "@discordjs/builders";
import { CommandInteraction } from "discord.js";
import type { BankRecord } from "../types/PocketbaseTables";
import { pb } from "../utilities/pocketbase";

export const data = new SlashCommandBuilder()
  .setName("balance")
  .setDescription("How much Finicoin do I have?");

export const execute = async (
  interaction: CommandInteraction,
  logCommand: () => void
) => {
  try {
    const bankRecord = await pb.collection<BankRecord>("bank").getFullList({
      filter: `user_id = "${interaction.user.id}"`,
    });

    const matchingBankRecord = bankRecord[0];

    if (!!matchingBankRecord) {
      await interaction.reply(
        `You currently have ${matchingBankRecord.balance?.toLocaleString()} Finicoin.`
      );
    } else {
      // create a new bank record for the user
      await pb.collection<BankRecord>("bank").create({
        user_id: interaction.user.id,
        balance: 0,
      });

      await interaction.reply("You currently have 0 Finicoin.");
    }
  } catch (err) {
    const error: Error = err as Error;
    console.error("Error running /balance command", { error });
  } finally {
    logCommand();
  }
};
