import type { SlashCommand } from "../types/handlers";
import { SlashCommandBuilder } from "@discordjs/builders";
import { ChatInputCommandInteraction } from "discord.js";
import { converseWithAI } from "../modules/aiChat/aiChat";
import { splitBigString } from "../utilities/splitBigString";

export const data = new SlashCommandBuilder()
  .setName("deathbattle")
  .setDescription("Runs a fictional death battle between two characters")
  .addStringOption((option) =>
    option
      .setName("character-a")
      .setDescription("The first fighter")
      .setRequired(true),
  )
  .addStringOption((option) =>
    option
      .setName("character-b")
      .setDescription("The second fighter")
      .setRequired(true),
  )
  .addStringOption((option) =>
    option
      .setName("modifiers")
      .setDescription("Conditions on the fight, e.g. both fighters are tired")
      .setMaxLength(300),
  )
  .addStringOption((option) =>
    option
      .setName("setting")
      .setDescription(
        "Where the fight happens, e.g. on a beach, in a 10x10 shed",
      )
      .setMaxLength(300),
  );

export const execute: SlashCommand["execute"] = async (
  interaction: ChatInputCommandInteraction,
  logCommand: () => void,
) => {
  const fighterA = interaction.options.getString("character-a") || "";
  const fighterB = interaction.options.getString("character-b") || "";
  const modifiers = interaction.options.getString("modifiers")?.trim() || "";
  const setting = interaction.options.getString("setting")?.trim() || "";

  // Extra conditions override the prime-strength / pocket-dimension defaults.
  const contextLines = [
    setting &&
      `Instead of the pocket dimension's empty plane, the fight takes place in this setting: ${setting}. Weigh how the setting helps or hinders each fighter.`,
    modifiers &&
      `These modifiers apply to the fight and override any default above (including prime strength): ${modifiers}. Weigh how they affect each fighter.`,
  ].filter(Boolean);
  const contextBlock = contextLines.length
    ? `\n\n  ${contextLines.join("\n  ")}`
    : "";
  const headerExtras = [
    setting && `**Setting:** ${setting}`,
    modifiers && `**Modifiers:** ${modifiers}`,
  ]
    .filter(Boolean)
    .join("\n");

  const prompt = `I've created a pocket dimension that cannot be escaped. I can put any two fictional characters into that plane and they will have the urge to fight one another to the death, even if it is against their character. The characters will always be at their prime strength and have every ability that has been given to them in their canon timelines. Your job is to weigh your own knowledge of the two characters, and using that inform me which of the two wins the death battle and why. Do not present any more information than that. You must decide a winner.${contextBlock}
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

  const response = await converseWithAI({
    userID: interaction.user.id,
    message: prompt,
    server: interaction.guild?.id ?? "unknown server id",
    options: {
      skipHistory: true,
      skipSave: true,
      // Pinned rather than following /chat-config: this prompt is tuned for
      // Claude and shouldn't change quality when someone switches chat models.
      model: "claude",
    },
  });

  let responded = false;
  // Shown by us rather than the model so the template stays fixed.
  const fullResponse = headerExtras
    ? response.replace(/^(.*\n)/, `$1${headerExtras}\n`)
    : response;
  const splitResponse = splitBigString(fullResponse);

  for (const chunk of splitResponse) {
    if (!responded) {
      await interaction.editReply(chunk);
      responded = true;
    } else {
      await interaction.followUp(chunk);
    }
  }

  logCommand();
};
