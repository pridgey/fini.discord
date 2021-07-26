import { db } from "./../../../utilities/db";
import { BankRecord } from "./../../../types";
import { Message } from "discord.js";
import seedrandom from "seedrandom";

export const runEvenOdd = (message: Message) => (args: string[]) => {
  if (
    !args.join(" ").length ||
    Number(args[0]) === NaN ||
    !["even", "odd"].includes(args[1])
  ) {
    // No args found
    return new Promise<string>((resolve) =>
      resolve(
        `That doesn't look right\nA proper bet looks like this: \`fini evenodd {amount} {even|odd}\``
      )
    );
  } else {
    const amountToBet = Number(args[0]);
    const wager = args[1];

    if (amountToBet > 0) {
      return db()
        .select<BankRecord>(
          "Bank",
          { Field: "User", Value: message.author.username },
          message.guild.id
        )
        .then((result) => {
          if (result[0]) {
            // Grab our record
            const ledger: BankRecord = result[0];
            // Can they cover the bet?
            if (ledger.Balance < amountToBet)
              return `You have $${ledger.Balance} Finibucks\nNot enough to place your wager of $${amountToBet} Finibucks`;
            // Did they win?
            const rng = seedrandom();
            const outcome = Math.round(rng()) % 2 === 0 ? "even" : "odd";
            return db()
              .update(
                "Bank",
                { Field: "ID", Value: ledger.ID },
                {
                  Field: "Balance",
                  Value:
                    ledger.Balance +
                    (outcome === wager ? amountToBet : amountToBet * -1),
                }
              )
              .then(
                () =>
                  `The result is...**${outcome}**\n${
                    outcome === wager
                      ? `Holy shit! You won!\nI'll add ${amountToBet} Finibucks to your account!`
                      : `Oh no. That's unfortunate =(\nI'm subtracting ${amountToBet} Finibucks from your account`
                  }`
              );
          } else {
            return new Promise<string>((resolve) =>
              resolve(`I can't seem to find a balance for you :(`)
            );
          }
        });
    } else {
      return new Promise<string>((resolve) =>
        resolve(`You have to wager a positive number in order to play`)
      );
    }
  }
};
