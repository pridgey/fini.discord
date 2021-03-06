import { Message } from "discord.js";
import seedrandom from "seedrandom";
import { stringReturn, db, sleep } from "./../../../utilities";
import { BankRecord } from "./../../../types";
import { EvenOdd, Horsey } from "./../../games";
import { Game } from "./../../games/GameTypes";
import { checkBalance, modifyFunds } from "./../../finibucks";

// const commandStructure = `\`fini wager {amount} {game} {args}\``;

const AvailableGames: { [key: string]: Game } = {
  evenodd: EvenOdd,
  horsey: Horsey,
};

export const runWager = (message: Message) => (args: string[]) => {
  const [wagerAmount, wagerGame, ...gameArgs] = args;

  const wagerNum = Number(wagerAmount);
  const game = AvailableGames[wagerGame];

  if (wagerNum > 0) {
    if (game) {
      // Check game validation
      if (game.Validation(gameArgs)) {
        // Check user funds to ensure they can play
        return checkBalance(message.author.id, message.guild.id).then(
          (balance: number) => {
            let currentBalance = balance;
            if (currentBalance >= wagerNum) {
              // Deduct the wager from their funds so they can't cheat the system
              return modifyFunds(
                message.author.id,
                message.guild.id,
                balance - wagerNum
              ).then(() => {
                currentBalance -= wagerNum;
                // Play the game
                return game
                  .Run(gameArgs, message)
                  .then(({ multiplier, win }) => {
                    if (win) {
                      game.Win(message);
                      // check for jackpot
                    } else {
                      game.Lose(message);
                      checkBalance("Fini", message.guild.id).then(
                        (finiBalance) =>
                          modifyFunds(
                            "Fini",
                            message.guild.id,
                            finiBalance + wagerNum
                          )
                      );
                    }

                    return modifyFunds(
                      message.author.id,
                      message.guild.id,
                      currentBalance + wagerNum * multiplier
                    ).then(() =>
                      checkBalance(message.author.id, message.guild.id).then(
                        (resultBalance) => `Your new balance: $${resultBalance}`
                      )
                    );
                  });
              });
            } else {
              // They don't have the money
              return stringReturn(
                `You lack the proper funds with which to play this game.\nBy that I mean you wagered: ${wagerAmount}, and you have ${balance} in your account`
              );
            }
          }
        );
      } else {
        // Invalid game commands
        return stringReturn(
          `That doesn't look like the correct arguments for this game.`
        );
      }
    } else {
      // They put in something we don't have
      return stringReturn(
        `Unable to find a game with the name ${wagerGame}. Available games are: \n-${Object.keys(
          AvailableGames
        ).join("\n-")}`
      );
    }
  } else {
    // Wager less than 0
    return stringReturn(
      `You have to wager a positive amount. Are you trying to break me? :(`
    );
  }
};

// // fini wager {number} {game} {...options}
// export const runWager = (message: Message) => (args: string[]) => {
//   // Check args for issues and get any errors back
//   const validationError = validateArguments(args);

//   if (!validationError.length) {
//     const [amount, game, ...gameargs] = args;
//     const wagerAmount = Number(amount);

//     if (game in games) {
//       // Do they have the funds?
//       return getBalance(message.author.id, message.guild.id).then((ledger) => {
//         if ((ledger?.Balance ?? 0) >= wagerAmount) {
//           if (wagerAmount > 0) {
//             const { valid, play } = games[game](message, gameargs);
//             if (!valid.length) {
//               // All is good to go

//               // Take out wager first as some games take some time to finish and we don't want them money they might lose
//               updateBankAndReturnBalance(
//                 wagerAmount * -1,
//                 message.author.id,
//                 message.guild.id
//               );

//               // Play the game!
//               return play().then((win) => {
//                 // Check for jackpot
//                 return checkJackpot(message.guild.id).then((jackpot) => {
//                   const prize =
//                     wagerAmount * (win ? 2 : 0) + (win ? jackpot : 0);

//                   if (!win) {
//                     // Update fini balance if they lose
//                     updateBankAndReturnBalance(
//                       wagerAmount,
//                       "Fini",
//                       message.guild.id
//                     );
//                   }
//                   return updateBankAndReturnBalance(
//                     prize,
//                     message.author.id,
//                     message.guild.id
//                   ).then((ledger) => {
//                     if (jackpot && win) {
//                       const maxLineLength =
//                         40 +
//                         prize.toString().length +
//                         (ledger?.Balance ?? 0).toString().length;
//                       return `${"????".repeat(maxLineLength / 4)}\n\n${" ".repeat(
//                         (maxLineLength - 8) / 2
//                       )}**CONGRATS**${" ".repeat(
//                         (maxLineLength - 8) / 2
//                       )}\n\n${" ".repeat(
//                         (maxLineLength -
//                           (26 + message.author.username.length)) /
//                           2
//                       )}${
//                         message.author.username
//                       } has won the **fini jackpot!**${" ".repeat(
//                         (maxLineLength -
//                           (26 + message.author.username.length)) /
//                           2
//                       )}\n\nYou have won $${prize} and your new balance is $${
//                         ledger?.Balance ?? 0
//                       }\n\n${"????".repeat(maxLineLength / 4)}`;
//                     } else {
//                       return `Your new balance comes out to $${
//                         ledger?.Balance ?? 0
//                       }`;
//                     }
//                   });
//                 });
//               });
//             } else {
//               // Issue with their args
//               return stringReturn(valid);
//             }
//           } else {
//             return `Wagers must be a positive number.`;
//           }
//         } else {
//           return `You don't have enough funds to make this wager.\nYour balance is $${
//             ledger?.Balance ?? 0
//           }`;
//         }
//       });
//     } else {
//       // Game isn't in our list
//       return stringReturn(
//         `Hrm, I don't recognize that game.\nGames Available:\n-${Object.keys(
//           games
//         ).join(`\n-`)}`
//       );
//     }
//   } else {
//     // Game didn't pass argument validation
//     if (args.includes("-h")) {
//       return stringReturn(
//         `\`fini wager\` allows user to play simple games and bet on them\nProper formatting is \`${commandStructure}\`\nGames Available:\n-${Object.keys(
//           games
//         ).join(`\n-`)}`
//       );
//     } else {
//       // This wasn't a -h arg
//       return stringReturn(validationError);
//     }
//   }
// };

// // Validate the list of args given
// const validateArguments = (args: string[]): string => {
//   // fini wager requires at least three arguments
//   if (args.length < 3) {
//     return `Seems to be insufficient arguments.\nProper formatting is ${commandStructure}\nRun \`fini wager-h\` for more information`;
//   }

//   // Grab the amount wagered and see if it's an actual number
//   const amountWagered = Number(args[0]);
//   if (isNaN(amountWagered)) {
//     return `That wager seems wrong.\nWager amount should be a positive number.`;
//   }

//   // Everything is good, return no error
//   return "";
// };

// The horsey game
// const runHorsey = (message: Message, args: string[]) => {
//   // #region arguments
//   // First check for any errors in the arguments
//   let errorMessage = "";

//   if (args.length !== 1)
//     errorMessage =
//       "Seems to be insufficient arguments.\nProper formatting is `...horsey {1-5}`";
//   if (!["1", "2", "3", "4", "5"].includes(args[0]))
//     errorMessage = "You need to pick your Horsey. You can pick a number 1 - 5";
//   if (args.includes("-h"))
//     errorMessage =
//       "A game where you place a bet on a horsey race\nProper formatting is `horsey {1-5}`";
//   // #endregion arguments

//   // #region setup
//   // Horsey Type for the horsey array
//   type Horsey = {
//     stretch: number[];
//     id: number;
//   };

//   // Helper function to draw a single lane
//   const drawLane = (stretch: number) => {
//     const maxGate = 20;

//     let lane = "|";
//     for (let b = 0; b < stretch; b++) {
//       lane += " =";
//     }
//     lane += "????";
//     for (let e = 0; e < maxGate - stretch; e++) {
//       lane += " =";
//     }
//     lane += " |";
//     return lane;
//   };

//   // Helper function to draw the horsey lanes on screen
//   const drawAllLanes = (horseys: Horsey[], step: number) => {
//     let track = "";
//     horseys.forEach(
//       (horsey: Horsey) =>
//         (track += `${horsey.id} ${drawLane(horsey.stretch[step])}\n`)
//     );
//     return track;
//   };

//   // #endregion setup

//   return {
//     valid: errorMessage,
//     play: () =>
//       new Promise<boolean>((resolve) => {
//         // We're playing!

//         // Wager variables
//         const horsey = args[0];
//         const rng = seedrandom();

//         // Create or array of horseys
//         const daHorseys: Horsey[] = [];
//         for (let i = 1; i <= 5; i++) {
//           daHorseys.push({
//             id: i,
//             stretch: [20],
//           });
//         }

//         // Determine the pace each horse will run
//         while (daHorseys.every((horsey) => !horsey.stretch.includes(0))) {
//           // While there are no horseys with a 0 in their pace
//           // Continue stepping through their pace until we get there
//           daHorseys.forEach((horsey) => {
//             const lastStep = horsey.stretch[horsey.stretch.length - 1];
//             let newStep = lastStep - Math.round(rng() * 3);
//             if (newStep <= 0) newStep = 0;
//             horsey.stretch.push(newStep);
//           });
//         }

//         // Now we go step by step and draw the horseys
//         message.channel.send("On your marks!").then((message) => {
//           setTimeout(() => {
//             message.edit("On your marks... Get set!").then((message) => {
//               setTimeout(() => {
//                 let step = 1;
//                 const end = daHorseys[0].stretch.length - 1;
//                 message.edit(drawAllLanes(daHorseys, 0)).then((message) => {
//                   const interv = setInterval(() => {
//                     if (step > end) {
//                       // End the interval, lest we repeat forever
//                       clearInterval(interv);
//                       // Get the winning horseys
//                       const winningHorseys = daHorseys
//                         .filter((horsey) => horsey.stretch.includes(0))
//                         .map((horsey) => horsey.id.toString());
//                       // Did the user guess a winning horse?
//                       const userWin = winningHorseys.includes(horsey);
//                       // Send a win message
//                       message.channel.send(
//                         `Horsey${
//                           winningHorseys.length > 1 ? "s" : ""
//                         } ${winningHorseys.join(", ")} win!`
//                       );
//                       // Resolve the game
//                       resolve(userWin);
//                     } else {
//                       message.edit(drawAllLanes(daHorseys, step));
//                       step++;
//                     }
//                   }, 1500);
//                 });
//               }, 1000);
//             });
//           }, 1000);
//         });
//       }),
//   };
// };

// // Possibly pay out a jackpot
// const checkJackpot = (serverID: string) => {
//   return getBalance("Fini", serverID).then((record) => {
//     const currentJackpot = record.Balance;

//     if (currentJackpot) {
//       // We have a jackpot
//       const rng = seedrandom();
//       const ranNum = Math.round(rng() * 10000);
//       // Should be 0.05%
//       if (ranNum <= 5) {
//         // We have a winner!
//         updateBankAndReturnBalance(currentJackpot * -1, "Fini", serverID);
//         return currentJackpot;
//       } else {
//         return 0;
//       }
//     } else {
//       // No jackpot
//       return 0;
//     }
//   });
// };
