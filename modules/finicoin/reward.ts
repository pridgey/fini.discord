import { Message } from "discord.js";
import { addCoin, getUserBalance } from "./finicoin";
import { randomNumber } from "./../../utilities/randomNumber";
import { rollJackpot } from "./jackpot";

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

// User Chat Stats keeps track of the user's reward through a daily period
type userChatStatsType = Record<
  string,
  {
    today: string;
    todayEarnings: number;
    numberOfMessagesInPeriod: number;
    lastMessageTimestamp: number;
    lastMessage: string;
  }
>;
let userChatStats: userChatStatsType = {};

// Determines the current date to refresh fini coin earnings
let currentdate: string;

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
  const COOL_DOWN_SECONDS = 3;

  // Determine what today is
  const today = new Date();
  const todayDateString = `${today.getFullYear()}${today.getMonth()}${today.getDate()}`;
  // Reset today if different days
  if (todayDateString !== currentdate) {
    // Update current date
    currentdate = todayDateString;

    // Reset user chat stats
    userChatStats = {};
  }

  // Get info for logging and operations
  const userId = message.author.id;
  const username = message.author.username;
  const serverId = message.guildId ?? "unknown server id";
  const servername = message.guild?.name ?? "unknown server name";
  const messageTimestamp = message.createdAt.valueOf();
  const messageLength = message.content.length;
  const messageContent = message.content;

  // Initialize user chat if needed
  if (!Object.hasOwn(userChatStats, userId)) {
    userChatStats[userId] = {
      lastMessageTimestamp: 0,
      numberOfMessagesInPeriod: 0,
      today: currentdate,
      todayEarnings: 0,
      lastMessage: "",
    };
  }

  // seconds since last message
  const userLastTimestamp = userChatStats[userId].lastMessageTimestamp;
  const secondsSinceLastMessage = (messageTimestamp - userLastTimestamp) / 1000;

  // Determine if we should reward user
  if (
    messageLength >= MIN_MESSAGE_LENGTH &&
    userChatStats[userId].todayEarnings < DAILY_CAP &&
    secondsSinceLastMessage > COOL_DOWN_SECONDS &&
    userChatStats[userId].lastMessage !== messageContent
  ) {
    // Run reward calculations
    const messageScore = calculateMessageScore(messageContent);
    const messageReward = Math.max(
      BASE_REWARD_AMOUNT,
      MAX_REWARD_AMOUNT * messageScore
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
    userChatStats[userId] = {
      today: currentdate,
      lastMessageTimestamp: messageTimestamp,
      numberOfMessagesInPeriod:
        userChatStats[userId].numberOfMessagesInPeriod + 1,
      todayEarnings: userChatStats[userId].todayEarnings + messageReward,
      lastMessage: messageContent,
    };
  }
};
