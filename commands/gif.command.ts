import { SlashCommandBuilder } from "@discordjs/builders";
import { CommandInteraction, MessageEmbed } from "discord.js";
import { grabGif } from "./../utilities";

export const data = new SlashCommandBuilder()
  .setName("gif")
  .setDescription("React with a random gif")
  .addStringOption((option) =>
    option.setName("query").setDescription("what gif should I look for?")
  );

export const execute = async (interaction: CommandInteraction) => {
  const query = interaction.options.getString("query");

  grabGif(query).then((url) => {
    if (url) {
      const embed = new MessageEmbed().setImage(url).setFooter({
        text: query,
      });

      interaction.reply({
        embeds: [embed],
      });
    } else {
      interaction.reply(`I couldn't find a gif for ${query}`);
    }
  });
};
