import { SlashCommandBuilder } from "@discordjs/builders";
import {
  ChatInputCommandInteraction,
  MessageFlags,
  PermissionFlagsBits,
} from "discord.js";
import { requireAdmin } from "../utilities/discord/isAdmin";
import { postDaily } from "../modules/dailies/geo/daily";
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
      .setDescription("Post today's real daily round now, without waiting for noon"),
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

export const execute = async (
  interaction: ChatInputCommandInteraction,
  logCommand: () => void,
) => {
  if (!(await requireAdmin(interaction, "use the location game prototype"))) return;
  logCommand();

  await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

  if (interaction.options.getSubcommand() === "post-daily") {
    const posted = await postDaily(interaction.client);
    await interaction.editReply(
      posted
        ? `Posted today's daily in ${posted} server${posted === 1 ? "" : "s"}.`
        : "Nothing new to post: today's round is already out everywhere with a bot channel, or no server has one set (`/config bot_channel`).",
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
    await interaction.editReply("You don't have a test round going. Start one with `/geo-test new`.");
    return;
  }

  const guess = await geocodeGuess(interaction.options.getString("place", true)).catch(
    () => undefined,
  );
  if (guess === undefined) {
    await interaction.editReply("The place search didn't answer. Try again in a moment.");
    return;
  }
  if (!guess) {
    await interaction.editReply("I couldn't find that place. Try a bigger place nearby, or paste coordinates.");
    return;
  }

  holdGuess(interaction.user.id, guess);
  await interaction.editReply(await guessMessage(guess));
};
