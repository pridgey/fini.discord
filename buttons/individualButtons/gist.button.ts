import type { ButtonHandler } from "../../types/handlers";
import { ButtonInteraction, GuildMember, MessageFlags } from "discord.js";
import { requireAdmin } from "../../utilities/discord/isAdmin";
import { GIST_BUTTON, solveModal } from "../../modules/dailies/gist/board";
import {
  GIST_LIVE,
  giveUpGist,
  openGist,
  playableGist,
} from "../../modules/dailies/gist/daily";
import { weavePlayerOf } from "../../modules/dailies/weave/player";
import { dailyPlayed } from "../../modules/dailies/post";

export const namespace = GIST_BUTTON;

/**
 * Gist's buttons: `open` on the public post shows a player their board,
 * privately; on it, `solve` opens the box a solve is typed into, and
 * `give-up` ends the board and shows the phrase. Letters are called from the
 * board's dropdowns (`selects/individualSelects/gist.select.ts`).
 */
export const execute: ButtonHandler["execute"] = async (
  interaction: ButtonInteraction,
  args: string[],
) => {
  const [roundId, action = ""] = args;
  if (
    !GIST_LIVE &&
    !(await requireAdmin(interaction, "play Gist while it's on trial"))
  )
    return;
  if (!interaction.guildId) {
    await interaction.reply({
      content: "Gist is played in a server.",
      flags: [MessageFlags.Ephemeral],
    });
    return;
  }

  const playable = await playableGist(roundId);
  if ("refusal" in playable) {
    await interaction.reply({
      content: playable.refusal,
      flags: [MessageFlags.Ephemeral],
    });
    return;
  }

  if (action === "solve")
    return void (await interaction.showModal(
      solveModal(roundId, playable.round.category),
    ));

  const player = weavePlayerOf(
    interaction,
    interaction.member as GuildMember | null,
  );

  if (action === "open") {
    await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
    await interaction.editReply(await openGist(playable.round, player));
    return;
  }

  if (action === "give-up") {
    await interaction.deferUpdate();
    const { board } = await giveUpGist(playable.round, player);
    dailyPlayed(interaction.client, interaction.guildId);
    // A fresh image replaces the old one rather than piling up beside it.
    await interaction.editReply({ ...board, attachments: [] });
  }
};
