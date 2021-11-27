import { db } from "./../../../utilities/db";
import { HammerspaceItem } from "./../../../types";
import { Message } from "discord.js";

export const runBlame = (message: Message) => (args: string[]) => {
  // Determine the item we're looking up via the args
  const blameItem: string = args.join(" ");

  if (blameItem.length) {
    return db()
      .select<HammerspaceItem>(
        "Hammerspace",
        {
          Field: "Item",
          Value: blameItem,
        },
        message.guild.id
      )
      .then((results) => {
        if (results[0]) {
          // We found it
          const foundItem = results[0];
          // Pull out the Date Created so we can look at it
          const dateCreated = new Date(Number(foundItem.DateCreated));
          // Form the info and return it
          return `Hammerspace entry _'${foundItem.Item}'_ was created by **${
            foundItem.User
          }** on **${dateCreated.toLocaleDateString()}** and has been used **${
            foundItem.TimesUsed ?? 0
          }** time${foundItem.TimesUsed === 1 ? "" : "s"}`;
        } else {
          // Let them know we couldn't find anything
          return `I couldn't find anything matching _'${blameItem}'_`;
        }
      })
      .catch((err) => {
        return `I fucked up: ${err} D=`;
      });
  } else {
    return new Promise<string>((resolve) =>
      resolve("I can't find anything if you don't give me something to find")
    );
  }
};
