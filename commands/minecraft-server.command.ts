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

export const data = new SlashCommandBuilder()
  .setName("minecraft-server")
  .setDescription("Checks the state of the Fini minecraft server");

export const execute = async (
  interaction: ChatInputCommandInteraction,
  logCommand: () => void,
) => {
  await interaction.deferReply();

  const isRunning = await getServerStatus();

  if (!isRunning) {
    const buttonRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`minecraft_server:offline:${interaction.user.id}`)
        .setLabel("Start Server")
        .setStyle(ButtonStyle.Primary),
    );

    await interaction.editReply({
      content: "The Fini Minecraft server is currently offline.",
      components: [buttonRow],
    });
    logCommand();
    return;
  }

  const publicIP = await getPublicIP();

  if (!publicIP) {
    await interaction.editReply(
      "The Fini Minecraft server is currently online, but I couldn't retrieve the public IP address.",
    );
    logCommand();
    return;
  }

  const response = `The Fini Minecraft server is currently online! You can connect to it using the following IP address: \`${publicIP}:${MINECRAFT_PORT}\``;

  await interaction.editReply(response);
  logCommand();
};
