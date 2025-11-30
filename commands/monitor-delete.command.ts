import { SlashCommandBuilder } from "@discordjs/builders";
import { CommandInteraction } from "discord.js";
import { MonitorRecord, PersonalitiesRecord } from "../types/PocketbaseTables";
import { pb } from "../utilities/pocketbase";

export const data = new SlashCommandBuilder()
  .setName("monitor-delete")
  .setDescription("Deletes a monitor service.")
  .addStringOption((option) =>
    option
      .setName("name")
      .setDescription("The name of the monitor to delete.")
      .setRequired(true)
  );

export const execute = async (
  interaction: CommandInteraction,
  logCommand: () => void
) => {
  const monitorName = interaction.options.get("name")?.value?.toString() || "";

  if (!monitorName.length) {
    // Input invalid
    await interaction.reply({
      content: "A monitor needs a name (to delete).",
    });

    logCommand();
  } else {
    // Input is valid
    try {
      // Check to see if there's a monitor with this name
      const existingMonitors = await pb
        .collection<MonitorRecord>("monitoring")
        .getFullList({
          filter: `user_id = "${interaction.user.id}" && name = "${monitorName}" && server_id = "${interaction.guild?.id}"`,
        });

      if (existingMonitors.length > 0) {
        const monitor = existingMonitors[0];
        const monitoredIp =
          monitor.ip + (monitor.port ? `:${monitor.port}` : "");

        // It's there, delete it
        await pb
          .collection<MonitorRecord>("monitoring")
          .delete(monitor.id || "");
        await interaction.reply(
          `${monitorName} (${monitoredIp}) deleted. This will no longer be monitored.`
        );

        logCommand();
      } else {
        // No other personalities with this name (for this user)
        await interaction.reply(
          `Could not find a monitored service you configured with the name ${monitorName}.`
        );

        logCommand();
      }
    } catch (err) {
      const error: Error = err as Error;
      const errorMessage = `Error during /monitor-delete command: ${error.message}`;
      console.error(errorMessage);
      await interaction.reply({
        content: errorMessage,
      });
      logCommand();
    }
  }
};
