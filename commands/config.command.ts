import { SlashCommandBuilder } from "@discordjs/builders";
import { ChatInputCommandInteraction, PermissionFlagsBits } from "discord.js";
import { ConfigRecord } from "../types/PocketbaseTables";
import { pb } from "../utilities/pocketbase";

export const data = new SlashCommandBuilder()
  .setName("config")
  .setDescription("Configure bot settings for this server")
  .addChannelOption((option) =>
    option
      .setName("bot_channel")
      .setDescription(
        "Set the bot channel for this server. (Default: Main Channel)",
      )
      .setRequired(false),
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

export const execute = async (
  interaction: ChatInputCommandInteraction,
  logCommand: () => void,
) => {
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
    return interaction.reply({
      content: "This command is admin only!",
      ephemeral: true,
    });
  }
  const botChannel = interaction.options.get("bot_channel")?.value?.toString();

  await interaction.deferReply();

  // Check if a config record already exists for this server
  const configRecord = await pb
    .collection<ConfigRecord>("config")
    .getFirstListItem(`server_id = "${interaction.guildId}"`)
    .catch(() => null);

  if (configRecord && configRecord.id) {
    // Update existing record
    await pb.collection<ConfigRecord>("config").update(configRecord.id, {
      bot_channel: botChannel || null,
    });
  } else {
    // Create new record
    const botChannelName = interaction.guild?.channels.cache.get(
      botChannel || "",
    )?.name;

    await pb.collection<ConfigRecord>("config").create({
      server_id: interaction.guildId || "",
      bot_channel: botChannel || null,
      identifier: `${interaction.guild?.name || "Unknown Server"}-${
        botChannelName || "Unknown Channel"
      }`,
    });
  }

  interaction.editReply(`Configuration updated successfully for this server.`);

  logCommand();
};
