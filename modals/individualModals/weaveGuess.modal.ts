import type { ModalHandler } from "../../types/handlers";
import { GuildMember, MessageFlags, ModalSubmitInteraction } from "discord.js";
import { requireAdmin } from "../../utilities/discord/isAdmin";
import { WEAVE_WORDS_MODAL } from "../../modules/dailies/weave/board";
import {
  WEAVE_LIVE,
  guessWeaveWords,
  playableWeave,
} from "../../modules/dailies/weave/daily";
import { weavePlayerOf } from "../../modules/dailies/weave/player";
import { dailyPlayed } from "../../modules/dailies/post";

export const namespace = WEAVE_WORDS_MODAL;

/** Words typed into a Weave board's "Guess words" box: judged, saved, paid, and the board redrawn. */
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
  const player = weavePlayerOf(
    interaction,
    interaction.member as GuildMember | null,
  );
  const { board, solve } = await guessWeaveWords(
    playable.round,
    player,
    interaction.fields.getTextInputValue("words"),
  );
  if (interaction.guildId) {
    dailyPlayed(
      interaction.client,
      interaction.guildId,
      solve && { game: "weave", name: player.displayName, ...solve },
    );
  }
  // A fresh image replaces the old one rather than piling up beside it.
  await interaction.editReply({ ...board, attachments: [] });
};
