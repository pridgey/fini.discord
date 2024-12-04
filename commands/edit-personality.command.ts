import { SlashCommandBuilder } from "@discordjs/builders";
import { CommandInteraction } from "discord.js";
import { PersonalitiesRecord } from "../types/PocketbaseTables";
import { pb } from "../utilities/pocketbase";

export const data = new SlashCommandBuilder()
  .setName("edit-personality")
  .setDescription("Edit any of your created Fini personalities.")
  .addStringOption((option) =>
    option
      .setName("name")
      .setDescription("The name of the personality to modify.")
      .setRequired(true)
  )
  .addStringOption((option) =>
    option
      .setName("prompt")
      .setDescription("The new personality prompt.")
      .setRequired(true)
  );

export const execute = async (
  interaction: CommandInteraction,
  logCommand: () => void
) => {
  const personalityName =
    interaction.options.get("name")?.value?.toString() || "";
  const personalityPrompt =
    interaction.options.get("prompt")?.value?.toString() || "";

  if (!personalityName.length || !personalityPrompt.length) {
    // Input invalid
    await interaction.reply({
      content: "We're missing information. Please try again.",
    });

    logCommand();
  } else if (personalityName.length > 100 || personalityPrompt.length > 300) {
    // Input too long
    await interaction.reply({
      content:
        "That's way too much to remember, please tone it down to less than 300 characters.",
    });

    logCommand();
  } else {
    // Input is valid
    try {
      // Check to see if there's already a personality with this name
      const existingPersonality = await pb
        .collection<PersonalitiesRecord>("personalities")
        .getFullList({
          filter: `user_id = "${interaction.user.id}" && personality_name = "${personalityName}" && server_id = "${interaction.guild?.id}"`,
        });

      if (existingPersonality.length > 0) {
        // It's there, update it
        await pb
          .collection<PersonalitiesRecord>("personalities")
          .update(existingPersonality[0]?.id || "", {
            ...existingPersonality[0],
            prompt: personalityPrompt,
          });

        await interaction.reply(`${personalityName} has been updated.`);

        logCommand();
      } else {
        // No other personalities with this name (for this user)
        await interaction.reply(
          `Could not find a personality with the name ${personalityName}.`
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
  }
};
