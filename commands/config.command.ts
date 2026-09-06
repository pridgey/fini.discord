import { SlashCommandBuilder } from "@discordjs/builders";
import { ChatInputCommandInteraction, PermissionFlagsBits } from "discord.js";
import { ConfigRecord } from "../types/PocketbaseTables";
import { pb } from "../utilities/pocketbase";
import {
  DEFAULT_HORSEY_NAMES,
  parseHorseyNames,
  serializeHorseyNames,
} from "../modules/games/horsey/horseyNames";
import { HORSE_COUNT } from "../modules/games/horsey/horseyUtilities";

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
  .addStringOption((option) =>
    option
      .setName("horsey_names")
      .setDescription(
        `Names for the ${HORSE_COUNT} /horsey racers, comma separated. Leave blank to reset.`,
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

  await interaction.deferReply();

  /*
   * Only the options the admin actually passed are written.
   *
   * This used to write `bot_channel: botChannel || null` unconditionally, so
   * running /config to change any one setting silently cleared the bot channel.
   * With a second option that is no longer a latent bug but an immediate one -
   * setting horsey names would have unset the channel every time.
   */
  const updates: Partial<ConfigRecord> = {};

  const botChannelOption = interaction.options.get("bot_channel");
  if (botChannelOption) {
    updates.bot_channel = botChannelOption.value?.toString() || "";
  }

  const horseyNamesOption = interaction.options.get("horsey_names");
  if (horseyNamesOption) {
    updates.horsey_names = serializeHorseyNames(
      horseyNamesOption.value?.toString() || "",
    );
  }

  if (!Object.keys(updates).length) {
    await interaction.editReply(
      "Nothing to change - pass an option to update it.",
    );
    logCommand();
    return;
  }

  const configRecord = await pb
    .collection<ConfigRecord>("config")
    .getFirstListItem(`server_id = "${interaction.guildId}"`)
    .catch(() => null);

  if (configRecord?.id) {
    await pb.collection<ConfigRecord>("config").update(configRecord.id, updates);
  } else {
    const botChannelName = interaction.guild?.channels.cache.get(
      updates.bot_channel || "",
    )?.name;

    await pb.collection<ConfigRecord>("config").create({
      server_id: interaction.guildId || "",
      bot_channel: updates.bot_channel || "",
      horsey_names: updates.horsey_names || "",
      identifier: `${interaction.guild?.name || "Unknown Server"}-${
        botChannelName || "Unknown Channel"
      }`,
    });
  }

  // Confirm what actually changed, so an admin can see a reset took effect
  // rather than wondering whether a blank value did anything.
  const confirmations: string[] = [];

  if (updates.bot_channel !== undefined) {
    confirmations.push(
      updates.bot_channel
        ? `Bot channel set to <#${updates.bot_channel}>.`
        : "Bot channel cleared.",
    );
  }

  if (updates.horsey_names !== undefined) {
    const names = parseHorseyNames(updates.horsey_names);
    confirmations.push(
      updates.horsey_names
        ? `Horsey names set to: ${names.join(", ")}.`
        : `Horsey names reset to the defaults: ${DEFAULT_HORSEY_NAMES.join(", ")}.`,
    );
  }

  await interaction.editReply(confirmations.join("\n"));

  logCommand();
};
