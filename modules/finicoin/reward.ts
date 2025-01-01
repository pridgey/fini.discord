import { Message } from "discord.js";
import { addCoin, getUserBalance, removeCoin } from "./finicoin";
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

    console.log("User should be rewarded", {
      username,
      servername,
      secondsSinceLastMessage,
      messageLength,
      messageScore,
      messageReward,
      totalReward: userChatStats[userId].todayEarnings,
    });

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

  // ==================================================

  // // The period of time for messages to grow (in milliseconds)
  // const TIME_PERIOD = 60_000; // 900_000; // 15 min
  // // Maximum messages in the determined period
  // const MAX_MESSAGES = 20;
  // // The base amount of finicoin per message
  // const BASE_REWARD = 2;
  // // Maximum amount of finicoin balance to be used in reward calculation
  // const BALANCE_CEILING = 200;

  // // authorID for stats
  // const authorID: string = message.author.id;
  // // time of message
  // const messageTimestamp2 = message.createdAt.valueOf();
  // // author's current balance
  // const authorBalance =
  //   (await getUserBalance(authorID, message.guildId || "")) ?? 0;
  // // random generator
  // const rewardVariable = randomNumber(0.01, 0.05);

  // // Updates user message stats for reward calculation
  // userChatStats[authorID] = {
  //   numberOfMessagesInPeriod:
  //     (userChatStats[authorID]?.numberOfMessagesInPeriod ?? 0) + 1,
  //   timeOfFirstMessage:
  //     userChatStats[authorID]?.timeOfFirstMessage ?? messageTimestamp,
  // };

  // // Grab stats for easy use
  // const userStat_NumberofMessages =
  //   userChatStats[authorID].numberOfMessagesInPeriod;
  // const userStat_TimeOfFirstMessage =
  //   userChatStats[authorID].timeOfFirstMessage;

  // // If we've exceeded message period, reset
  // if (messageTimestamp - userStat_TimeOfFirstMessage > TIME_PERIOD) {
  //   userChatStats[authorID] = {
  //     numberOfMessagesInPeriod: 1,
  //     timeOfFirstMessage: messageTimestamp,
  //   };
  // }

  // // Calculate rewarded finicoin for this message
  // const effectiveMessageCount = Math.min(
  //   userStat_NumberofMessages,
  //   MAX_MESSAGES
  // );
  // let messageReward = Math.round(
  //   BASE_REWARD * effectiveMessageCount +
  //     Math.min(authorBalance, BALANCE_CEILING) * rewardVariable
  // );

  // console.log("Debug", { username: message.author.username, messageReward });

  // // Award the chat reward
  // await addCoin(
  //   "Fini",
  //   message.guildId || "",
  //   messageReward,
  //   "Fini",
  //   message.guild?.name ?? "unknown guild name"
  // );

  // // Roll for jackpot
  // await rollJackpot(message);

  // // Finally reward the amount to the user
  // await addCoin(
  //   authorID,
  //   message.guildId || "",
  //   messageReward,
  //   message.author.username ?? "unknown username",
  //   message.guild?.name ?? "uknown guild name"
  // );
};
