import { SlashCommandBuilder } from "@discordjs/builders";
import {
  ChatInputCommandInteraction,
  GuildMember,
  MessageFlags,
} from "discord.js";
import { todaysRoundFor } from "../modules/dailies/geo/daily";
import {
  WEAVE_LIVE,
  ensureTodaysWeave,
  openWeave,
  type WeavePlayer,
} from "../modules/dailies/weave/daily";
import { requireAdmin } from "../utilities/discord/isAdmin";
import { getWeaveRound } from "../modules/dailies/weave/store";
import { POST_TIME, currentDay } from "../modules/dailies/shared";

/**
 * The daily games. Each posts itself in the bot channel; this brings today's
 * round back for anyone who missed the post.
 */
export const data = new SlashCommandBuilder()
  .setName("daily")
  .setDescription("Play today's daily games")
  .addSubcommand((sub) =>
    sub
      .setName("geo")
      .setDescription(
        "Today's location round: guess where the photos were taken",
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName("weave")
      .setDescription(
        "Today's Weave: find five hidden words in a grid of letters",
      ),
  );

export const execute = async (
  interaction: ChatInputCommandInteraction,
  logCommand: () => void,
) => {
  logCommand();
  if (!interaction.guildId) {
    await interaction.reply({
      content: "The daily is played in a server.",
      flags: [MessageFlags.Ephemeral],
    });
    return;
  }
  const weave = interaction.options.getSubcommand() === "weave";
  if (
    weave &&
    !WEAVE_LIVE &&
    !(await requireAdmin(interaction, "play Weave while it's on trial"))
  )
    return;

  await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

  if (weave) {
    // On trial nothing posts it, so the day's puzzle is made on demand.
    const round = WEAVE_LIVE
      ? await getWeaveRound(currentDay())
      : await ensureTodaysWeave();
    if (!round) {
      await interaction.editReply(
        `There's no Weave up right now. The next one posts at ${POST_TIME}.`,
      );
      return;
    }
    const player: WeavePlayer = {
      serverId: interaction.guildId,
      serverName: interaction.guild?.name ?? "unknown guild name",
      userId: interaction.user.id,
      username: interaction.user.username,
      displayName:
        (interaction.member as GuildMember | null)?.displayName ??
        interaction.user.displayName,
    };
    await interaction.editReply(await openWeave(round, player));
    return;
  }

  await interaction.editReply(
    await todaysRoundFor(interaction.guildId, interaction.user.id),
  );
};
