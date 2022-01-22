import { SlashCommandBuilder } from "@discordjs/builders";
import { CommandInteraction, MessageEmbed } from "discord.js";
import { grabGif } from "./../utilities";
import { HammerspaceItem } from "./../types";
import seedrandom from "seedrandom";

export const data = new SlashCommandBuilder()
  .setName("evenodd")
  .setDescription(
    "A simple game, you wager Finicoin and guess if the result is even, or odd"
  )
  .addNumberOption((opt) =>
    opt
      .setName("bet")
      .setDescription("How much are you betting?")
      .setRequired(true)
  )
  .addStringOption((opt) =>
    opt
      .setName("option")
      .setDescription("Is it Even or Odd?")
      .setRequired(true)
      .addChoice("Even", "Even")
      .addChoice("Odd", "Odd")
  );

export const execute = async (interaction: CommandInteraction) => {
  const bet = interaction.options.getNumber("bet");
  const option = interaction.options.getString("option");

  // Result Dictionary for Gif
  const resultDictionary = [
    "zero",
    "one",
    "two",
    "three",
    "four",
    "five",
    "six",
    "seven",
    "eight",
    "nine",
  ];

  // Randomly generate winning option
  const rng = seedrandom(interaction.token);
  const randomNumber = Math.round(rng() * 9);
  const outcome = randomNumber % 2 === 0 ? "Even" : "Odd";

  // Did they win?
  const win = outcome === option;

  grabGif(resultDictionary[randomNumber]).then((url) => {
    console.log("Url:", url);
    const embed = new MessageEmbed()
      .setTitle("Even / Odd")
      .setColor("#ffea00")
      .addField("Result", `${randomNumber} - ${outcome}`)
      .addField("Your Guess", option)
      .setImage(url)
      .setFooter({
        text: win ? "Winner Winner!" : "Oh man, that's shitty",
      });

    interaction.reply({
      embeds: [embed],
    });
  });
};
