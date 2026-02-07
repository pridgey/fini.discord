import { SlashCommandBuilder } from "@discordjs/builders";
import { ChatInputCommandInteraction } from "discord.js";
import type { BankRecord } from "../types/PocketbaseTables";
import { pb } from "../utilities/pocketbase";

export const data = new SlashCommandBuilder()
  .setName("jackpot")
  .setDescription("What is the current finicoin jackpot at?");

export const execute = async (
  interaction: ChatInputCommandInteraction,
  logCommand: () => void,
) => {
  try {
    const bankRecord = await pb
      .collection<BankRecord>("bank")
      .getFirstListItem(
        `user_id = "Jackpot" && server_id = "${interaction.guildId}"`,
      );

    if (!!bankRecord && bankRecord.balance !== undefined && bankRecord.balance !== null) {
      try {
        await interaction.reply(
          `The jackpot is currently at ${bankRecord.balance.toLocaleString()} Finicoin.`,
        );
      } catch (replyErr) {
        console.error("Error sending reply:", replyErr);
      }
    } else {
      try {
        await interaction.reply("The Jackpot is at 0 Finicoin.");
      } catch (replyErr) {
        console.error("Error sending reply:", replyErr);
      }
    }
  } catch (err) {
    const error: Error = err as Error;
    console.error("Error running /jackpot command", { error });
  } finally {
    logCommand();
  }
};
