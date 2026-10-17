import { MessageFlags, ModalSubmitInteraction } from "discord.js";
import { requireAdmin } from "../../utilities/discord/isAdmin";
import { geocodeGuess } from "../../modules/dailies/geo/geocode";
import {
  GEO_MODAL,
  guessMessage,
  holdGuess,
  roundFor,
} from "../../modules/dailies/geo/testRound";

export const namespace = GEO_MODAL;

/**
 * A typed `/geo-test` guess. A first guess gets a message of its own, below the
 * photos; "Try again" replaces the guess on screen.
 */
export async function execute(
  interaction: ModalSubmitInteraction,
  args: string[],
) {
  if (!(await requireAdmin(interaction, "use the location game prototype")))
    return;
  const [mode] = args;
  const replacing = mode === "edit" && interaction.isFromMessage();

  if (replacing) await interaction.deferUpdate();
  else await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

  const say = (content: string) =>
    interaction.editReply({
      content,
      files: [],
      attachments: [],
      components: [],
    });

  if (!roundFor(interaction.user.id)) {
    await say("That test round is over. Start another with `/geo-test new`.");
    return;
  }

  const guess = await geocodeGuess(
    interaction.fields.getTextInputValue("place"),
  ).catch(() => undefined);
  if (guess === undefined) {
    await say(
      "The place search didn't answer. Try again in a moment with `/geo-test guess`.",
    );
    return;
  }
  if (!guess) {
    await say(
      "I couldn't find that place. Try a bigger place nearby, or paste coordinates, with `/geo-test guess`.",
    );
    return;
  }

  holdGuess(interaction.user.id, guess);
  await interaction.editReply({
    ...(await guessMessage(guess)),
    attachments: [],
  });
}
