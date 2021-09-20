import { Message } from "discord.js";
import {
  runSlap,
  runBlame,
  runBalance,
  runEvenOdd,
  runSpout,
  runSubscribe,
  runAdd,
  runWager,
  runStats,
  runJackpot,
} from "./commandActions";

export const commands = (
  command: string,
  args: string[],
  message: Message
): Promise<string> => {
  // Dictionary of commands and their corresponding funtions
  const commandDict: { [key: string]: (args: string[]) => Promise<string> } = {
    add: runAdd(message),
    balance: runBalance(message),
    blame: runBlame(message),
    evenodd: runEvenOdd(),
    slap: runSlap(message),
    spout: runSpout(message),
    subscribe: runSubscribe(message),
    wager: runWager(message),
    stats: runStats(message),
    jackpot: runJackpot(message),
  };

  // Return a promise we can use to use on the index to reply with a message
  return new Promise((resolve, reject) => {
    if (command in commandDict) {
      if (!require.main.path.includes("home/pi")) {
        message.channel.send("~Debug Mode~");
      }
      resolve(commandDict[command](args));
    } else {
      reject();
    }
  });
};
