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
    const bankRecord = await pb
      .collection<BankRecord>("bank")
      .getFirstListItem(
        `user_id = "${interaction.user.id}" && server_id = "${interaction.guildId}"`
      );

    if (!!bankRecord) {
      interaction.reply(
        `You currently have ${bankRecord.balance?.toLocaleString()} Finicoin.`
      );
    } else {
      interaction.reply("You currently have 0 Finicoin.");
    }
  } catch (err) {
    const error: Error = err as Error;
    console.error("Error running /balance command", { error });
  } finally {
    logCommand();
  }
};
