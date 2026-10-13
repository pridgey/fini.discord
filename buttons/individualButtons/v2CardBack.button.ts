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

    // Acknowledged before any work: a press has three seconds to be answered,
    // and a slow lookup or upload must not show as "interaction failed".
    await interaction.deferUpdate();

    const context = await getPaginationContext(contextId);

    if (!context) {
      await interaction.followUp({
        content:
          "❌ This collection session has expired. Run `/finicard collection` again.",
        flags: [MessageFlags.Ephemeral],
      });
      return;
    }

    const page = await renderPaginationPage({
      contextId,
      page: context.current_page,
    });

    if (!page) {
      await interaction.followUp({
        content:
          "❌ This collection session has expired. Run `/finicard collection` again.",
        flags: [MessageFlags.Ephemeral],
      });
      return;
    }

    await interaction.editReply(page);
  } catch (error) {
    console.error("Error returning to v2 collection:", error, { args });
    const failed = { content: "❌ Failed to reopen the collection", flags: [MessageFlags.Ephemeral] as [MessageFlags.Ephemeral] };
    if (interaction.replied || interaction.deferred) await interaction.followUp(failed).catch(() => undefined);
    else await interaction.reply(failed).catch(() => undefined);
  }
}
