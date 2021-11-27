import { Game } from "./../GameTypes";
import { Message } from "discord.js";
import seedrandom from "seedrandom";
import { getStatistics, updateStats } from "./../../stats";

export const EvenOdd: Game = {
  Win: (message: Message) => {
    message.channel.send(":tada: You got it! Congrats");
  },
  Lose: (message: Message) => {
    message.channel.send("Big sad. Maybe try again?");
  },
  Description:
    "A game where you guess if the random number will be even, or odd",
  Validation: (args: string[]) => {
    if (/(even|odd)/g.test(args.join(" "))) {
      return true;
    }
    return false;
  },
  Run: (options: string[], message: Message) =>
    new Promise((resolve) => {
      // Grab the user guess
      const userGuess = options[0];

      // Randomly generate winning option
      const rng = seedrandom();
      const outcome = Math.round(rng()) % 2 === 0 ? "even" : "odd";

      // Update statistics
      getStatistics("evenodd", message.guild.id).then((evenOddStats) => {
        let numOfEvens = Number(
          evenOddStats?.find((stat) => stat.Field === "even")?.Value ?? "0"
        );
        let numOfOdds = Number(
          evenOddStats?.find((stat) => stat.Field === "odd")?.Value ?? "0"
        );

        const updatedNum = outcome === "even" ? numOfEvens + 1 : numOfOdds + 1;

        updateStats(
          "evenodd",
          message.guild.id,
          outcome,
          updatedNum.toString()
        );
      });

      // Did they win?
      const win = outcome === userGuess;

      // Send the suspenseful messaging...
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
          resolve({
            multiplier: win ? 2 : 0,
            win,
          });
        }, 2500);
      });
    }),
};
