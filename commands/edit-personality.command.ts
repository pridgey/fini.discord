import { SlashCommandBuilder } from "@discordjs/builders";
import { ChatInputCommandInteraction } from "discord.js";
import { getPersonalityByName } from "../modules/personalities/getPersonality";
import { updatePersonality } from "../modules/personalities/updatePersonlity";

export const data = new SlashCommandBuilder()
  .setName("edit-personality")
  .setDescription("Edit any of your created Fini personalities.")
  .addStringOption((option) =>
    option
      .setName("name")
      .setDescription("The name of the personality to modify.")
      .setRequired(true),
  )
  .addStringOption((option) =>
    option
      .setName("prompt")
      .setDescription("The new personality prompt.")
      .setRequired(true),
  );

export const execute = async (
  interaction: ChatInputCommandInteraction,
  logCommand: () => void,
) => {
  const personalityName =
    interaction.options.get("name")?.value?.toString() || "";
  const personalityPrompt =
    interaction.options.get("prompt")?.value?.toString() || "";

  try {
    // Check to see if there's already a personality with this name
    const existingPersonality = await getPersonalityByName({
      userId: interaction.user.id,
      personalityName,
      serverId: interaction.guild?.id,
    });

    if (existingPersonality.length > 0) {
      // It's there, update it
      const updatedPersonality = await updatePersonality({
        personalityId: existingPersonality[0]?.id || "",
        personalityPrompt,
      });

      await interaction.reply(
        `${updatedPersonality.personality_name} has been updated.`,
      );

      logCommand();
    } else {
      // No other personalities with this name (for this user)
      await interaction.reply(
        `Could not find a personality with the name ${personalityName}.`,
      );

      logCommand();
    }
  } catch (err) {
    const error: Error = err as Error;
    const errorMessage = `Error during /edit-personality command: ${error.message}`;
    console.error(errorMessage);
    await interaction.reply({
      content: errorMessage,
    });
    logCommand();
  }
};
