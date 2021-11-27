import { db } from "./../../../utilities/db";
import { HammerspaceItem } from "./../../../types";
import { Message } from "discord.js";

export const runAdd = (message: Message) => (args: string[]) => {
  const itemToAdd = args.join(" ");

  if (itemToAdd.length) {
    if (itemToAdd?.length < 100) {
      return db()
        .insert<HammerspaceItem>("Hammerspace", {
          DateCreated: Date.now(),
          Item: itemToAdd,
          Server: message.guild.id,
          TimesUsed: 0,
          User: message.author.username,
        })
        .then(
          () =>
            `I've added _${itemToAdd}_ to the ${message.guild.name} Hammerspace`
        )
        .catch((err) => `I fucked up: ${err}`);
    } else {
      return new Promise<string>((resolve) =>
        resolve("I'm way too lazy to add an item that long")
      );
    }
  } else {
    return new Promise<string>((resolve) =>
      resolve("I can't add nothing, crazy pants.")
    );
  }
};
