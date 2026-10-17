import type { SlashCommand } from "../types/handlers";
import { SlashCommandBuilder } from "@discordjs/builders";
import {
  ChatInputCommandInteraction,
  MessageFlags,
  PermissionFlagsBits,
} from "discord.js";
import { requireAdmin } from "../utilities/discord/isAdmin";
import { postDaily } from "../modules/dailies/geo/daily";
import { WEAVE_LIVE, postWeave } from "../modules/dailies/weave/daily";
import { geocodeGuess } from "../modules/dailies/geo/geocode";
import {
  guessMessage,
  holdGuess,
  roundFor,
  roundMessage,
  startRound,
} from "../modules/dailies/geo/testRound";

/**
 * Admin-only prototype of the daily location game. Rounds are private and pay
 * nothing; see `modules/dailies/geo/testRound.ts`.
 */
export const data = new SlashCommandBuilder()
  .setName("geo-test")
  .setDescription("Admin only: try the daily location game prototype")
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addSubcommand((sub) =>
    sub.setName("new").setDescription("Start a private test round"),
  )
  .addSubcommand((sub) =>
    sub
      .setName("post-daily")
      .setDescription(
        "Post today's daily rounds now, without waiting for noon",
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName("guess")
      .setDescription("Guess where your test round's photos were taken")
      .addStringOption((option) =>
        option
          .setName("place")
          .setDescription("A place name, or coordinates like 45.7640, 4.8357")
          .setRequired(true)
          .setMaxLength(200),
      ),
  );

export const execute: SlashCommand["execute"] = async (
  interaction: ChatInputCommandInteraction,
  logCommand: () => void,
) => {
  if (!(await requireAdmin(interaction, "use the location game prototype")))
    return;
  logCommand();

  await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

  if (interaction.options.getSubcommand() === "post-daily") {
    const geo = await postDaily(interaction.client);
    // Weave posts only once it's live.
    const weave = WEAVE_LIVE ? await postWeave(interaction.client) : 0;
    await interaction.editReply(
      geo || weave
        ? `Posted today's location round in ${geo} server${geo === 1 ? "" : "s"}${WEAVE_LIVE ? ` and Weave in ${weave}` : ""}.`
        : "Nothing new to post: today's rounds are already out everywhere with a bot channel, or no server has one set (`/config bot_channel`).",
    );
    return;
  }

  if (interaction.options.getSubcommand() === "new") {
    const round = await startRound(interaction.user.id);
    await interaction.editReply(
      round
        ? roundMessage(round)
        : "Couldn't find any street photos after a few tries. Try again in a moment.",
    );
    return;
  }

  if (!roundFor(interaction.user.id)) {
    await interaction.editReply(
      "You don't have a test round going. Start one with `/geo-test new`.",
    );
    return;
  }

  const guess = await geocodeGuess(
    interaction.options.getString("place", true),
  ).catch(() => undefined);
  if (guess === undefined) {
    await interaction.editReply(
      "The place search didn't answer. Try again in a moment.",
    );
    return;
  }
  if (!guess) {
    await interaction.editReply(
      "I couldn't find that place. Try a bigger place nearby, or paste coordinates.",
    );
    return;
  }

  holdGuess(interaction.user.id, guess);
  await interaction.editReply(await guessMessage(guess));
};
