import { db } from "./../../../utilities/db";
import { HammerspaceItem } from "./../../../types";
import { Message } from "discord.js";

export const runSlap = (message: Message) => (args: string[]) => {
  // Determine target from the args, or use the author if empty
  const slapTarget = args.length ? args.join(" ") : message.author.username;
  // This the template for the slap
  let slapMessage = "**Fini slaps {0}{1} with {2}**";

  // Random change to slap the shit out of the target
  slapMessage = slapMessage.replace(
    "{0}",
    Math.random() > 0.15 ? "" : "the shit out of "
  );

  // Add the target of the slap
  slapMessage = slapMessage.replace("{1}", slapTarget.trim());

  return db()
    .select<HammerspaceItem>("Hammerspace", "Random", message.guild.id)
    .then((results) => {
      // finally give it the hammerspace item
      slapMessage = slapMessage.replace("{2}", results[0].Item);
      db()
        .update(
          "Hammerspace",
          {
            Field: "ID",
            Value: results[0].ID,
          },
          {
            Field: "TimesUsed",
            Value: results[0].TimesUsed + 1,
          },
          message.guild.id
        )
        .catch((err) => console.error(err));
      return slapMessage;
    })
    .catch((err) => {
      return `I fucked up... ${err}`;
    });
};
