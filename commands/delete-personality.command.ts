import { SlashCommandBuilder } from "@discordjs/builders";
import { ChatInputCommandInteraction } from "discord.js";
import { deletePersonalityByName } from "../modules/personalities/deletePersonality";
import { personalityExistsForUser } from "../modules/personalities/getPersonality";

export const data = new SlashCommandBuilder()
  .setName("delete-personality")
  .setDescription("Deletes any of your created Fini personalities.")
  .addStringOption((option) =>
    option
      .setName("name")
      .setDescription("The name of the personality to delete.")
      .setRequired(true),
  );

export const execute = async (
  interaction: ChatInputCommandInteraction,
  logCommand: () => void,
) => {
  const personalityName =
    interaction.options.get("name")?.value?.toString() || "";

  if (!personalityName.length) {
    // Input invalid
    await interaction.reply({
      content: "A Bot needs a name (to kill).",
    });

    logCommand();
  } else {
    // Input is valid
    try {
      // Check to see if there's already a personality with this name
      const personalityExists = await personalityExistsForUser({
        userId: interaction.user.id,
        personalityName,
        serverId: interaction.guild?.id,
      });

      if (personalityExists) {
        // It's there, delete it
        await deletePersonalityByName({
          userId: interaction.user.id,
          personalityName,
          serverId: interaction.guild?.id,
        });

        await interaction.reply(`${personalityName} killed. You did this.`);

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
      const errorMessage = `Error during /delete-personality command: ${error.message}`;
      console.error(errorMessage);
      await interaction.reply({
        content: errorMessage,
      });
      logCommand();
    }
  }
};
