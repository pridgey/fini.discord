import { db } from "./../../../utilities/db";
import { BankRecord } from "./../../../types";
import { Message } from "discord.js";

export const runJackpot = (message: Message) => () =>
  db()
    .select<BankRecord>(
      "Bank",
      { Field: "User", Value: "Fini" },
      message?.guild?.id || ""
    )
    .then((result) => {
      if (result[0]) {
        return `The jackpot is currently at $${result[0].Balance}.\n Hope you're the lucky one to win it!`;
      } else {
        return `Looks like the jackpot is currently at $0.\nYou can add to it by playing \`fini wager\` games`;
      }
    });
