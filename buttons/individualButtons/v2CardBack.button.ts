import { ButtonInteraction, MessageFlags } from "discord.js";
import {
  getPaginationContext,
  renderPaginationPage,
} from "../../utilities/pagination/pagination";

export const namespace = "v2_card_back";

/**
 * Returns from a card view to the collection page it was opened from.
 *
 * The page number lives in the pagination context, which `renderPaginationPage`
 * already keeps current on every turn - so "back" is just "render the page we
 * are already on" and there is no extra state to carry in the custom id.
 */
export async function execute(interaction: ButtonInteraction, args: string[]) {
  try {
    const [contextId, userId] = args;

    if (userId && userId !== interaction.user.id) {
      await interaction.reply({
        content: "❌ This button is not for you!",
        flags: [MessageFlags.Ephemeral],
      });
      return;
    }

    const context = await getPaginationContext(contextId);

    if (!context) {
      await interaction.reply({
        content:
          "❌ This collection session has expired. Run `/finicard-v2 collection` again.",
        flags: [MessageFlags.Ephemeral],
      });
      return;
    }

    const page = await renderPaginationPage({
      contextId,
      page: context.current_page,
    });

    if (!page) {
      await interaction.reply({
        content:
          "❌ This collection session has expired. Run `/finicard-v2 collection` again.",
        flags: [MessageFlags.Ephemeral],
      });
      return;
    }

    await interaction.update(page);
  } catch (error) {
    console.error("Error returning to v2 collection:", error, { args });
    await interaction.reply({
      content: "❌ Failed to reopen the collection",
      flags: [MessageFlags.Ephemeral],
    });
  }
}
