import { SlashCommandBuilder } from "@discordjs/builders";
import { CommandInteraction } from "discord.js";
import { PollOptionRecord, PollRecord } from "../types/PocketbaseTables";
import { pb } from "../utilities/pocketbase";

// The option Emoji to display for voting
const optionEmoji = [
  "0️⃣",
  "1️⃣",
  "2️⃣",
  "3️⃣",
  "4️⃣",
  "5️⃣",
  "6️⃣",
  "7️⃣",
  "8️⃣",
  "9️⃣",
  "1230975029651701851",
];

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
        "Semi-colon delimitted list of options to start with (Thing One; Thing two). Max 11 Options."
      )
      .setRequired(false)
  );

export const execute = async (
  interaction: CommandInteraction,
  logCommand: () => void
) => {
  // Get inputs
  const pollName = interaction.options.get("name")?.value?.toString() || "";
  const pollOptions =
    interaction.options.get("options")?.value?.toString() || "";
  const usersCanAdd: boolean = Boolean(
    interaction.options.get("users-can-add")?.value?.toString() || false
  );
  const singleVote: boolean = Boolean(
    interaction.options.get("single-vote")?.value?.toString() || false
  );

  // Validate they sent a name
  if (!pollName.length) {
    // Input invalid
    await interaction.reply({
      content: "Poll Name is required.",
    });
    logCommand();
    return;
  }

  // Make sure the name isn't too long
  if (pollName.length > 100) {
    // Input invalid
    await interaction.reply({
      content: "Poll Name is too long.",
    });
    logCommand();
    return;
  }

  // Get the poll options
  const splitPollOptions =
    pollOptions.length > 0
      ? pollOptions
          .split(";")
          .map((po) => po.trim())
          .filter((po) => !!po)
      : [];

  // They passed too many options
  if (splitPollOptions.length > 11) {
    await interaction.reply(
      "You cannot have a poll with more than 11 options."
    );
    logCommand();
    return;
  }

  // No singular poll option should be more than 300 characters long
  if (splitPollOptions.some((po) => po.length > 300)) {
    await interaction.reply(
      "You cannot have a poll option with more than 300 characters."
    );
    logCommand();
    return;
  }

  // Should be good to keep going
  try {
    let slug = 0;

    // Get all existing polls to get the latest slug value
    const allPolls = await pb.collection<PollRecord>("poll").getFullList();

    // If there are other polls, find the highest slug to determine what the next one should be
    if (allPolls.length) {
      const allSlugs = allPolls.map((ap) => ap.slug);

      const highestSlug = Math.max(...allSlugs);

      slug = highestSlug + 1;
    }

    // Create the new poll record
    const newPollRecord = await pb.collection<PollRecord>("poll").create({
      user_id: interaction.user.id,
      name: pollName,
      users_can_add: usersCanAdd, // always false for now
      single_vote: singleVote, // always false for now
      slug: slug,
    });

    // Add poll options to db
    if (splitPollOptions.length) {
      for (let i = 0; i < splitPollOptions.length; i++) {
        await pb.collection<PollOptionRecord>("poll_option").create({
          option_name: splitPollOptions[i],
          poll: newPollRecord.id ?? "-1",
          user_id: interaction.user.id,
          slug: i,
        });
      }
    }

    // Announce new poll
    const response = await interaction.reply(
      `${
        interaction.user.username
      } created a new poll: \n## (${slug}) ${pollName}${
        splitPollOptions.length
          ? `${splitPollOptions.map(
              (po, index) => `\n- ${optionEmoji[index]}: ${po}`
            )}`
          : ""
      }`
    );

    // Add emoji if the user gave options
    if (splitPollOptions.length) {
      const message = await response.fetch();
      for (let i = 0; i < splitPollOptions.length; i++) {
        if (i < 10) {
          message.react(optionEmoji[i]);
        }
      }
    }

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
};
