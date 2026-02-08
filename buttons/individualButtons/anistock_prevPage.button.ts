import { ButtonInteraction, MessageFlags } from "discord.js";
import {
  parsePaginationState,
  createPaginationRow,
} from "../../utilities/pagination/pagination";
import { buildAniStockQueryResultCards } from "../../modules/finistocks/buildAniStockQueryResultCards";
import { queryAnime } from "../../modules/finistocks/queryAnime";

export const namespace = "anistock_query_prev_page";

export async function execute(interaction: ButtonInteraction, args: string[]) {
  try {
    const { userId, currentPage, query } = parsePaginationState(args);

    // Fetch previous page
    const prevPage = currentPage - 1;
    const result = await queryAnime(query, { page: prevPage, perPage: 5 });

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
