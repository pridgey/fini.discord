import { ButtonInteraction, MessageFlags } from "discord.js";
import {
  getPaginationContext,
  parsePaginationState,
  renderPaginationPage,
  stepPage,
} from "../../utilities/pagination/pagination";

export const namespace = "next_page";

/*
  Generic button handler for pagination
*/
export async function execute(interaction: ButtonInteraction, args: string[]) {
  try {
    const { contextId, userId } = parsePaginationState(args);

    if (userId && userId !== interaction.user.id) {
      await interaction.reply({
        content: "❌ This button is not for you!",
        flags: [MessageFlags.Ephemeral],
      });
      return;
    }

    // Retrieve pagination context from database
    const context = await getPaginationContext(contextId);

    if (!context) {
      await interaction.reply({
        content: "❌ This pagination session has expired. Please search again.",
        flags: [MessageFlags.Ephemeral],
      });
      return;
    }

    const page = await renderPaginationPage({
      contextId,
      page: stepPage(context.current_page, 1, {
        totalPages: context.total_pages_override,
        wrap: context.wrap,
      }),
    });

    if (!page) {
      await interaction.reply({
        content: "❌ This pagination session has expired. Please search again.",
        flags: [MessageFlags.Ephemeral],
      });
      return;
    }

    await interaction.update(page);
  } catch (error) {
    console.error("Error handling query next page:", error, { args });
    await interaction.reply({
      content: "❌ Failed to load next page",
      flags: [MessageFlags.Ephemeral],
    });
  }
}
