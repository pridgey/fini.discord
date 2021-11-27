/*
-- Pridgey: 0
-- Graham: 0

if message is at least 1 min from lastMessage
-- floating value from 10 -> 1 based on current balance
else
-- floating value from 1 -> 0.10 based on number of seconds since message


once (twice?) per day everyone gets a random amount 10-100?


Some sort of pool of money that one user can randomly win each day?
-- Percentage of payments for gambling and such?

*/

import { Message } from "discord.js";
import { db } from "./../../utilities/db";
import { BankRecord } from "./../../types";
import seedrandom from "seedrandom";

export const modifyFunds = (
  UserID: string,
  ServerID: string,
  newBalance: number
) =>
  db().update<BankRecord>(
    "Bank",
    {
      Field: "User",
      Value: UserID,
    },
    {
      Field: "Balance",
      Value: newBalance,
    },
    ServerID
  );

export const checkBalance = (UserID: string, ServerID: string) =>
  db()
    .select<BankRecord>("Bank", { Field: "User", Value: UserID }, ServerID)
    .then((results) => results[0]?.Balance ?? 0);

export const generateFiniBucks = (message: Message) => {
  db()
    .select<BankRecord>(
      "Bank",
      {
        Field: "User",
        Value: message.author.id,
      },
      message.guild.id
    )
    .then((results) => {
      let userLedger: BankRecord;
      if (results[0]) {
        // Grab the results
        userLedger = results[0];
      } else {
        // There is no bank record for this user, let's make one.
        userLedger = {
          Balance: 0,
          User: message.author.id,
          Server: message.guild.id,
        };
        // insert it
        db()
          .insert<BankRecord>("Bank", userLedger)
          .then(() => {
            db()
              .select<BankRecord>(
                "Bank",
                {
                  Field: "User",
                  Value: message.author.id,
                },
                message.guild.id
              )
              .then((newRecord) => {
                userLedger = newRecord[0];
              });
          });
      }

      // Now that we have a record to use, let's calculate how much they get
      const rng = seedrandom();
      const randomAward = Math.round(rng() * 70);
      const detractor = userLedger.Balance > 10 ? 1 / userLedger.Balance : 1;
      const amountToAward = randomAward * detractor;

      db().update<BankRecord>(
        "Bank",
        { Field: "ID", Value: userLedger.ID },
        {
          Field: "Balance",
          Value: Math.round(Number(userLedger.Balance) + Number(amountToAward)),
        },
        message.guild.id
      );
    });
};
