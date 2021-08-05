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
  };

  // Return a promise we can use to use on the index to reply with a message
  return new Promise((resolve, reject) => {
    if (command in commandDict) {
      resolve(commandDict[command](args));
    } else {
      reject();
    }
  });
};
