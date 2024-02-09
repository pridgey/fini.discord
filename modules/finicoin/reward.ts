import { Message } from "discord.js";
import { addCoin, getUserBalance, removeCoin } from "./finicoin";
import { randomNumber } from "./../../utilities/randomNumber";
import { rollJackpot } from "./jackpot";

type userChatStatsType = Record<
  string,
  {
    numberOfMessagesInPeriod: number;
    timeOfFirstMessage: number;
  }
>;

const userChatStats: userChatStatsType = {};

export const rewardCoin = async (message: Message) => {
  // The period of time for messages to grow (in milliseconds)
  const TIME_PERIOD = 60000; // 900_000; // 15 min
  // Maximum messages in the determined period
  const MAX_MESSAGES = 20;
  // The base amount of finicoin per message
  const BASE_REWARD = 2;
  // The value to be under to win the jackpot (out of 100)
  const JACKPOT_CEILING = 0.5;
  // Maximum amount of finicoin balance to be used in reward calculation
  const BALANCE_CEILING = 200;
  // Emoji to react for jackpot (currently pika thumbs up)
  const JACKPOT_EMOJI = "1088849190861410314";

  // authorID for stats
  const authorID: string = message.author.id;
  // time of message
  const messageTimestamp = message.createdAt.valueOf();
  // author's current balance
  const authorBalance =
    (await getUserBalance(authorID, message.guildId || "")) ?? 0;
  // random generator
  const rewardVariable = randomNumber(0.01, 0.05);

  // Updates user message stats for reward calculation
  userChatStats[authorID] = {
    numberOfMessagesInPeriod:
      (userChatStats[authorID]?.numberOfMessagesInPeriod ?? 0) + 1,
    timeOfFirstMessage:
      userChatStats[authorID]?.timeOfFirstMessage ?? messageTimestamp,
  };

  // Grab stats for easy use
  const userStat_NumberofMessages =
    userChatStats[authorID].numberOfMessagesInPeriod;
  const userStat_TimeOfFirstMessage =
    userChatStats[authorID].timeOfFirstMessage;

  // If we've exceeded message period, reset
  if (messageTimestamp - userStat_TimeOfFirstMessage > TIME_PERIOD) {
    userChatStats[authorID] = {
      numberOfMessagesInPeriod: 1,
      timeOfFirstMessage: messageTimestamp,
    };
  }

  // Calculate rewarded finicoin for this message
  const effectiveMessageCount = Math.min(
    userStat_NumberofMessages,
    MAX_MESSAGES
  );
  let messageReward = Math.round(
    BASE_REWARD * effectiveMessageCount +
      Math.min(authorBalance, BALANCE_CEILING) * rewardVariable
  );

  // Award the chat reward
  await addCoin("Fini", message.guildId || "", messageReward);

  // Roll for jackpot
  await rollJackpot(message);

  // Finally reward the amount to the user
  await addCoin(authorID, message.guildId || "", messageReward);
};
