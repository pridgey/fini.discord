import { SlashCommandBuilder } from "@discordjs/builders";
import { CommandInteraction, MessageEmbed } from "discord.js";
import { grabGif } from "../utilities";

export const data = new SlashCommandBuilder()
  .setName("rgif")
  .setDescription("React with a random gif, but R Rated")
  .addStringOption((option) =>
    option
      .setName("query")
      .setDescription("what gif should I look for?")
      .setRequired(true)
  );

export const execute = async (interaction: CommandInteraction) => {
  const query = interaction.options.getString("query").trim();
  grabGif(`${query}`, "r").then((url) => {
    if (url) {
      const embed = new MessageEmbed().setImage(url ?? "").setFooter({
        text: `R: ${query ?? "Random"}`,
      });

      interaction.reply({
        embeds: [embed],
      });
    } else {
      interaction.reply(`Couldn't find a gif for ${query}`);
    }
  });
};
