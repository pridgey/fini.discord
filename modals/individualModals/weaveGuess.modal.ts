import { GuildMember, MessageFlags, ModalSubmitInteraction } from "discord.js";
import { requireAdmin } from "../../utilities/discord/isAdmin";
import { WEAVE_WORDS_MODAL } from "../../modules/dailies/weave/board";
import { WEAVE_LIVE, guessWeaveWords, playableWeave } from "../../modules/dailies/weave/daily";
import { weavePlayerOf } from "../../modules/dailies/weave/player";

export const namespace = WEAVE_WORDS_MODAL;

/** Words typed into a Weave board's "Guess words" box: judged, saved, paid, and the board redrawn. */
export async function execute(interaction: ModalSubmitInteraction, args: string[]) {
  const [roundId] = args;
  if (!WEAVE_LIVE && !(await requireAdmin(interaction, "play Weave while it's on trial"))) return;
  const playable = await playableWeave(roundId);
  if ("refusal" in playable || !interaction.guildId) {
    await interaction.reply({
      content: "refusal" in playable ? playable.refusal : "Weave is played in a server.",
      flags: [MessageFlags.Ephemeral],
    });
    return;
  }

  await interaction.deferUpdate();
  const board = await guessWeaveWords(
    interaction.client,
    playable.round,
    weavePlayerOf(interaction, interaction.member as GuildMember | null),
    interaction.fields.getTextInputValue("words"),
    interaction.channelId,
  );
  // A fresh image replaces the old one rather than piling up beside it.
  await interaction.editReply({ ...board, attachments: [] });
}
