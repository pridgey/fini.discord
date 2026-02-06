import { SlashCommandBuilder } from "@discordjs/builders";
import { ChatInputCommandInteraction } from "discord.js";
import { clearHistory } from "../utilities/chatHistory";
import { createNewPersonality } from "../modules/personalities/createPersonality";
import { personalityExistsForUser } from "../modules/personalities/getPersonality";
import { setPersonalityActive } from "../modules/personalities/setPersonalityActive";

const MAX_PERSONALITY_PROMPT_LENGTH = 300;
const MAX_PERSONALITY_NAME_LENGTH = 100;

export const data = new SlashCommandBuilder()
  .setName("create-personality")
  .setDescription("Creates a new Fini personality for you.")
  .addStringOption((option) =>
    option
      .setName("name")
      .setDescription("The name of this personality.")
      .setRequired(true),
  )
  .addStringOption((option) =>
    option
      .setName("prompt")
      .setDescription(
        "The description of the personality. This will be insert before every prompt.",
      )
      .setRequired(true),
  )
  .addBooleanOption((option) =>
    option
      .setName("activate")
      .setDescription("Will see this personality as active immediately")
      .setRequired(false),
  )
  .addBooleanOption((option) =>
    option
      .setName("clear")
      .setDescription("Clear your chat history")
      .setRequired(false),
  );

export const execute = async (
  interaction: ChatInputCommandInteraction,
  logCommand: () => void,
) => {
  const personalityName =
    interaction.options.get("name")?.value?.toString() || "";
  const personalityPrompt =
    interaction.options.get("prompt")?.value?.toString() || "";
  const setActiveNow: boolean =
    interaction.options.get("activate")?.value === true;
  const clearChat: boolean =
    interaction.options.get("clear")?.value === true;

  if (!personalityName.length || !personalityPrompt.length) {
    // Input invalid
    await interaction.reply({
      content: "A personality needs both Name and Prompt.",
    });
    logCommand();
  } else if (
    personalityPrompt.length > MAX_PERSONALITY_PROMPT_LENGTH ||
    personalityName.length > MAX_PERSONALITY_NAME_LENGTH
  ) {
    // Too long of a personality prompt
    await interaction.reply({
      content: `Woah, I can't remember all that. Let's try and keep things less than ${MAX_PERSONALITY_PROMPT_LENGTH} characters for the prompt and ${MAX_PERSONALITY_NAME_LENGTH} characters for the name, okay?`,
    });
    logCommand();
  } else {
    // All good, add the personality
    try {
      // Check to see if there's already a personality with this name
      const personalityExistsForThisUser = await personalityExistsForUser({
        userId: interaction.user.id,
        personalityName,
        serverId: interaction.guild?.id,
      });

      if (personalityExistsForThisUser) {
        // One already exists
        await interaction.reply(
          `There is already a personality with the name ${personalityName}`,
        );
        logCommand();
      } else {
        // No other personalities with this name (for this user)
        const newPersonalityRecord = await createNewPersonality({
          personalityName,
          personalityPrompt,
          setActiveNow,
          userId: interaction.user.id,
          serverId: interaction.guild?.id,
        });

        if (setActiveNow) {
          await setPersonalityActive({
            personalityId: newPersonalityRecord.id || "",
            userId: interaction.user.id,
            serverId: interaction.guild?.id,
          });
        }

        if (clearChat) {
          await clearHistory(
            interaction.user.id,
            interaction.guild?.id ?? "",
            "anthropic",
          );
        }

        await interaction.reply(
          `${personalityName} created. ${
            setActiveNow
              ? "It is set as active."
              : `To use it, run \`/set-personality ${personalityName}\``
          }`,
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
