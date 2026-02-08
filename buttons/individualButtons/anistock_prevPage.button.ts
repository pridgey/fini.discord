import { ButtonInteraction, MessageFlags } from "discord.js";
import {
  parsePaginationState,
  createPaginationRow,
} from "../../utilities/pagination/pagination";
import { buildAniStockQueryResultCards } from "../../modules/finistocks/buildAniStockQueryResultCards";
import { queryAnime } from "../../modules/finistocks/queryAnime";
import { AnimeSortOptions } from "../../modules/finistocks/determineSort";

export const namespace = "anistock_query_prev_page";

export async function execute(interaction: ButtonInteraction, args: string[]) {
  try {
    const { userId, currentPage, query, sort } = parsePaginationState(args);

    // Fetch previous page
    const prevPage = currentPage - 1;
    const result = await queryAnime(
      query,
      { page: prevPage, perPage: 5 },
      sort as AnimeSortOptions,
    );

    const animeResultsComponents = buildAniStockQueryResultCards({
      queryResults: result.items,
      userId: userId,
      query,
      sort,
    });

    const pageRow = createPaginationRow({
      userId,
      currentPage: result.currentPage,
      totalPages: result.totalPages,
      query,
      namespace: "anistock_query",
      sort,
    });

    await interaction.update({
      components: [...animeResultsComponents, pageRow],
      flags: [MessageFlags.IsComponentsV2],
    });
  } catch (error) {
    console.error("Error handling anistock query prev page:", error);
    await interaction.reply({
      content: "❌ Failed to load previous page",
      flags: [MessageFlags.Ephemeral],
    });
  }
}
