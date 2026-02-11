import { ButtonInteraction, MessageFlags } from "discord.js";
import { buildAniStockQueryResultCards } from "../../modules/finistocks/buildAniStockQueryResultCards";
import { queryAnime } from "../../modules/finistocks/queryAnime";
import {
  parsePaginationState,
  createPaginationRow,
  getPaginationContext,
  updatePaginationPage,
} from "../../utilities/pagination/pagination";
import { AnimeSortOptions } from "../../modules/finistocks/determineSort";

export const namespace = "anistock_query_next_page";

export async function execute(interaction: ButtonInteraction, args: string[]) {
  try {
    const { contextId, userId } = parsePaginationState(args);

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
    const result = await queryAnime(
      context.query,
      { page: nextPage, perPage: 5 },
      context.sort as AnimeSortOptions,
    );

    // Update context with new page
    await updatePaginationPage(contextId, nextPage);

    // Build components
    const animeResultsComponents = buildAniStockQueryResultCards({
      queryResults: result.items,
      userId: userId,
      query: context.query,
      sort: context.sort,
    });

    const pageRow = createPaginationRow({
      userId,
      currentPage: result.currentPage,
      totalPages: result.totalPages,
      namespace: "anistock_query",
      contextId,
    });

    // Update the interaction
    await interaction.update({
      components: [...animeResultsComponents, pageRow],
      flags: [MessageFlags.IsComponentsV2],
    });
  } catch (error) {
    console.error("Error handling anistock query next page:", error);
    await interaction.reply({
      content: "❌ Failed to load next page",
      flags: [MessageFlags.Ephemeral],
    });
  }
}
