import { SlashCommandBuilder } from "@discordjs/builders";
import { CommandInteraction } from "discord.js";
import { PollRecord } from "../types/PocketbaseTables";
import { pb } from "../utilities/pocketbase";

export const data = new SlashCommandBuilder()
  .setName("delete-poll")
  .setDescription("Deletes a poll")
  .addStringOption((option) =>
    option
      .setName("id")
      .setDescription(
        "The id of the poll to delete. Typically seen next to the poll name: ({id}) Poll Name."
      )
      .setRequired(true)
  );

export const execute = async (
  interaction: CommandInteraction,
  logCommand: () => void
) => {
  const pollSlug = interaction.options.get("id")?.value?.toString() || "";

  if (!pollSlug.length) {
    // Input invalid
    await interaction.reply({
      content:
        "Poll Id is a required field. It will typically be seen next to the name of the poll: `({id}) Poll Name`",
    });

    logCommand();
  } else {
    // Input is valid
    try {
      // Check to see if there's a poll with this name
      const foundPoll = await pb.collection<PollRecord>("poll").getFullList({
        filter: `user_id = "${interaction.user.id}" && slug = "${pollSlug}"`,
      });

      if (foundPoll.length > 0) {
        // It's there, delete the first one found
        await pb.collection<PollRecord>("poll").delete(foundPoll[0]?.id || "");

        await interaction.reply(
          `(${foundPoll[0].slug}) ${foundPoll[0].name} and all of its options and votes have been deleted.`
        );

        logCommand();
      } else {
        // No Poll found
        await interaction.reply(
          `Could not find a Poll with the ID ${pollSlug}`
        );

        logCommand();
      }
    } catch (err) {
      const error: Error = err as Error;
      const errorMessage = `Error during /delete-poll command: ${error.message}`;
      console.error(errorMessage);
      await interaction.reply({
        content: errorMessage,
      });
      logCommand();
    }
  }
};
