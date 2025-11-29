import { SlashCommandBuilder } from "@discordjs/builders";
import { CommandInteraction } from "discord.js";
import { pb } from "../utilities/pocketbase";
import type { MonitorRecord } from "../types/PocketbaseTables";
import { checkServiceStatus } from "../modules/polling/monitoring";

export const data = new SlashCommandBuilder()
  .setName("monitor-check")
  .setDescription("Check the status of a monitored service or website")
  .addStringOption((input) =>
    input
      .setName("name")
      .setDescription(
        "Optional: Check specific service, or leave blank to list all."
      )
      .setRequired(false)
  );

export const execute = async (
  interaction: CommandInteraction,
  logCommand: () => void
) => {
  const name = interaction.options.get("name")?.value?.toString();

  try {
    if (!!name) {
      // Check specific monitored service
      const response = await pb
        .collection<MonitorRecord>("monitoring")
        .getFirstListItem(
          `name = "${name}" && (server_id = "All" || server_id = "${interaction.guildId}")`
        );

      if (response) {
        if (!response.healthy) {
          // Service is marked as unhealthy - Report the failure
          const failingSinceDate = new Date(response.failing_since || "");
          await interaction.reply(
            `The monitored service _'${response.name}'_ (${response.ip}${
              response.port ? `:${response.port}` : ""
            }) is currently :red_square: **DOWN**. It has been marked as unhealthy since ${failingSinceDate.toLocaleString()}.`
          );
          return;
        } else {
          // DB says it's healthy, but let's double-check
          const serviceResponse = await checkServiceStatus(response);

          if (serviceResponse) {
            await interaction.reply(
              `The monitored service _'${response.name}'_ is currently :green_circle: **UP**.`
            );
          } else {
            await interaction.reply(
              `The monitored service _'${response.name}'_ (${response.ip}${
                response.port ? `:${response.port}` : ""
              }) is currently :red_square: **DOWN**.`
            );
          }
          return;
        }
      } else {
        // Couldn't find the specific monitored service
        await interaction.reply(
          `I couldn't find any monitored service matching: _'${name}'_`
        );
        return;
      }
    } else {
      // List all monitored services for the server
      const response = await pb
        .collection<MonitorRecord>("monitoring")
        .getFullList({
          filter: `server_id = "All" || server_id = "${interaction.guildId}"`,
        });

      if (response.length === 0) {
        await interaction.reply(
          `There are no monitored services for this server.`
        );
        return;
      }

      // Don't want to run a lot of pings, so just report the DB statuses
      let replyMessage = `Monitored services for this server:\n`;
      for (const monitor of response) {
        replyMessage += `- _'${monitor.name}'_ (${monitor.ip}${
          monitor.port ? `:${monitor.port}` : ""
        }): **${
          monitor.healthy ? ":green_circle: UP" : ":red_square: DOWN"
        }**\n`;
      }
      await interaction.reply(replyMessage);
    }

    logCommand();
  } catch (error) {
    console.error("Error in monitor-check command:", error);
    await interaction.reply(
      `There was an error while checking the monitored service(s). Please try again later.`
    );
  }
};
