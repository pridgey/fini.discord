import { SlashCommandBuilder } from "@discordjs/builders";
import { CommandInteraction } from "discord.js";
import { PersonalitiesRecord } from "../types/PocketbaseTables";
import { pb } from "../utilities/pocketbase";

export const data = new SlashCommandBuilder()
  .setName("create-personality")
  .setDescription("Creates a new Fini personality for you.")
  .addStringOption((option) =>
    option
      .setName("name")
      .setDescription("The name of this personality.")
      .setRequired(true)
  )
  .addStringOption((option) =>
    option
      .setName("prompt")
      .setDescription(
        "The description of the personality. This will be insert before every prompt."
      )
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
      content: "A personality needs both Name and Prompt.",
    });
    logCommand();
  } else {
    // All good, add the personality
    try {
      // Check to see if there's already a personality with this name
      const existingPersonalities = await pb
        .collection<PersonalitiesRecord>("personalities")
        .getFullList({
          filter: `user_id = "${interaction.user.id}" && personality_name = "${personalityName}"`,
        });

      if (existingPersonalities.length > 0) {
        // One already exists
        await interaction.reply(
          `There is already a personality with the name ${personalityName}`
        );
        logCommand();
      } else {
        // No other personalities with this name (for this user)
        await pb.collection<PersonalitiesRecord>("personalities").create({
          user_id: interaction.user.id,
          prompt: personalityPrompt,
          personality_name: personalityName,
          active: false,
        });

        await interaction.reply(
          `${personalityName} created. To use it, run /set-personality ${personalityName}`
        );

        logCommand();
      }
    } catch (err) {
      const error: Error = err as Error;
      const errorMessage = `Error during /create-personality command: ${error.message}`;
      console.error(errorMessage);
      await interaction.reply({
        content: errorMessage,
      });
      logCommand();
    }
  }
};
