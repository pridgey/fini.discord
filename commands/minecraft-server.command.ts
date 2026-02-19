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
} from "../utilities/minecraft/checkServerStatus";
import { getPublicIP } from "../utilities/misc/getPublicIp";
import { getServerPlayers } from "../utilities/minecraft/getServerPlays";

export const data = new SlashCommandBuilder()
  .setName("minecraft-server")
  .setDescription("Checks the state of the Fini minecraft server")
  .addBooleanOption((option) =>
    option
      .setName("start")
      .setDescription("Request to start the server if it's offline")
      .setRequired(false),
  )
  .addBooleanOption((option) =>
    option
      .setName("list-players")
      .setDescription("List current players on the server")
      .setRequired(false),
  );

export const execute = async (
  interaction: ChatInputCommandInteraction,
  logCommand: () => void,
) => {
  await interaction.deferReply();

  const isRunning = await getServerStatus();
  const requestStart = interaction.options.getBoolean("start");

  if (!isRunning) {
    const buttonRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`minecraft_server:${interaction.user.id}`)
        .setLabel("Start Server")
        .setStyle(ButtonStyle.Primary),
    );

    const startAction = requestStart ? [buttonRow] : [];

    await interaction.editReply({
      content: "The Fini Minecraft server is currently offline.",
      components: startAction,
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

  if (listPlayers) {
    if (playerList.length > 0) {
      replyText += `\n\nCurrent players online:\n- ${playerList.join("\n- ")}`;
    } else {
      replyText += `\nNo players are currently online.`;
    }
  }

  await interaction.editReply(replyText);
  logCommand();
};
