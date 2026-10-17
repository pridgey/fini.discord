import type { ButtonHandler } from "../../types/handlers";
import { ButtonInteraction, MessageFlags } from "discord.js";
import { requireAdmin } from "../../utilities/discord/isAdmin";
import {
  GEO_BUTTON,
  endRound,
  guessModal,
  revealMessage,
  roundFor,
  roundMessage,
  startRound,
} from "../../modules/dailies/geo/testRound";

export const namespace = GEO_BUTTON;

/** The `/geo-test` buttons: guess, try again, lock in, and a new round. */
export const execute: ButtonHandler["execute"] = async (
  interaction: ButtonInteraction,
  args: string[],
) => {
  if (!(await requireAdmin(interaction, "use the location game prototype")))
    return;
  const [action] = args;
  const userId = interaction.user.id;

  if (action === "guess" || action === "retry") {
    if (!roundFor(userId)) {
      await interaction.reply({
        content: "That test round is over. Start another with `/geo-test new`.",
        flags: [MessageFlags.Ephemeral],
      });
      return;
    }
    await interaction.showModal(
      guessModal(action === "guess" ? "new" : "edit"),
    );
    return;
  }

  if (action === "lock") {
    const current = roundFor(userId);
    if (!current?.pending) {
      await interaction.update({
        content: "That test round is over. Start another with `/geo-test new`.",
        components: [],
      });
      return;
    }
    await interaction.deferUpdate();
    const reveal = await revealMessage(
      current.round,
      current.place,
      current.pending,
    );
    endRound(userId);
    await interaction.editReply({ ...reveal, attachments: [] });
    return;
  }

  if (action === "new") {
    await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
    const round = await startRound(userId);
    await interaction.editReply(
      round
        ? roundMessage(round)
        : "Couldn't find any street photos after a few tries. Try again in a moment.",
    );
  }
};
