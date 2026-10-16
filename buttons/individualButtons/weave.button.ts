import { ButtonInteraction, GuildMember, MessageFlags } from "discord.js";
import { requireAdmin } from "../../utilities/discord/isAdmin";
import { WEAVE_BUTTON, threadModal, wordsModal } from "../../modules/dailies/weave/board";
import {
  WEAVE_LIVE,
  hintWeave,
  openWeave,
  playableWeave,
  type WeavePlayer,
} from "../../modules/dailies/weave/daily";

export const namespace = WEAVE_BUTTON;

/**
 * Weave's buttons: `open` on the public post shows a player their board,
 * privately; on the board, `words` and `thread` open the box a guess is typed
 * into, and `hint` lights the next word's first letter.
 */
export async function execute(interaction: ButtonInteraction, args: string[]) {
  const [roundId, action = ""] = args;
  if (!WEAVE_LIVE && !(await requireAdmin(interaction, "play Weave while it's on trial"))) return;
  if (!interaction.guildId) {
    await interaction.reply({ content: "Weave is played in a server.", flags: [MessageFlags.Ephemeral] });
    return;
  }

  const playable = await playableWeave(roundId);
  if ("refusal" in playable) {
    await interaction.reply({ content: playable.refusal, flags: [MessageFlags.Ephemeral] });
    return;
  }

  if (action === "words") return void (await interaction.showModal(wordsModal(roundId)));
  if (action === "thread") return void (await interaction.showModal(threadModal(roundId)));

  const player: WeavePlayer = {
    serverId: interaction.guildId,
    serverName: interaction.guild?.name ?? "unknown guild name",
    userId: interaction.user.id,
    username: interaction.user.username,
    displayName: (interaction.member as GuildMember | null)?.displayName ?? interaction.user.displayName,
  };

  if (action === "open") {
    await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
    await interaction.editReply(await openWeave(playable.round, player));
    return;
  }

  if (action === "hint") {
    await interaction.deferUpdate();
    // A fresh image replaces the old one rather than piling up beside it.
    await interaction.editReply({ ...(await hintWeave(interaction.client, playable.round, player)), attachments: [] });
  }
}
