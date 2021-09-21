import { Game } from "./../GameTypes";
import { Message } from "discord.js";
import seedrandom from "seedrandom";
import { getStatistics, updateStats } from "./../../stats";

export const Horsey: Game = {
  Win: (message: Message) => {
    message.channel.send("Well done! Enjoy your winnings");
  },
  Lose: (message: Message) => {
    message.channel.send("Oh no! You can't win every race :(");
  },
  Description:
    "Place a bet on Horsey #1-5. If your horsey gets 1st, get 3x winnings. 2nd? 1.5x winnings and 3rd gets 0.5x winnings.",
  Validation: (args: string[]) => /\d/g.test(args.join(" ")),
  Run: (args: string[], message: Message) =>
    new Promise((resolve) => {
      // Grab the user guess
      const userGuess = args[0];

      // Setup Horseys
      type Horsey = {
        stretch: number[];
        id: number;
      };

      // Function to draw a horsey line
      const drawLane = (stretch: number) => {
        const maxGate = 30;

        let lane = "|";
        for (let b = 0; b < stretch; b++) {
          lane += " =";
        }
        lane += "🏇";
        for (let e = 0; e < maxGate - stretch; e++) {
          lane += " =";
        }
        lane += " |";
        return lane;
      };

      // Function to draw horseys to screen
      const drawAllLanes = (horseys: Horsey[], step: number) => {
        let track = "";
        horseys.forEach(
          (horsey: Horsey) =>
            (track += `${horsey.id} ${drawLane(horsey.stretch[step])}\n`)
        );
        return track;
      };

      // Setup randomization
      const rng = seedrandom();

      // Create horseys
      const daHorseys: Horsey[] = [];
      for (let i = 1; i <= 5; i++) {
        daHorseys.push({
          id: i,
          stretch: [30],
        });
      }

      // Pre-calculate each horsey's pace
      while (daHorseys.every((horsey: Horsey) => !horsey.stretch.includes(0))) {
        // While there are no horseys with 0 in their pace, continue stepping down until we're there
        daHorseys.forEach((horsey: Horsey) => {
          const laspStep = horsey.stretch[horsey.stretch.length - 1];
          let newStep = laspStep - Math.round(rng() * 3);
          if (newStep <= 0) newStep = 0;
          horsey.stretch.push(newStep);
        });
      }

      // Get the winning horseys
      const podium = daHorseys.map((horsey: Horsey) => ({
        id: horsey.id,
        final: horsey.stretch[horsey.stretch.length - 1],
      }));

      // Get index of guess within podium array
      const guessIndex: number = podium.findIndex(
        (horsey) => horsey.id.toString() === userGuess
      );

      // Rank the horseys
      // Grab the final positions of the horseys
      const horseyValue = podium.map((horsey) => horsey.final);
      // Sort the unique values of those positions
      const sorted = Array.from(new Set(horseyValue)).sort((a, b) => a - b);
      // Create a map of the sorted values and give the Map value the index of the sort
      const rank = new Map(sorted.map((x, i) => [x, i]));
      // Create an array of rankings by mapping out the Map object via the horsey position value
      const rankings = horseyValue.map((x) => rank.get(x));

      // Update stats
      getStatistics("horsey", message.guild.id).then((horseyStats) => {
        const horseyWins = {
          1: Number(
            horseyStats?.find((stat) => stat.Field === "1")?.Value ?? "0"
          ),
          2: Number(
            horseyStats?.find((stat) => stat.Field === "2")?.Value ?? "0"
          ),
          3: Number(
            horseyStats?.find((stat) => stat.Field === "3")?.Value ?? "0"
          ),
          4: Number(
            horseyStats?.find((stat) => stat.Field === "4")?.Value ?? "0"
          ),
          5: Number(
            horseyStats?.find((stat) => stat.Field === "5")?.Value ?? "0"
          ),
        };

        rankings.forEach((horseRank, index) => {
          if (horseRank === 0) {
            horseyWins[index + 1] += 1;
          }
        });

        Object.keys(horseyWins).forEach((horsey) => {
          updateStats("horsey", message.guild.id, horsey, horseyWins[horsey]);
        });
      });

      // What to award each rank
      const WinningMultiplier = {
        0: 3,
        1: 1.5,
        2: 0.5,
        3: 0,
        4: 0,
      };

      // Ranking suffix
      const RankSuffix = {
        0: "st",
        1: "nd",
        2: "rd",
        3: "th",
        4: "th",
      };

      // We know every step the horsey will make, so we can draw them
      message.channel.send("On your marks!").then((message) => {
        setTimeout(() => {
          message.edit("On your marks... Get set!").then((message) => {
            setTimeout(() => {
              let step = 1;
              const end = daHorseys[0].stretch.length - 1;
              message.edit(drawAllLanes(daHorseys, 0)).then((message) => {
                const interv = setInterval(() => {
                  if (step > end) {
                    // End the interval, lest we repeat forever
                    clearInterval(interv);

                    // Get the winning multipler amount
                    const multiplier = WinningMultiplier[rankings[guessIndex]];

                    message.channel.send(
                      `Your horsey came in ${rankings[guessIndex] + 1}${
                        RankSuffix[rankings[guessIndex]]
                      } place! ${
                        multiplier > 0 ? `You win ${multiplier}x!` : ""
                      }`
                    );

                    resolve({
                      multiplier,
                      win: multiplier > 0,
                    });
                  } else {
                    message.edit(drawAllLanes(daHorseys, step));
                    step++;
                  }
                }, 1500);
              });
            }, 1000);
          });
        }, 1000);
      });
    }),
};
