import type { ButtonHandler } from "../../types/handlers";
import { ButtonInteraction, GuildMember, MessageFlags } from "discord.js";
import { requireAdmin } from "../../utilities/discord/isAdmin";
import { REEL_BUTTON, guessModal } from "../../modules/dailies/reel/board";
import {
  REEL_LIVE,
  openReel,
  pickReel,
  playableReel,
  skipReel,
} from "../../modules/dailies/reel/daily";
import { weavePlayerOf } from "../../modules/dailies/weave/player";
import { dailyPlayed } from "../../modules/dailies/post";

export const namespace = REEL_BUTTON;

/**
 * Reel's buttons: `open` on the public post shows a player their go, privately;
 * on it, `guess` opens the box a guess is typed into, `skip` shows the next
 * frame, and `pick` is one of the films an unclear guess was offered as.
 */
export const execute: ButtonHandler["execute"] = async (
  interaction: ButtonInteraction,
  args: string[],
) => {
  const [roundId, action = "", movieId] = args;
  if (
    !REEL_LIVE &&
    !(await requireAdmin(interaction, "play Reel while it's on trial"))
  )
    return;
  if (!interaction.guildId) {
    await interaction.reply({
      content: "Reel is played in a server.",
      flags: [MessageFlags.Ephemeral],
    });
    return;
  }

  const playable = await playableReel(roundId);
  if ("refusal" in playable) {
    await interaction.reply({
      content: playable.refusal,
      flags: [MessageFlags.Ephemeral],
    });
    return;
  }

  if (action === "guess")
    return void (await interaction.showModal(guessModal(roundId)));

  const player = weavePlayerOf(
    interaction,
    interaction.member as GuildMember | null,
  );

  if (action === "open") {
    await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
    await interaction.editReply(await openReel(playable.round, player));
    return;
  }

  if (action === "pick" && movieId) {
    await interaction.deferUpdate();
    const { board, solve } = await pickReel(
      playable.round,
      player,
      Number(movieId),
    );
    dailyPlayed(
      interaction.client,
      interaction.guildId,
      solve && { game: "reel", name: player.displayName, ...solve },
    );
    await interaction.editReply(board);
    return;
  }

  if (action === "skip") {
    await interaction.deferUpdate();
    const { board } = await skipReel(playable.round, player);
    dailyPlayed(interaction.client, interaction.guildId);
    await interaction.editReply(board);
  }
};
