import { SlashCommandBuilder } from "@discordjs/builders";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChatInputCommandInteraction,
} from "discord.js";
import {
  getServerStatus,
  MINECRAFT_PORT,
} from "../modules/minecraft/checkServerStatus";
import { ADMIN_ID } from "../utilities/discord/isAdmin";
import { checkForPackUpdate } from "../modules/minecraft/packUpdate";
import { getPublicIP } from "../modules/minecraft/getPublicIp";
import { getServerPlayers } from "../modules/minecraft/getServerPlays";

export const data = new SlashCommandBuilder()
  .setName("minecraft-server")
  .setDescription("Checks the state of the Fini minecraft server");

export const execute = async (
  interaction: ChatInputCommandInteraction,
  logCommand: () => void,
) => {
  await interaction.deferReply();

  const [isRunning, update] = await Promise.all([
    getServerStatus(),
    checkForPackUpdate(),
  ]);

  // Shown to everyone so the server never sits offline waiting on one person,
  // and so everyone can see when an update is waiting
  const updateNotice = update?.updateAvailable
    ? `\n⬆️ Pack update available: \`${update.installed}\` → \`${update.latest}\`${
        ADMIN_ID ? ` (only <@${ADMIN_ID}> can install it)` : ""
      }`
    : "";

  if (!isRunning) {
    const buttons = [
      new ButtonBuilder()
        .setCustomId(`minecraft_server:${interaction.user.id}`)
        .setLabel("Start Server")
        .setStyle(ButtonStyle.Primary),
    ];

    // Visible to all, admin-only to press - the handler re-checks, since a
    // custom id is clickable by anyone who can see the message
    if (update?.updateAvailable) {
      buttons.push(
        new ButtonBuilder()
          .setCustomId(`minecraft_update:${update.latest}`)
          .setLabel(`Install update ${update.latest}`)
          .setStyle(ButtonStyle.Secondary)
          .setEmoji("⬆️"),
      );
    }

    const buttonRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      ...buttons,
    );

    await interaction.editReply({
      content: `The Fini Minecraft server is currently offline.${updateNotice}`,
      components: [buttonRow],
      // The notice names the admin, but shouldn't ping them every time
      // somebody checks on the server
      allowedMentions: { parse: [] },
    });
    logCommand();
    return;
  }

  // Server is online, return connection info

  const publicIP = await getPublicIP();

  if (!publicIP) {
    await interaction.editReply(
      "The Fini Minecraft server is currently online, but I couldn't retrieve the public IP address.",
    );
    logCommand();
    return;
  }

  const listPlayers = interaction.options.getBoolean("list-players");

  let replyText = "The Fini Minecraft server is currently online!";

  const players = await getServerPlayers();
  const isolatedPlayersString = players?.trim().split(":").pop() || "";
  const playerList = isolatedPlayersString
    ? isolatedPlayersString?.split(",").map((p) => p.trim()) ||
      [].filter((p) => !!p)
    : [];

  replyText += ` (\`${publicIP}:${MINECRAFT_PORT}\`)`;

  if (playerList.length > 0) {
    replyText += `\n\nCurrent players online:\n- ${playerList.join("\n- ")}`;
  } else {
    replyText += `\nNo players are currently online.`;
  }

  await interaction.editReply({
    content: replyText + updateNotice,
    allowedMentions: { parse: [] },
  });
  logCommand();
};
