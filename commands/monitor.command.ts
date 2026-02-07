import { SlashCommandBuilder } from "@discordjs/builders";
import { ChatInputCommandInteraction } from "discord.js";
import type { MonitorRecord } from "../types/PocketbaseTables";
import { pb } from "../utilities/pocketbase";
import { checkServiceStatus } from "../modules/polling/monitoring";

export const data = new SlashCommandBuilder()
  .setName("monitor")
  .setDescription("Will monitor a service or website for you")
  .addStringOption((option) =>
    option
      .setName("name")
      .setDescription("Name of the service or website to monitor")
      .setRequired(true),
  )
  .addStringOption((option) =>
    option
      .setName("ip")
      .setDescription("IP address or URL of the service or website to monitor")
      .setRequired(true),
  )
  .addNumberOption((option) =>
    option
      .setName("interval")
      .setDescription("Interval in minutes to check the service")
      .setRequired(true)
      .setChoices(
        [5, 15, 30, 60].map((i) => ({ name: `${i} minutes`, value: i })),
      ),
  );

export const execute = async (
  interaction: ChatInputCommandInteraction,
  logCommand: () => void,
) => {
  const name = interaction.options.get("name")?.value?.toString() || "";
  const ip = interaction.options.get("ip")?.value?.toString() || "";
  const interval = interaction.options.get("interval")?.value as number;

  if (!name || !ip || !interval) {
    interaction.reply(
      `Please provide all required options: name, ip, interval.`,
    );
    return;
  }

  // Defer reply
  await interaction.deferReply();

  // Check if the monitor already exists for this and server
  const existingMonitors = await pb
    .collection<MonitorRecord>("monitoring")
    .getFullList({
      filter: `name = "${name}" && server_id = "${interaction.guild?.id}"`,
    });

  if (existingMonitors.length > 0) {
    // Monitor exists, if it is this user's monitor, edit it, otherwise return error
    const monitor = existingMonitors[0];
    if (monitor.user_id === interaction.user.id) {
      if (ip !== monitor.ip || interval !== monitor.frequency) {
        // Update monitor
        await pb
          .collection<MonitorRecord>("monitoring")
          .update(monitor.id || "", {
            ip,
            interval,
            frequency: interval,
          });

        await interaction.editReply(
          `Monitor with the name ${name} updated successfully.`,
        );
        logCommand();

        return;
      } else {
        // No changes made
        await interaction.editReply(
          `You already have a monitor with the name ${name} and no changes were made.`,
        );
        logCommand();

        return;
      }
    } else {
      // Different user's monitor with same name
      await interaction.editReply(
        `A monitor with the name ${name} already exists. Please choose a different name.`,
      );
      logCommand();

      return;
    }
  }

  // Ping the service or website to make sure it's reachable
  const initialServiceCheck = await checkServiceStatus({ ip });
  if (!initialServiceCheck) {
    interaction.editReply(
      `The service at ${ip} is not reachable. Please check the IP / URL and try again.`,
    );
    return;
  }

  // Add monitor to database
  await pb.collection<MonitorRecord>("monitoring").create({
    name,
    ip,
    interval,
    frequency: interval,
    healthy: true,
    failing_since: "",
    identifier: `${interaction.user.username}-${
      interaction.guild?.name || "Unknown Server"
    }`,
    server_id: interaction.guildId || "",
    user_id: interaction.user.id,
  } as MonitorRecord);

  // Monitor added successfully
  interaction.editReply(
    `Successfully added monitor for ${name} at ${ip} with an interval of ${interval} minutes.`,
  );

  logCommand();
};
