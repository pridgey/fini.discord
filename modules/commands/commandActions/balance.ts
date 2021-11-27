import { db } from "./../../../utilities/db";
import { BankRecord } from "./../../../types";
import { Message } from "discord.js";

export const runBalance = (message: Message) => () =>
  db()
    .select<BankRecord>(
      "Bank",
      { Field: "User", Value: message.author.id },
      message.guild.id
    )
    .then((result) => {
      if (result[0]) {
        return `You currently have $${result[0].Balance} worth of FiniBucks in your account`;
      } else {
        return `You current have $0 worth of FiniBucks in your account`;
      }
    });
