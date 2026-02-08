import { ButtonInteraction, MessageFlags } from "discord.js";
import { buildAniStockQueryResultCards } from "../../modules/finistocks/buildAniStockQueryResultCards";
import { queryAnime } from "../../modules/finistocks/queryAnime";
import {
  parsePaginationState,
  createPaginationRow,
} from "../../utilities/pagination/pagination";
import { AnimeSortOptions } from "../../modules/finistocks/determineSort";

export const namespace = "anistock_query_next_page";

export async function execute(interaction: ButtonInteraction, args: string[]) {
  try {
    const { userId, currentPage, query, sort } = parsePaginationState(args);

    // Fetch next page
    const nextPage = currentPage + 1;
    const result = await queryAnime(
      query,
      { page: nextPage, perPage: 5 },
      sort as AnimeSortOptions,
    );

    // Build components
    const animeResultsComponents = buildAniStockQueryResultCards({
      QueryResults: result.items,
      UserId: userId,
    });

    const pageRow = createPaginationRow({
      userId,
      currentPage: result.currentPage,
      totalPages: result.totalPages,
      query,
      namespace: "anistock_query",
      sort,
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
