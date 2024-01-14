import { Message } from "discord.js";
import { addCoin, getUserBalance, removeCoin } from "../finicoin";
import { randomNumber } from "../../utilities/randomNumber";

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
  const JACKPOT_CEILING = 2;
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
  const rewardVariable = randomNumber(messageTimestamp, 0.01, 0.05);

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

  const jackPotRandom = randomNumber(Date.now() * messageTimestamp, 0, 100);
  if (jackPotRandom < JACKPOT_CEILING) {
    // Get fini's balance (aka the jackpot)
    const finiBalance =
      (await getUserBalance("Fini", message.guildId || "")) ?? 0;
    // Add jackpot to the message reward
    messageReward += finiBalance;
    // react the message as an indicator
    await message.react(JACKPOT_EMOJI);
    // reset fini balance
    await removeCoin("Fini", message.guildId || "", finiBalance);
  } else {
    // The user didn't win, so add the reward to fini's balance (aka the jackpot)
    await addCoin("Fini", message.guildId || "", messageReward);
  }

  console.log("Message Rewards:", {
    content: message.content,
    authorID,
    username: message.author.username,
    messageTimestamp,
    rewardVariable,
    userStat_NumberofMessages,
    userStat_TimeOfFirstMessage,
    isOverPeriod: messageTimestamp - userStat_TimeOfFirstMessage > TIME_PERIOD,
    effectiveMessageCount,
    messageReward,
    JACKPOT_CEILING,
    jackPotRandom,
    wonJackpot: jackPotRandom < JACKPOT_CEILING,
  });

  // Finally reward the amount to the user
  await addCoin(authorID, message.guildId || "", messageReward);
};
