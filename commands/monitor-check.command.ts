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
    await interaction.deferReply();

    if (!!name) {
      // Check specific monitored service
      const results = await pb
        .collection<MonitorRecord>("monitoring")
        .getFullList({
          filter: `name = "${name}" && (server_id = "All" || server_id = "${interaction.guildId}")`,
        });

      const response = results.at(0);

      if (!response || !response.id) {
        await interaction.editReply(
          `No monitored service found with the name _'${name}'_ for this server.`
        );
        return;
      }

      // Ping the service to get immediate status
      const immediateCheck = await checkServiceStatus(response);

      if (!response.healthy && !immediateCheck) {
        // Service is marked as unhealthy and immediate check also failed
        const failingSinceDate = new Date(response.failing_since || "");
        await interaction.editReply(
          `The monitored service _'${response.name}'_ (${
            response.ip
          }) is currently :red_square: **DOWN**. It has been marked as unhealthy since ${failingSinceDate.toLocaleString()}.`
        );
        return;
      } else if (!response.healthy && immediateCheck) {
        // DB says it's unhealthy, but immediate check says it's up - update DB
        await pb
          .collection<MonitorRecord>("monitoring")
          .update(response.id || "", {
            healthy: true,
            failing_since: null,
          });
        await interaction.editReply(
          `The monitored service _'${response.name}'_ is currently :green_circle: **UP**.`
        );
        return;
      } else if (response.healthy && !immediateCheck) {
        // DB says it's healthy, but immediate check says it's down - update DB
        await pb
          .collection<MonitorRecord>("monitoring")
          .update(response.id || "", {
            healthy: false,
            failing_since: new Date().toISOString(),
          });
        await interaction.editReply(
          `The monitored service _'${response.name}'_ is currently :red_square: **DOWN**.`
        );
        return;
      } else if (response.healthy && immediateCheck) {
        // Both say it's healthy
        await interaction.editReply(
          `The monitored service _'${response.name}'_ is currently :green_circle: **UP**.`
        );
        return;
      }
    } else {
      // No specific service name provided, list all monitored services for the server
      const response = await pb
        .collection<MonitorRecord>("monitoring")
        .getFullList({
          filter: `server_id = "All" || server_id = "${interaction.guildId}"`,
        });

      if (response.length === 0) {
        await interaction.editReply(
          `There are no monitored services for this server.`
        );
        return;
      }

      // Don't want to run a lot of pings, so just report the DB statuses
      let replyMessage = `Monitored services for this server:\n`;
      for (const monitor of response) {
        replyMessage += `- _'${monitor.name}'_ (${monitor.ip}): **${
          monitor.healthy ? ":green_circle: UP" : ":red_square: DOWN"
        }**\n`;
      }
      await interaction.editReply(replyMessage);
    }

    logCommand();
  } catch (error) {
    console.error("Error in monitor-check command:", error);
    await interaction.editReply(
      `There was an error while checking the monitored service(s). Please try again later.`
    );
  }
};
