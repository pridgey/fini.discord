import { Message } from "discord.js";
import seedrandom from "seedrandom";
import { stringReturn, db } from "./../../../utilities";
import { BankRecord } from "./../../../types";

const commandStructure = `\`fini wager {amount} {game} {args}\``;

// fini wager {number} {game} {...options}
export const runWager = (message: Message) => (args: string[]) => {
  // Check args for issues and get any errors back
  const validationError = validateArguments(args);

  if (!validationError.length) {
    const [amount, game, ...gameargs] = args;
    const wagerAmount = Number(amount);

    if (game in games) {
      // Do they have the funds?
      return getBalance(message.author.id, message.guild.id).then((ledger) => {
        if (ledger.Balance >= wagerAmount) {
          if (wagerAmount > 0) {
            const { valid, play } = games[game](message, gameargs);
            if (!valid.length) {
              return play().then((win) => {
                const prize = wagerAmount * (win ? 1 : -1);

                if (!win) {
                  // Update fini balance if they lose
                  updateBankAndReturnBalance(
                    wagerAmount,
                    "Fini",
                    message.guild.id
                  );
                }

                return updateBankAndReturnBalance(
                  prize,
                  message.author.id,
                  message.guild.id
                ).then((ledger) => {
                  return `Your new balance comes out to $${ledger.Balance}`;
                });
              });
            } else {
              // Issue with their args
              return stringReturn(valid);
            }
          } else {
            return `Wagers must be a positive number.`;
          }
        } else {
          return `You don't have enough funds to make this wager.\nYour balance is $${ledger.Balance}`;
        }
      });
    } else {
      // Game isn't in our list
      return stringReturn(
        `Hrm, I don't recognize that game.\nGames Available:\n-${Object.keys(
          games
        ).join(`\n-`)}`
      );
    }
  } else {
    // Game didn't pass argument validation
    if (args.includes("-h")) {
      return stringReturn(
        `\`fini wager\` allows user to play simple games and bet on them\nProper formatting is \`${commandStructure}\`\nGames Available:\n-${Object.keys(
          games
        ).join(`\n-`)}`
      );
    } else {
      // This wasn't a -h arg
      return stringReturn(validationError);
    }
  }
};

// Validate the list of args given
const validateArguments = (args: string[]): string => {
  // fini wager requires at least three arguments
  if (args.length < 3) {
    return `Seems to be insufficient arguments.\nProper formatting is ${commandStructure}\nRun \`fini wager-h\` for more information`;
  }

  // Grab the amount wagered and see if it's an actual number
  const amountWagered = Number(args[0]);
  if (isNaN(amountWagered)) {
    return `That wager seems wrong.\nWager amount should be a positive number.`;
  }

  // Everything is good, return no error
  return "";
};

// The EvenOdd game
const runEvenOdd = (message: Message, args: string[]) => {
  let errorMessage = "";

  if (args.length !== 1)
    errorMessage =
      "Seems to be insufficient arguments.\nProper formatting is `...evenodd {even|odd}`";
  if (!["even", "odd"].includes(args[0]))
    errorMessage = "Proper guesses must be `even` or `odd`";
  if (args.includes("-h"))
    errorMessage =
      "A game where you guess if the random number will be even, or odd\nProper formatting is `evenodd {even|odd}`";

  return {
    valid: errorMessage,
    play: () =>
      new Promise<boolean>((resolve) => {
        const guess = args[0];

        const rng = seedrandom();
        const outcome = Math.round(rng()) % 2 === 0 ? "even" : "odd";

        const win = outcome === guess;

        const resultMessage = win
          ? "Great guess! You win!"
          : "Unfortunate. Try again?";

        message.channel.send("The result is").then((message) => {
          setTimeout(() => {
            message.edit("The result is.");
          }, 1000);
          setTimeout(() => {
            message.edit("The result is..");
          }, 1500);
          setTimeout(() => {
            message.edit("The result is...");
          }, 2000);
          setTimeout(() => {
            message.edit(`The result is... ${outcome}`);
          }, 2500);
          setTimeout(() => {
            message.edit(`The result is... ${outcome}\n${resultMessage}`);
            resolve(win);
          }, 2750);
        });
      }),
  };
};

// The horsey game
const runHorsey = (message: Message, args: string[]) => {
  let errorMessage = "";

  if (args.length !== 1)
    errorMessage =
      "Seems to be insufficient arguments.\nProper formatting is `...horsey {1-5}`";
  if (!["1", "2", "3", "4", "5"].includes(args[0]))
    errorMessage = "You need to pick your Horsey. You can pick a number 1 - 5";
  if (args.includes("-h"))
    errorMessage =
      "A game where you place a bet on a horsey race\nProper formatting is `horsey {1-5}`";

  const drawLane = (stretch: number) => {
    let lane = "|";
    for (let b = 0; b < stretch; b++) {
      lane += " =";
    }
    lane += "🏇";
    for (let e = 0; e < 9 - stretch; e++) {
      lane += " =";
    }
    lane += " |";
    return lane;
  };

  return {
    valid: errorMessage,
    play: () =>
      new Promise<boolean>((resolve) => {
        const horsey = args[0];

        const rng = seedrandom();
        const outcome = Math.ceil(rng() * 5);

        const win = horsey === outcome.toString();

        message.channel.send(drawLane(9)).then((message) => {
          let stretch = 9;
          const interv = setInterval(() => {
            if (stretch === 0) {
              clearInterval(interv);
              setTimeout(() => {
                message.edit(
                  `This is still being implemented, but will take your money.\nYour guess: ${horsey}.\nWinning Horsey: ${outcome}`
                );
              }, 1500);
              resolve(win);
            }
            message.edit(drawLane(stretch));
            stretch--;
          }, 1000);
        });
      }),
  };
};

const getBalance = (user: string, serverID: string) =>
  db()
    .select<BankRecord>("Bank", { Field: "User", Value: user }, serverID)
    .then((record) => {
      return record[0];
    });

const updateBankAndReturnBalance = (
  wager: number,
  user: string,
  serverID: string
) =>
  getBalance(user, serverID).then((ledger) =>
    db()
      .update<BankRecord>(
        "Bank",
        { Field: "ID", Value: ledger?.ID },
        { Field: "Balance", Value: (ledger?.Balance ?? 0) + wager }
      )
      .then(() => getBalance(user, serverID))
  );

// Games users can play
const games: {
  [key: string]: (
    message: Message,
    args: string[]
  ) => {
    valid: string;
    play: () => Promise<boolean>;
  };
} = {
  evenodd: runEvenOdd,
  horsey: runHorsey,
};
