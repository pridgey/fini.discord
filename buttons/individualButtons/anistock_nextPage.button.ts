import { ButtonInteraction, MessageFlags } from "discord.js";
import { QueryHandler } from "../../queries/QueryHandler";
import {
  createPaginationRow,
  getPaginationContext,
  parsePaginationState,
  updatePaginationPage,
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
        ephemeral: true,
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

    // Fetch next page
    const nextPage = context.current_page + 1;

    const query = QueryHandler(context.query_id);
    const result = await query.query({
      queryString: context.query,
      page: nextPage,
      perPage: 5,
      sortOption: context.sort,
    });

    // Update context with new page
    await updatePaginationPage(contextId, nextPage);

    // Build components
    const resultComponents = await query.buildResults({
      items: result.items,
      userId: userId,
      queryString: context.query,
      sortOption: context.sort,
    });

    const pageRow = createPaginationRow({
      userId,
      currentPage: result.currentPage,
      totalPages: result.totalPages,
      contextId,
    });

    // Update the interaction
    await interaction.update({
      components: [...resultComponents, pageRow],
      flags: [MessageFlags.IsComponentsV2],
    });
  } catch (error) {
    console.error("Error handling query next page:", error, { args });
    await interaction.reply({
      content: "❌ Failed to load next page",
      flags: [MessageFlags.Ephemeral],
    });
  }
}
