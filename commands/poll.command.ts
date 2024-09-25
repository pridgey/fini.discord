import { SlashCommandBuilder } from "@discordjs/builders";
import { CommandInteraction } from "discord.js";
import { PollOptionRecord, PollRecord } from "../types/PocketbaseTables";
import { pb } from "../utilities/pocketbase";

export const data = new SlashCommandBuilder()
  .setName("poll")
  .setDescription("Creates a new Poll to vote on things.")
  .addStringOption((option) =>
    option
      .setName("name")
      .setDescription(
        "The name of the poll. Will be displayed as a poll prompt."
      )
      .setRequired(true)
  )
  .addStringOption((option) =>
    option
      .setName("options")
      .setDescription(
        "Semi-colon delimitted list of options to start with (Thing; Thing two)"
      )
      .setRequired(false)
  )
  .addBooleanOption((option) =>
    option
      .setName("users-can-add")
      .setDescription(
        "Whether or not users can add options to the poll (Default false)"
      )
      .setRequired(false)
  )
  .addBooleanOption((option) =>
    option
      .setName("single-vote")
      .setDescription(
        "Whether or not users can vote for more than one option (Default false)"
      )
      .setRequired(false)
  );

export const execute = async (
  interaction: CommandInteraction,
  logCommand: () => void
) => {
  const pollName = interaction.options.get("name")?.value?.toString() || "";
  const pollOptions =
    interaction.options.get("options")?.value?.toString() || "";
  const usersCanAdd: boolean = Boolean(
    interaction.options.get("users-can-add")?.value?.toString() || false
  );
  const singleVote: boolean = Boolean(
    interaction.options.get("single-vote")?.value?.toString() || false
  );

  if (!pollName.length) {
    // Input invalid
    await interaction.reply({
      content: "Poll Name is required.",
    });
    logCommand();
  } else {
    // All good, add the poll
    try {
      let slug = 0;

      // Get all existing polls to get the latest slug value
      const allPolls = await pb.collection<PollRecord>("poll").getFullList();

      if (allPolls.length) {
        const allSlugs = allPolls.map((ap) => ap.slug);

        const highestSlug = Math.max(...allSlugs);

        slug = highestSlug + 1;
      }

      const newPollRecord = await pb.collection<PollRecord>("poll").create({
        user_id: interaction.user.id,
        name: pollName,
        users_can_add: usersCanAdd,
        single_vote: singleVote,
        slug: slug,
      });

      // Get the poll options
      const splitPollOptions =
        pollOptions.length > 0
          ? pollOptions
              .split(";")
              .map((po) => po.trim())
              .filter((po) => !!po)
          : [];

      // Add poll options to db
      if (splitPollOptions.length) {
        const allPollOptions = await pb
          .collection<PollOptionRecord>("poll_option")
          .getFullList();

        const highestOptionSlug = allPollOptions.length
          ? Math.max(...allPollOptions.map((apo) => apo.slug))
          : 0;

        for (let i = 0; i < splitPollOptions.length; i++) {
          await pb.collection<PollOptionRecord>("poll_option").create({
            option_name: splitPollOptions[i],
            poll: newPollRecord.id ?? "-1",
            user_id: interaction.user.id,
            slug: highestOptionSlug + i + 1,
          });
        }
      }

      await interaction.reply(
        `${
          interaction.user.username
        } created a new poll: \`(${slug}) ${pollName}\`${
          splitPollOptions.length
            ? `\n\nPoll Options:${splitPollOptions.map(
                (po) => `\n- ${po}`
              )}\n\nTo vote for an option use the \`/vote\` command.`
            : ""
        }`
      );

      logCommand();
    } catch (err) {
      const error: Error = err as Error;
      const errorMessage = `Error during /poll command: ${error.message}`;
      console.error(errorMessage);
      await interaction.reply({
        content: errorMessage,
      });
      logCommand();
    }
  }
};
