import type { ModalHandler } from "../../types/handlers";
import { MessageFlags, ModalSubmitInteraction } from "discord.js";
import {
  DAILY_MODAL,
  cannotGuess,
  dailyGuessView,
  holdDailyGuess,
} from "../../modules/dailies/geo/daily";
import { getRoundById } from "../../modules/dailies/geo/dailyStore";
import { geocodeGuess } from "../../modules/dailies/geo/geocode";

export const namespace = DAILY_MODAL;

/**
 * A typed guess at the daily. A first guess gets a private message of its own,
 * with a map to check before locking in; "Try again" replaces it.
 */
export const execute: ModalHandler["execute"] = async (
  interaction: ModalSubmitInteraction,
  args: string[],
) => {
  const [roundId, mode] = args;
  const serverId = interaction.guildId ?? "";
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

  const refusal = await cannotGuess(
    await getRoundById(roundId),
    serverId,
    interaction.user.id,
  );
  if (refusal) {
    await say(refusal);
    return;
  }

  const guess = await geocodeGuess(
    interaction.fields.getTextInputValue("place"),
  ).catch(() => undefined);
  if (guess === undefined) {
    await say(
      "The place search didn't answer. Try again in a moment with the button on the round.",
    );
    return;
  }
  if (!guess) {
    await say(
      "I couldn't find that place. Try a bigger place nearby, or paste coordinates.",
    );
    return;
  }

  holdDailyGuess(roundId, serverId, interaction.user.id, guess);
  await interaction.editReply({
    ...(await dailyGuessView(roundId, guess)),
    attachments: [],
  });
};
