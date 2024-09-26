import { SlashCommandBuilder } from "@discordjs/builders";
import { CommandInteraction } from "discord.js";
import {
  PersonalitiesRecord,
  PollOptionRecord,
  PollRecord,
} from "../types/PocketbaseTables";
import { pb } from "../utilities/pocketbase";

export const data = new SlashCommandBuilder()
  .setName("list-polls")
  .setDescription("Gets all of your created polls.")
  .addStringOption((option) =>
    option
      .setName("id")
      .setDescription(
        "The id of the poll to display. Typically seen next to the poll name: ({id}) Poll Name."
      )
      .setRequired(false)
  );

export const execute = async (
  interaction: CommandInteraction,
  logCommand: () => void
) => {
  const pollSlug = interaction.options.get("id")?.value?.toString() || "";

  // List them out
  try {
    if (!!pollSlug) {
      const poll = await pb
        .collection<PollRecord>("poll")
        .getFirstListItem(`slug = ${pollSlug}`);

      if (!poll) {
        await interaction.reply(`No poll was found with ID ${pollSlug}`);
        logCommand();
        return;
      }

      const pollOptions = await pb
        .collection<PollOptionRecord>("poll_option")
        .getFullList({
          filter: `poll = "${poll.id}"`,
        });

      await interaction.reply(
        `## (${poll.slug}) ${poll.name}${
          pollOptions.length
            ? `${pollOptions.map((po) => `\n- ${po.option_name}`)}`
            : ""
        }`
      );
      logCommand();
    } else {
      const polls = await pb.collection<PollRecord>("poll").getFullList({
        filter: `user_id = "${interaction.user.id}"`,
      });

      await interaction.reply(
        `Here are your polls: ${polls.map((p) => `\n- (${p.slug}) ${p.name}`)}`
      );

      logCommand();
    }
  } catch (err) {
    const error: Error = err as Error;
    const errorMessage = `Error during /list-polls command: ${error.message}`;
    console.error(errorMessage);
    await interaction.reply({
      content: errorMessage,
    });
    logCommand();
  }
};
