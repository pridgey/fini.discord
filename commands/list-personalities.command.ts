import { SlashCommandBuilder } from "@discordjs/builders";
import { CommandInteraction } from "discord.js";
import { PersonalitiesRecord } from "../types/PocketbaseTables";
import { pb } from "../utilities/pocketbase";
import { splitBigString } from "../utilities/splitBigString";

export const data = new SlashCommandBuilder()
  .setName("list-personalities")
  .setDescription("Gets all of your created personalities.");

export const execute = async (
  interaction: CommandInteraction,
  logCommand: () => void
) => {
  // List out the personalities
  try {
    const personalities = await pb
      .collection<PersonalitiesRecord>("personalities")
      .getFullList({
        filter: `user_id = "${interaction.user.id}" && server_id = "${interaction.guild?.id}"`,
      });

    const messages =
      splitBigString(`Here are the personalities you've created: \n- Default: Essentially unsets Fini's personality.${personalities.map(
        (p) =>
          `\n- ${p.personality_name}${p.active ? " (Active)" : ""}: ${p.prompt}`
      )}
    \n\nTo use a command run /set-personality {name}`);

    await interaction.reply(messages.at(0) ?? "No personalities found.");

    if (messages.length > 1) {
      messages.slice(1).forEach(async (m) => {
        await interaction.followUp(m);
      });
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
