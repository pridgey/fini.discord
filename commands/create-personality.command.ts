import { SlashCommandBuilder } from "@discordjs/builders";
import { CommandInteraction } from "discord.js";
import { PersonalitiesRecord } from "../types/PocketbaseTables";
import { pb } from "../utilities/pocketbase";
import { clearHistory } from "../utilities/chatHistory";

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
  )
  .addBooleanOption((option) =>
    option
      .setName("activate")
      .setDescription("Will see this personality as active immediately")
      .setRequired(false)
  )
  .addBooleanOption((option) =>
    option
      .setName("clear")
      .setDescription("Clear your chat history")
      .setRequired(false)
  );

export const execute = async (
  interaction: CommandInteraction,
  logCommand: () => void
) => {
  const personalityName =
    interaction.options.get("name")?.value?.toString() || "";
  const personalityPrompt =
    interaction.options.get("prompt")?.value?.toString() || "";
  const setActiveNow: boolean = Boolean(
    interaction.options.get("activate")?.value?.toString() || false
  );
  const clearChat: boolean = Boolean(
    interaction.options.get("clear")?.value?.toString() || false
  );

  if (!personalityName.length || !personalityPrompt.length) {
    // Input invalid
    await interaction.reply({
      content: "A personality needs both Name and Prompt.",
    });
    logCommand();
  } else if (personalityPrompt.length > 1000 || personalityName.length > 100) {
    // Too long of a personality prompt
    await interaction.reply({
      content:
        "Woah, I can't remember all that. Let's try and keep things less than 300 characters, okay?",
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
        const newPersonalityRecord = await pb
          .collection<PersonalitiesRecord>("personalities")
          .create({
            user_id: interaction.user.id,
            prompt: personalityPrompt,
            personality_name: personalityName,
            active: setActiveNow ?? false,
            server_id: interaction.guild?.id ?? "unknown",
          });

        if (setActiveNow) {
          // Set everything else as not active
          const allPersonalitiesExceptNew = await pb
            .collection<PersonalitiesRecord>("personalities")
            .getFullList({
              filter: `user_id = "${interaction.user.id}" && id != "${newPersonalityRecord.id}" && server_id = "${interaction.guild?.id}"`,
            });

          for (let i = 0; i < allPersonalitiesExceptNew.length; i++) {
            await pb
              .collection("personalities")
              .update(allPersonalitiesExceptNew[i].id || "", {
                ...allPersonalitiesExceptNew[i],
                active: false,
              });
          }
        }

        if (clearChat) {
          await clearHistory(
            interaction.user.id,
            interaction.guild?.id ?? "",
            "openai"
          );
        }

        await interaction.reply(
          `${personalityName} created. ${
            setActiveNow
              ? "It is set as active."
              : `To use it, run \`/set-personality ${personalityName}\``
          }`
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
