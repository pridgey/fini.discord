import { SlashCommandBuilder } from "@discordjs/builders";
import { ChatInputCommandInteraction } from "discord.js";
import { getUserBalance } from "../modules/finicoin";
import { pb } from "../utilities/pocketbase";
import { MessageRewardStats } from "../types/PocketbaseTables";

export const data = new SlashCommandBuilder()
  .setName("balance")
  .setDescription("How much Finicoin do I have?")
  .addBooleanOption((option) =>
    option
      .setName("daily-earnings")
      .setDescription("Show your Finicoin earnings today from chatting")
      .setRequired(false),
  );

export const execute = async (
  interaction: ChatInputCommandInteraction,
  logCommand: () => void,
) => {
  try {
    const showDailyEarnings: boolean = Boolean(
      interaction.options.get("daily-earnings")?.value || false,
    );

    const userBalance = await getUserBalance(
      interaction.user.id,
      interaction.guildId ?? "unknown server id",
    );

    if (showDailyEarnings) {
      const usersCurrentEarnings = await pb
        .collection<MessageRewardStats>("message_reward_stats")
        .getFullList({
          filter: `user_id = "${interaction.user.id}" && server_id = "${
            interaction.guildId ?? "unknown guild id"
          }"`,
        });

      await interaction.reply(
        `You currently have ${(
          userBalance ?? 0
        ).toLocaleString()} Finicoin.\nYou've earned ${usersCurrentEarnings
          .at(0)
          ?.today_earnings.toLocaleString()} Finicoin today.`,
      );
    } else {
      await interaction.reply(
        `You currently have ${(userBalance ?? 0).toLocaleString()} Finicoin.`,
      );
    }
  } catch (err) {
    const error: Error = err as Error;
    console.error("Error running /balance command", { error });
  } finally {
    logCommand();
  }
};
