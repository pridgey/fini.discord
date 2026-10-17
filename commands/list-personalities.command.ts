import type { SlashCommand } from "../types/handlers";
import { SlashCommandBuilder } from "@discordjs/builders";
import { ChatInputCommandInteraction } from "discord.js";
import { getAllPersonalitiesForUser } from "../modules/personalities/getPersonality";
import { splitBigString } from "../utilities/splitBigString";

export const data = new SlashCommandBuilder()
  .setName("list-personalities")
  .setDescription("Gets all of your created personalities.");

export const execute: SlashCommand["execute"] = async (
  interaction: ChatInputCommandInteraction,
  logCommand: () => void,
) => {
  // List out the personalities
  try {
    const personalities = await getAllPersonalitiesForUser({
      userId: interaction.user.id,
      serverId: interaction.guild?.id,
    });

    const messages =
      splitBigString(`Here are the personalities you've created: \n- Default: Essentially unsets Fini's personality.${personalities
        .map(
          (p) =>
            `\n- ${p.personality_name}${p.active ? " **(Active)**" : ""}: ${
              p.prompt
            }`,
        )
        .join("")}
    \n\nTo use a command run /set-personality {name}`);

    await interaction.reply(messages.at(0) ?? "No personalities found.");

    if (messages.length > 1) {
      for (const message of messages.slice(1)) {
        await interaction.followUp(message);
      }
    }

    logCommand();
  } catch (err) {
    const error: Error = err as Error;
    const errorMessage = `Error during /list-personality command: ${error.message}`;
    console.error(errorMessage);
    await interaction.reply({
      content: errorMessage,
    });
    logCommand();
  }
};
