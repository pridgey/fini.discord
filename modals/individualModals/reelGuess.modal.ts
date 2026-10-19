import type { ModalHandler } from "../../types/handlers";
import { GuildMember, MessageFlags, ModalSubmitInteraction } from "discord.js";
import { requireAdmin } from "../../utilities/discord/isAdmin";
import { REEL_GUESS_MODAL } from "../../modules/dailies/reel/board";
import {
  REEL_LIVE,
  guessReel,
  playableReel,
} from "../../modules/dailies/reel/daily";
import { weavePlayerOf } from "../../modules/dailies/weave/player";
import { dailyPlayed } from "../../modules/dailies/post";

export const namespace = REEL_GUESS_MODAL;

/** A film typed into Reel's "Guess the film" box: matched, judged, saved, paid, and the board redrawn. */
export const execute: ModalHandler["execute"] = async (
  interaction: ModalSubmitInteraction,
  args: string[],
) => {
  const [roundId] = args;
  if (
    !REEL_LIVE &&
    !(await requireAdmin(interaction, "play Reel while it's on trial"))
  )
    return;
  const playable = await playableReel(roundId);
  if ("refusal" in playable || !interaction.guildId) {
    await interaction.reply({
      content:
        "refusal" in playable
          ? playable.refusal
          : "Reel is played in a server.",
      flags: [MessageFlags.Ephemeral],
    });
    return;
  }

  // Matching the guess on TMDB can outlast Discord's three seconds.
  await interaction.deferUpdate();
  const player = weavePlayerOf(
    interaction,
    interaction.member as GuildMember | null,
  );
  const { board, solve } = await guessReel(
    playable.round,
    player,
    interaction.fields.getTextInputValue("film"),
  );
  dailyPlayed(
    interaction.client,
    interaction.guildId,
    solve && { game: "reel", name: player.displayName, ...solve },
  );
  await interaction.editReply(board);
};
