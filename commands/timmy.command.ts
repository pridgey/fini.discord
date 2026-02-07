import { SlashCommandBuilder } from "@discordjs/builders";
import { ChatInputCommandInteraction } from "discord.js";
import { chatWithUser_OpenAI } from "../modules/openai";
import { converseWithAI } from "../modules/aiChat/aiChat";

export const data = new SlashCommandBuilder()
  .setName("timmypoem")
  .setDescription(
    "Creates a Little Timmy poem in the style of u/poem_for_your_sprog",
  )
  .addStringOption((option) =>
    option
      .setName("prompt")
      .setDescription("What the poem is about")
      .setRequired(true),
  );

export const execute = async (
  interaction: ChatInputCommandInteraction,
  logCommand: () => void,
) => {
  const poemPrompt = interaction.options.get("prompt")?.value?.toString() || "";

  const prompt = `Please write an original poem, as written by u/poem_for_your_sprog, that tells a narrative about Little Timmy and is about ${poemPrompt}. The poem must end with the rhyme "Timmy fucking died". The poem should narratively explain the final line. Reply with only the poem and no other disclaimers or tangential information.`;

  await interaction.deferReply();

  const response = await converseWithAI({
    userID: interaction.user.id,
    message: prompt,
    server: interaction.guild?.id ?? "unknown server id",
  });

  await interaction.editReply(response);
  logCommand();
};
