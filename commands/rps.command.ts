import { SlashCommandBuilder } from "@discordjs/builders";
import { CommandInteraction, MessageEmbed } from "discord.js";
import { runGame } from "./../modules";
import { grabGif, commafyNumber } from "./../utilities";
import seedrandom from "seedrandom";

export const data = new SlashCommandBuilder()
  .setName("rps")
  .setDescription("Place some Rock Paper Scissors")
  .addNumberOption((opt) =>
    opt
      .setName("bet")
      .setDescription("How much are you betting?")
      .setRequired(true)
      .setMinValue(1)
  )
  .addStringOption((opt) =>
    opt
      .setName("option")
      .setDescription("Rock? Paper? Or Scissors?")
      .setRequired(true)
      .addChoice("Rock", "Rock")
      .addChoice("Paper", "Paper")
      .addChoice("Scissors", "Scissors")
  );

export const execute = async (interaction: CommandInteraction) => {
  const bet = Math.abs(interaction.options.getNumber("bet"));
  const option = interaction.options.getString("option");

  runGame(interaction.user.id, interaction.guildId, bet).then((game) => {
    const { userHasFunds, userBalance, rewardWager } = game;

    if (!userHasFunds) {
      interaction.reply(
        `You do not have enough Finicoin to complete this transaction\n**Your Balance:** ${commafyNumber(
          userBalance
        )}\n**Your Wager:** ${commafyNumber(bet)}`
      );
    } else {
      // Randomly generate winning option
      const rng = seedrandom(interaction.token);
      const randomNumber = Math.round(rng() * 2);
      const outcome = ["Rock", "Paper", "Scissors"][randomNumber];

      const winningDictionary = {
        Rock: "Scissors",
        Paper: "Rock",
        Scissors: "Paper",
      };

      // Did they win?
      const win = [option, winningDictionary[option]].includes(outcome);
      const prizeMultiplier = win && outcome !== option ? 2 : 1;

      rewardWager(win, prizeMultiplier).then(({ balance, betAmount }) => {
        grabGif(outcome).then((url) => {
          const embed = new MessageEmbed()
            .setTitle("Rock, Paper, Scissors")
            .setColor("#ffea00")
            .addField("Your Bet", commafyNumber(betAmount), true)
            .addField(
              "Your Winnings",
              commafyNumber(
                betAmount * (win ? (outcome !== option ? 2 : 1) : 0)
              ),
              true
            )
            .addField("Your Balance", commafyNumber(balance), true)
            .addField("I chose", outcome, true)
            .addField("You chose", option, true)
            .setImage(url)
            .setFooter({
              text: win
                ? "Winner Winner! I'm so proud of you"
                : "Looks like you lost, better luck next time.",
            });

          interaction.reply({
            embeds: [embed],
          });
        });
      });
    }
  });
};
