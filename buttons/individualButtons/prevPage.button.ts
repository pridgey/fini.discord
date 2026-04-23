import { ButtonInteraction, MessageFlags } from "discord.js";
import { buildAniStockQueryResultCards } from "../../modules/finistocks/buildAniStockQueryResultCards";
import { QueryHandler, QueryMap } from "../../queries/QueryHandler";
import {
  createPaginationRow,
  getPaginationContext,
  parsePaginationState,
  updatePaginationPage,
} from "../../utilities/pagination/pagination";

export const namespace = "prev_page";

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

    // Fetch previous page
    const prevPage = context.current_page - 1;

    const query = QueryHandler(context.query_id as keyof QueryMap);
    const result = await query.query({
      queryString: context.query,
      page: prevPage,
      perPage: context.per_page,
      sortOption: context.sort,
      filterOption: context.filter,
    });

    // Update context with new page
    await updatePaginationPage(contextId, prevPage);

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
    console.error("Error handling query previous page:", error, { args });
    await interaction.reply({
      content: "❌ Failed to load previous page",
      flags: [MessageFlags.Ephemeral],
    });
  }
}
