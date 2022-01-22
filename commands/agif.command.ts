import { SlashCommandBuilder } from "@discordjs/builders";
import { CommandInteraction } from "discord.js";
import { grabGif } from "./../utilities";

export const data = new SlashCommandBuilder()
  .setName("agif")
  .setDescription("React with a random gif, but with anime")
  .addStringOption((option) =>
    option.setName("query").setDescription("what gif should I look for?")
  );

export const execute = async (interaction: CommandInteraction) => {
  const query = interaction.options.getString("query");
  grabGif(`anime ${query}`).then((url) => {
    interaction.reply({
      content: `*${query}*\n${url}`,
    });
  });
};
