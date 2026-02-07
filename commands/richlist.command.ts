import { SlashCommandBuilder } from "@discordjs/builders";
import { ChatInputCommandInteraction } from "discord.js";
import type { BankRecord } from "../types/PocketbaseTables";
import { pb } from "../utilities/pocketbase";

export const data = new SlashCommandBuilder()
  .setName("richlist")
  .setDescription("Who has the most fini coin?");

export const execute = async (
  interaction: ChatInputCommandInteraction,
  logCommand: () => void,
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
          try {
            const userRecord = await interaction.client.users.fetch(ab.user_id);
            return {
              username: userRecord.username,
              balance: ab.balance,
            };
          } catch (fetchErr) {
            console.error(`Error fetching user ${ab.user_id}:`, fetchErr);
            return {
              username: "Unknown User",
              balance: ab.balance,
            };
          }
        }),
    );

    const response = `**The Bourgeoisie**\r\n${userBankRecords
      .map((ubr, index) => {
        return `${index + 1}. ${ubr.username}: ${ubr.balance.toLocaleString()}`;
      })
      .join("\r\n")}`;

    try {
      await interaction.reply(response);
    } catch (replyErr) {
      console.error("Error sending reply:", replyErr);
    }
  } catch (err) {
    const error: Error = err as Error;
    console.error("Error running /richlist command", { error });
  } finally {
    logCommand();
  }
};
