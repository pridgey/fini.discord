import { SlashCommandBuilder } from "@discordjs/builders";
import { CommandInteraction, InteractionCollector, User } from "discord.js";
import type { BankRecord } from "../types/PocketbaseTables";
import { pb } from "../utilities/pocketbase";

export const data = new SlashCommandBuilder()
  .setName("richlist")
  .setDescription("Who has the most fini coin?");

export const execute = async (
  interaction: CommandInteraction,
  logCommand: () => void
) => {
  try {
    const allBalances = await pb.collection<BankRecord>("bank").getFullList({
      filter: `server_id = "${interaction.guildId}"`,
      sort: "-balance",
    });

    const userBankRecords = await Promise.all(
      allBalances
        .filter((ab) => !["Jackpot", "Reserve"].includes(ab.user_id))
        .map(async (ab) => {
          const userRecord = await interaction.client.users.fetch(ab.user_id);
          return {
            username: userRecord.username,
            balance: ab.balance,
          };
        })
    );

    const response = `**The Bourgeoisie**\r\n${userBankRecords
      .map((ubr, index) => {
        return `${index + 1}. ${ubr.username}: ${ubr.balance.toLocaleString()}`;
      })
      .join("\r\n")}`;

    interaction.reply(response);
  } catch (err) {
    const error: Error = err as Error;
    console.error("Error running /richlist command", { error });
  } finally {
    logCommand();
  }
};
