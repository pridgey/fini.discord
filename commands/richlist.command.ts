import { SlashCommandBuilder } from "@discordjs/builders";
import { CommandInteraction, User } from "discord.js";
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

    const userIDs = allBalances.map((balance) => {
      if (balance.user_id === "Fini") {
        return new Promise((resolve) =>
          resolve({
            username: "Fini",
            balance: balance.balance,
          })
        );
      }
      return interaction.client.users.fetch(balance.user_id);
    });

    const userNames: unknown[] = await Promise.all(userIDs);

    const response = `**The Bourgeoisie**\r\n${allBalances
      .map((balance, index) => {
        return `${index + 1}. ${
          (userNames[index] as User).username
        }: ${balance.balance.toLocaleString()}`;
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
