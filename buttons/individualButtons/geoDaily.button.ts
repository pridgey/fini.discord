import type { ButtonHandler } from "../../types/handlers";
import { ButtonInteraction, GuildMember, MessageFlags } from "discord.js";
import {
  DAILY_BUTTON,
  cannotGuess,
  lockDailyGuess,
  modalId,
  playedResult,
  todaysRoundFor,
} from "../../modules/dailies/geo/daily";
import { findGuess, getRoundById } from "../../modules/dailies/geo/dailyStore";
import { guessModal } from "../../modules/dailies/geo/messages";
import { refreshDailyPost } from "../../modules/dailies/post";

export const namespace = DAILY_BUTTON;

/**
 * The daily location game's buttons: `play` (on the daily post) shows today's
 * round privately; `guess` and `retry` open the box a guess is typed into;
 * `lock` judges, saves and pays the guess on screen.
 */
export const execute: ButtonHandler["execute"] = async (
  interaction: ButtonInteraction,
  args: string[],
) => {
  const [action, roundId] = args;
  const serverId = interaction.guildId;
  if (!serverId) {
    await interaction.reply({
      content: "The daily is played in a server.",
      flags: [MessageFlags.Ephemeral],
    });
    return;
  }

  const round = await getRoundById(roundId);

  // From the daily post: today's round, privately - or their result, if played.
  if (action === "play") {
    await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
    await interaction.editReply(
      await todaysRoundFor(serverId, interaction.user.id),
    );
    return;
  }

  if (action === "guess" || action === "retry") {
    // Played already: their result again, as Weave shows a finished board.
    // Checked quickly first - opening the guess box has to be the first reply,
    // and drawing the result's map can take longer than Discord waits.
    if (round && (await findGuess(round.id, serverId, interaction.user.id))) {
      await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
      const result = await playedResult(round, serverId, interaction.user.id);
      await interaction.editReply(
        result ?? {
          content:
            "That round is over. The current one is up with `/daily geo`.",
        },
      );
      return;
    }
    const refusal = await cannotGuess(round, serverId, interaction.user.id);
    if (refusal) {
      await interaction.reply({
        content: refusal,
        flags: [MessageFlags.Ephemeral],
      });
      return;
    }
    await interaction.showModal(
      guessModal(modalId(roundId, action === "guess" ? "new" : "edit")),
    );
    return;
  }

  if (action === "lock") {
    await interaction.deferUpdate();
    if (!round) {
      await interaction.editReply({
        content: "That round is gone.",
        files: [],
        attachments: [],
        components: [],
      });
      return;
    }
    const result = await lockDailyGuess(round, {
      serverId,
      serverName: interaction.guild?.name ?? "unknown guild name",
      userId: interaction.user.id,
      username: interaction.user.username,
      displayName:
        (interaction.member as GuildMember | null)?.displayName ??
        interaction.user.displayName,
    });
    if ("reveal" in result) refreshDailyPost(interaction.client, serverId);
    await interaction.editReply(
      "reveal" in result
        ? { ...result.reveal, components: [], attachments: [] }
        : {
            content: result.refusal,
            files: [],
            attachments: [],
            components: [],
          },
    );
  }
};
