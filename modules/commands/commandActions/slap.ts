import { db } from "./../../../utilities/db";
import { HammerspaceItem } from "./../../../types";
import { Guild } from "discord.js";

export const runSlap = (server: Guild) => (args: string[]) => {
  console.log("args:", args);

  db()
    .select<HammerspaceItem>(
      "Hammerspace",
      { field: "ID", value: 322 },
      server.id
    )
    .then((results) => {
      console.log("Results:", results[0].Item);
    })
    .catch((err) => console.error("oh fuck:", err));

  return "slappity slap";
};
