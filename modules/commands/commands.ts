import { Guild } from "discord.js";
import {
  runSlap,
  runBlame,
  runSpout,
  runSubscribe,
  runAdd,
} from "./commandActions";

export const commands = (
  command: string,
  args: string[],
  server: Guild
): Promise<string> => {
  // Dictionary of commands and their corresponding funtions
  const commandDict: { [key: string]: (args: string[]) => string } = {
    add: runAdd,
    blame: runBlame,
    slap: runSlap(server),
    spout: runSpout,
    subscribe: runSubscribe,
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
