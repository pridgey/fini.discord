import { ButtonInteraction, MessageFlags } from "discord.js";
import { QueryHandler, QueryMap } from "../../queries/QueryHandler";
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

    const query = QueryHandler(context.query_id as keyof QueryMap);
    const result = await query.query({
      queryString: context.query,
      page: nextPage,
      perPage: context.per_page,
      filterOption: context.filter,
      sortOption: context.sort,
    });

    // Update context with new page
    await updatePaginationPage(contextId, nextPage);

    // Build components
    const {
      components: resultComponents,
      files,
      useComponentsV2,
    } = await query.buildResults({
      items: result.items,
      userId: userId,
      queryString: context.query,
      sortOption: context.sort,
    });

    const pageRow = createPaginationRow({
      userId,
      currentPage: result.currentPage,
      totalPages: context.total_pages_override || result.totalPages,
      contextId,
      wrap: context.wrap,
    });

    // Update the interaction
    await interaction.update({
      components: [...(resultComponents ?? []), pageRow],
      files: files ?? [],
      ...(useComponentsV2 && {
        flags: [MessageFlags.IsComponentsV2],
      }),
    });
  } catch (error) {
    console.error("Error handling query next page:", error, { args });
    await interaction.reply({
      content: "❌ Failed to load next page",
      flags: [MessageFlags.Ephemeral],
    });
  }
}
