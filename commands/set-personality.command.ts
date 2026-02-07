import { SlashCommandBuilder } from "@discordjs/builders";
import { ChatInputCommandInteraction } from "discord.js";
import {
  markAllPersonalitiesInactiveForUser,
  setPersonalityActiveByName,
} from "../modules/personalities/setPersonalityActive";
import { clearHistory } from "../utilities/chatHistory";

export const data = new SlashCommandBuilder()
  .setName("set-personality")
  .setDescription("Sets Fini to a created personality.")
  .addStringOption((option) =>
    option
      .setName("name")
      .setDescription("The name of the personality you want Fini to have.")
      .setRequired(true),
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
  const clearChat: boolean = Boolean(
    interaction.options.get("clear")?.value?.toString() || false,
  );

  if (!personalityName.length) {
    // Input invalid
    await interaction.reply({
      content: "A Bot needs a name.",
    });
    logCommand();
  } else {
    // Input is validated!
    try {
      if (personalityName === "Default") {
        await markAllPersonalitiesInactiveForUser({
          userId: interaction.user.id,
          serverId: interaction.guild?.id,
        });
      } else {
        await setPersonalityActiveByName({
          personalityName,
          userId: interaction.user.id,
          serverId: interaction.guild?.id,
        });
      }

      if (clearChat) {
        await clearHistory(
          interaction.user.id,
          interaction.guild?.id ?? "",
          "openai",
        );
        await clearHistory(
          interaction.user.id,
          interaction.guild?.id ?? "",
          "anthropic",
        );
      }

      await interaction.reply(
        `Active personality set to ${personalityName}. ${
          clearChat ? "(Chat history cleared)" : ""
        }`,
      );

      logCommand();
    } catch (err) {
      const error: Error = err as Error;
      const errorMessage = `Error during /set-personality command: ${error.message}`;
      console.error(errorMessage);
      await interaction.reply({
        content: errorMessage,
      });
      logCommand();
    }
  }
};
