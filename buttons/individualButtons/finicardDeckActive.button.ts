import type { ButtonHandler } from "../../types/handlers";
import { ButtonInteraction, MessageFlags } from "discord.js";
import {
  getDeck,
  getDecks,
  setActiveDeck,
} from "../../modules/finicards/decks";
import {
  DECK_ACTIVE_BUTTON,
  deckListMessage,
} from "../../modules/finicards/ui/deckList";

export const namespace = DECK_ACTIVE_BUTTON;

/**
 * Makes a deck from the deck list the active one - brought to battles,
 * practice and dungeons when no deck is named - and redraws the list.
 */
export const execute: ButtonHandler["execute"] = async (
  interaction: ButtonInteraction,
  args: string[],
) => {
  const [deckId, userId] = args;

  if (userId && userId !== interaction.user.id) {
    await interaction.reply({
      content: "❌ This button is not for you!",
      flags: [MessageFlags.Ephemeral],
    });
    return;
  }

  // Acknowledged before any work: a press has three seconds to be answered.
  await interaction.deferUpdate();

  const deck = await getDeck(deckId);
  if (!deck || deck.user_id !== interaction.user.id) {
    await interaction.followUp({
      content: "❌ That deck no longer exists.",
      flags: [MessageFlags.Ephemeral],
    });
    return;
  }

  await setActiveDeck(deck);
  await interaction.editReply(
    deckListMessage(
      await getDecks(deck.user_id, deck.server_id),
      interaction.user.id,
    ),
  );
};
