import { Client, TextChannel } from "discord.js";
import { getBotChannelForServer } from "../config/configUtils";

export const sendToChannelById = async (
  cl: Client,
  channelId: string,
  message: string
) => {
  try {
    const channel = await cl.channels.fetch(channelId);
    if (channel && channel.isTextBased()) {
      await (channel as TextChannel).send(message);
    } else {
      console.error(
        `Channel with ID ${channelId} is not text-based or could not be found.`
      );
    }
  } catch (error) {
    console.error(`Error sending message to channel ID ${channelId}:`, error);
  }
};

export const sendToBotChannelByServerId = async (
  cl: Client,
  serverId: string,
  message: string
) => {
  // Get bot channel for server
  const botChannelId = await getBotChannelForServer(serverId);
  if (botChannelId) {
    // Use configured bot channel
    await sendToChannelById(cl, botChannelId, message);
  } else {
    // Get system channel for server
    const guild = await cl.guilds.fetch(serverId).catch(() => null);
    const systemChannelId = guild?.systemChannelId;
    if (systemChannelId) {
      // Use system channel if no bot channel configured
      await sendToChannelById(cl, systemChannelId, message);
      return;
    } else {
      // No bot channel or system channel configured
      console.error(
        `No bot channel configured for server ID ${serverId}. Message not sent.`
      );
    }
  }
};
