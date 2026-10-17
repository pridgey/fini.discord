import { ButtonInteraction, MessageFlags } from "discord.js";
import { buildDeckPages } from "../../modules/finicards/cardPages";
import { getDeck } from "../../modules/finicards/decks";

export const namespace = "v2_deck_show";

/**
 * Opens a deck from the deck list: the same pages `/finicard deck show`
 * gives, put in place of the list.
 */
export async function execute(interaction: ButtonInteraction, args: string[]) {
  try {
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

    const pages = await buildDeckPages(deck, {
      viewerId: interaction.user.id,
      binder: false,
    });
    if (!pages) {
      await interaction.followUp({
        content: `**${deck.name}** has no cards left in your collection. Add some with \`/finicard deck add\`.`,
        flags: [MessageFlags.Ephemeral],
      });
      return;
    }

    await interaction.editReply({ ...pages, attachments: [] });
  } catch (error) {
    console.error("Error opening a v2 deck:", error, { args });
    const failed = {
      content: "❌ Failed to open that deck",
      flags: [MessageFlags.Ephemeral] as [MessageFlags.Ephemeral],
    };
    if (interaction.replied || interaction.deferred)
      await interaction.followUp(failed).catch(() => undefined);
    else await interaction.reply(failed).catch(() => undefined);
  }
}
