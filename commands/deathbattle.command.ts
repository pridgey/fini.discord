import { SlashCommandBuilder } from "@discordjs/builders";
import { CommandInteraction } from "discord.js";
import { chatWithUser_OpenAI } from "./../modules/openai/converse";

export const data = new SlashCommandBuilder()
  .setName("deathbattle")
  .setDescription("Runs a fictional death battle between two characters")
  .addStringOption((option) =>
    option
      .setName("character-a")
      .setDescription("The first fighter")
      .setRequired(true)
  )
  .addStringOption((option) =>
    option
      .setName("character-b")
      .setDescription("The second fighter")
      .setRequired(true)
  );

export const execute = async (
  interaction: CommandInteraction,
  logCommand: () => void
) => {
  const fighterA =
    interaction.options.get("character-a")?.value?.toString() || "";
  const fighterB =
    interaction.options.get("character-b")?.value?.toString() || "";

  const prompt = `hey fini I've created a pocket dimension that cannot be escaped. I can put any two fictional characters into that plane and they will have the urge to fight one another to the death, even if it is against their character. The characters will always be at their prime strength and have every ability that has been given to them in their canon timelines. Your job is to weigh your own knowledge of the two characters, and using that inform me which of the two wins the death battle and why. Do not present any more information than that. You must decide a winner.
  Your response should match this template:

  '**Death battle:** {fighterA} vs {fighterB}
  **Winner of this battle:** {choosenWinner}

  **{fighterA}'s considerations:**
  {explanation of fighterA's strengths and skills. 1-3 sentences}

  **{fighterB}'s consideration:**
  {explanation of fighterB's strengths and skills. 1-3 sentences}

  **The deciding factor:**
  {explanation of why you chose the battle's winner. 2-4 setences}'

  Do not deviate from the template, only fill in the variables denoted by the { } characters.

  This death battle is ${fighterA} vs ${fighterB}`;

  await interaction.deferReply();

  const response = await chatWithUser_OpenAI(interaction.user.username, prompt);

  await interaction.editReply(response);
  logCommand();
};
