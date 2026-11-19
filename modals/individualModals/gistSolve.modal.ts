import type { ModalHandler } from "../../types/handlers";
import { GuildMember, MessageFlags, ModalSubmitInteraction } from "discord.js";
import { requireAdmin } from "../../utilities/discord/isAdmin";
import { GIST_SOLVE_MODAL } from "../../modules/dailies/gist/board";
import {
  GIST_LIVE,
  playableGist,
  solveGist,
} from "../../modules/dailies/gist/daily";
import { weavePlayerOf } from "../../modules/dailies/weave/player";
import { dailyPlayed } from "../../modules/dailies/post";

export const namespace = GIST_SOLVE_MODAL;

/** A phrase typed into Gist's "Solve the phrase" box: judged, saved, paid, and the board redrawn. */
export const execute: ModalHandler["execute"] = async (
  interaction: ModalSubmitInteraction,
  args: string[],
) => {
  const [roundId] = args;
  if (
    !GIST_LIVE &&
    !(await requireAdmin(interaction, "play Gist while it's on trial"))
  )
    return;
  const playable = await playableGist(roundId);
  if ("refusal" in playable || !interaction.guildId) {
    await interaction.reply({
      content:
        "refusal" in playable
          ? playable.refusal
          : "Gist is played in a server.",
      flags: [MessageFlags.Ephemeral],
    });
    return;
  }

  await interaction.deferUpdate();
  const player = weavePlayerOf(
    interaction,
    interaction.member as GuildMember | null,
  );
  const { board, solve } = await solveGist(
    playable.round,
    player,
    interaction.fields.getTextInputValue("phrase"),
  );
  dailyPlayed(
    interaction.client,
    interaction.guildId,
    solve && { game: "gist", name: player.displayName, ...solve },
  );
  await interaction.editReply({ ...board, attachments: [] });
};
