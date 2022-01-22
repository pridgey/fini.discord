import { SlashCommandBuilder } from "@discordjs/builders";
import { CommandInteraction } from "discord.js";
import { grabGif } from "./../utilities";

export const data = new SlashCommandBuilder()
  .setName("gif")
  .setDescription("React with a random gif")
  .addStringOption((option) =>
    option.setName("query").setDescription("what gif should I look for?")
  );

export const execute = async (interaction: CommandInteraction) => {
  grabGif(interaction.options.getString("query")).then((url) => {
    interaction.reply({
      content: url,
    });
  });
};
