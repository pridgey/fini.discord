import { SlashCommandBuilder } from "@discordjs/builders";
import { CommandInteraction } from "discord.js";
import {
  PollOptionRecord,
  PollRecord,
  PollVoteRecord,
} from "../types/PocketbaseTables";
import { pb } from "../utilities/pocketbase";

export const data = new SlashCommandBuilder()
  .setName("vote")
  .setDescription("Votes on a poll")
  .addStringOption((option) =>
    option
      .setName("option")
      .setDescription("The id of the poll option to vote for.")
      .setRequired(true)
  );

export const execute = async (
  interaction: CommandInteraction,
  logCommand: () => void
) => {
  const pollOptionSlug =
    interaction.options.get("option")?.value?.toString() || "";

  if (!pollOptionSlug.length) {
    // Input invalid
    await interaction.reply({
      content:
        "Poll Option Id is a required field. It will typically be seen next to the name of the poll option: `({id}) Poll Option`",
    });

    logCommand();
  } else {
    // Input is valid
    try {
      // Check to see if there's a poll option with this slug
      const foundPollOption = await pb
        .collection<PollOptionRecord>("poll_option")
        .getFullList({
          filter: `slug = "${pollOptionSlug}"`,
        });

      if (foundPollOption.length > 0) {
        // There is a valid polloption, let's make sure the user can vote for this
        const pollRecord = await pb
          .collection<PollRecord>("poll")
          .getOne(foundPollOption[0].poll);

        if (pollRecord?.single_vote) {
          // The user gets one vote, remove any vote records for this poll and user
          const userVotes = await pb
            .collection<PollVoteRecord>("poll_vote")
            .getFullList({
              filter: `user_id = "${interaction.user.id}" && poll = "${
                pollRecord.id ?? "-1"
              }"`,
            });

          // Delete all user's current vote records
          for (let i = 0; i < userVotes.length; i++) {
            await pb
              .collection<PollVoteRecord>("poll_vote")
              .delete(userVotes[i].id ?? "-1");
          }
        }

        // We're ready to add the user vote
        await pb.collection<PollVoteRecord>("poll_vote").create({
          poll_option: foundPollOption[0].id ?? "-1",
          user_id: interaction.user.id,
          poll: pollRecord.id ?? "-1",
        });

        await interaction.reply(
          `${interaction.user.username} has voted on \`(${pollRecord.slug}) ${pollRecord.name}\`\n(${foundPollOption[0].slug}) ${foundPollOption[0].option_name}`
        );

        logCommand();
      } else {
        // No Poll found
        await interaction.reply(
          `Could not find a Poll Option with the ID ${pollOptionSlug}.`
        );

        logCommand();
      }
    } catch (err) {
      const error: Error = err as Error;
      const errorMessage = `Error during /vote command: ${error.message}`;
      console.error(errorMessage);
      await interaction.reply({
        content: errorMessage,
      });
      logCommand();
    }
  }
};
