import { Message } from "discord.js";
import { addCoin } from "./finicoin";
import { rollJackpot } from "./jackpot";
import { pb } from "../../utilities/pocketbase";
import { MessageRewardStats } from "../../types/PocketbaseTables";

/**
 * Utility function to calculate the score of a message, based on word count and unique words
 * @param messageContent the message string
 * @returns a numeric score
 */
const calculateMessageScore = (messageContent: string) => {
  // Calculate quality based on length and complexity
  const words = messageContent.toLowerCase().split(/\s+/);
  const lengthScore = Math.min(words.length / 10, 1.0); // Max score at 10 words

  // Check for message complexity (unique words ratio)
  const uniqueWords = new Set(words);
  const uniqueRatio = words.length > 0 ? uniqueWords.size / words.length : 0;

  // Combine scores (weights can be adjusted)
  return lengthScore * 0.6 + uniqueRatio * 0.4;
};

/**
 * The main way to get fini coin is to simply chat in the server. This calculates how much coin to reward to the user
 */
export const rewardCoin = async (message: Message) => {
  // Base reward amount before calculations
  const BASE_REWARD_AMOUNT = 0.5;
  // Max reward threshold
  const MAX_REWARD_AMOUNT = 5;
  // Minimum message length to get coin
  const MIN_MESSAGE_LENGTH = 5;
  // Daily cap that a user can gain per day
  const DAILY_CAP = 100;
  // Cool down between messages
  const COOL_DOWN_SECONDS = 5;

  // Get info for logging and operations
  const userId = message.author.id;
  const username = message.author.username;
  const serverId = message.guildId ?? "unknown server id";
  const servername = message.guild?.name ?? "unknown server name";
  const messageTimestamp = message.createdAt.valueOf();
  const messageLength = message.content.length;
  const messageContent = message.content;

  // Determine what today is
  const today = new Date();
  const todayDateString = `${today.getFullYear()}${today.getMonth()}${today.getDate()}`;

  // Get user chat stats
  const messageRewardResponse = await pb
    .collection<MessageRewardStats>("message_reward_stats")
    .getFullList({
      filter: `user_id = "${userId}" && server_id = "${serverId}"`,
    });

  let userChat = messageRewardResponse?.[0];

  // Create record for user if it doesn't exist
  if (!userChat?.id) {
    userChat = await pb
      .collection<MessageRewardStats>("message_reward_stats")
      .create({
        user_id: userId,
        server_id: serverId,
        identifier: `${username}-${servername}`,
        today: todayDateString,
        today_earnings: 0,
        number_messages_in_period: 0,
        last_message_timestamp: 0,
        last_message: "",
      });
  }

  // Reset today if different days
  if (todayDateString !== userChat.today) {
    await pb
      .collection<MessageRewardStats>("message_reward_stats")
      .update(userChat.id ?? "unknown messageRewardStats id", {
        today: todayDateString,
        today_earnings: 0,
        number_messages_in_period: 0,
      });
  }

  // seconds since last message
  const userLastTimestamp = userChat.last_message_timestamp;
  const secondsSinceLastMessage = (messageTimestamp - userLastTimestamp) / 1000;

  // Determine if we should reward user
  if (
    messageLength >= MIN_MESSAGE_LENGTH &&
    userChat.today_earnings < DAILY_CAP &&
    secondsSinceLastMessage > COOL_DOWN_SECONDS &&
    userChat.last_message !== messageContent
  ) {
    // Run reward calculations
    const messageScore = calculateMessageScore(messageContent);
    const messageReward = Number(
      Math.max(BASE_REWARD_AMOUNT, MAX_REWARD_AMOUNT * messageScore).toFixed(2)
    );

    // Award user for chatting
    await addCoin(
      userId,
      serverId,
      messageReward,
      username,
      servername,
      "Reserve"
    );

    // Roll jackpot
    await rollJackpot(message);

    // Update user stats
    await pb
      .collection<MessageRewardStats>("message_reward_stats")
      .update(userChat.id ?? "unknown messageRewardStats id", {
        today: todayDateString,
        last_message_timestamp: messageTimestamp,
        number_messages_in_period: userChat.number_messages_in_period + 1,
        today_earnings: userChat.today_earnings + messageReward,
        last_message: messageContent,
      });
  }
};
