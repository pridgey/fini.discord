import type { ModalHandler } from "../../types/handlers";
import { GuildMember, MessageFlags, ModalSubmitInteraction } from "discord.js";
import { requireAdmin } from "../../utilities/discord/isAdmin";
import { WEAVE_THREAD_MODAL } from "../../modules/dailies/weave/board";
import {
  WEAVE_LIVE,
  guessWeaveThread,
  playableWeave,
} from "../../modules/dailies/weave/daily";
import { weavePlayerOf } from "../../modules/dailies/weave/player";
import { refreshDailyPost } from "../../modules/dailies/post";

export const namespace = WEAVE_THREAD_MODAL;

/** The one guess at a Weave's thread, typed into its box: judged, saved, paid, and the board redrawn. */
export const execute: ModalHandler["execute"] = async (
  interaction: ModalSubmitInteraction,
  args: string[],
) => {
  const [roundId] = args;
  if (
    !WEAVE_LIVE &&
    !(await requireAdmin(interaction, "play Weave while it's on trial"))
  )
    return;
  const playable = await playableWeave(roundId);
  if ("refusal" in playable || !interaction.guildId) {
    await interaction.reply({
      content:
        "refusal" in playable
          ? playable.refusal
          : "Weave is played in a server.",
      flags: [MessageFlags.Ephemeral],
    });
    return;
  }

  await interaction.deferUpdate();
  const board = await guessWeaveThread(
    playable.round,
    weavePlayerOf(interaction, interaction.member as GuildMember | null),
    interaction.fields.getTextInputValue("thread"),
  );
  if (interaction.guildId)
    refreshDailyPost(interaction.client, interaction.guildId);
  await interaction.editReply({ ...board, attachments: [] });
};
