// import { SlashCommandBuilder } from "@discordjs/builders";
// import { CommandInteraction, MessageEmbed } from "discord.js";
// import { runGame } from "../../modules";
// import { grabGif, commafyNumber } from "../../utilities";
// import seedrandom from "seedrandom";

// export const data = new SlashCommandBuilder()
//   .setName("evenodd")
//   .setDescription(
//     "A simple game, you wager Finicoin and guess if the result is even, or odd"
//   )
//   .addNumberOption((opt) =>
//     opt
//       .setName("bet")
//       .setDescription("How much are you betting?")
//       .setRequired(true)
//       .setMinValue(1)
//   )
//   .addStringOption((opt) =>
//     opt
//       .setName("option")
//       .setDescription("Is it Even or Odd?")
//       .setRequired(true)
//       .addChoice("Even", "Even")
//       .addChoice("Odd", "Odd")
//   );

// export const execute = async (interaction: CommandInteraction) => {
//   const bet = Math.abs(interaction?.options?.getNumber("bet") || 0);
//   const option = interaction.options.getString("option");

//   runGame(interaction.user.id, interaction?.guildId || "", bet).then((game) => {
//     const { userHasFunds, userBalance, rewardWager } = game;

//     if (!userHasFunds) {
//       interaction.reply(
//         `You do not have enough Finicoin to complete this transaction\n**Your Balance:** ${commafyNumber(
//           userBalance
//         )}\n**Your Wager:** ${commafyNumber(bet)}`
//       );
//     } else {
//       // Randomly generate winning option
//       const rng = seedrandom(interaction.token);
//       const randomNumber = Math.round(rng() * 9);
//       const outcome = randomNumber % 2 === 0 ? "Even" : "Odd";

//       // Did they win?
//       const win = outcome === option;
//       rewardWager(win, win ? 2 : 1).then(({ balance, betAmount }) => {
//         grabGif(win ? "winner" : "loser").then((url) => {
//           const embed = new MessageEmbed()
//             .setTitle("Even / Odd")
//             .setColor("#ffea00")
//             .addField("Your Bet", commafyNumber(betAmount), true)
//             .addField(
//               "Your Winnings",
//               commafyNumber(win ? betAmount * 2 : 0),
//               true
//             )
//             .addField("Your Balance", commafyNumber(balance), true)
//             .addField("Result", outcome, true)
//             .addField("Your Guess", option || "", true)
//             .setImage(url)
//             .setFooter({
//               text: win
//                 ? "Winner Winner! I'm so proud of you"
//                 : "Looks like you lost, better luck next time.",
//             });

//           interaction.reply({
//             embeds: [embed],
//           });
//         });
//       });
//     }
//   });
// };
