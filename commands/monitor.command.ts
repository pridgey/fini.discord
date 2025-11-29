import { SlashCommandBuilder } from "@discordjs/builders";
import { CommandInteraction } from "discord.js";
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
      .setRequired(true)
  )
  .addStringOption((option) =>
    option
      .setName("ip")
      .setDescription("IP address or URL of the service or website to monitor")
      .setRequired(true)
  )
  .addNumberOption((option) =>
    option
      .setName("interval")
      .setDescription("Interval in minutes to check the service")
      .setRequired(true)
      .setChoices(
        [1, 5, 15, 30, 60].map((i) => ({ name: `${i} minutes`, value: i }))
      )
  )
  .addNumberOption((option) =>
    option
      .setName("port")
      .setDescription("Port number of the service or website to monitor")
      .setRequired(false)
  );

export const execute = async (
  interaction: CommandInteraction,
  logCommand: () => void
) => {
  const name = interaction.options.get("name")?.value?.toString() || "";
  const ip = interaction.options.get("ip")?.value?.toString() || "";
  const port = interaction.options.get("port")?.value as number;
  const interval = interaction.options.get("interval")?.value as number;

  if (!name || !ip || !interval) {
    interaction.reply(
      `Please provide all required options: name, ip, interval.`
    );
    return;
  }

  // Defer reply
  await interaction.deferReply();

  // Ping the service or website to make sure it's reachable
  const initialServiceCheck = await checkServiceStatus({ ip, port });
  if (!initialServiceCheck) {
    interaction.editReply(
      `The service at ${ip}${
        port ? `:${port}` : ""
      } is not reachable. Please check the IP and port and try again.`
    );
    return;
  }

  // Add monitor to database
  await pb.collection<MonitorRecord>("monitoring").create({
    name,
    ip,
    port,
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
    `Successfully added monitor for ${name} at ${ip}${
      port ? `:${port}` : ""
    } with an interval of ${interval} minutes.`
  );

  logCommand();
};
