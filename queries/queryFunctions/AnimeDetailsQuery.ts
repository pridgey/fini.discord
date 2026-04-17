import { buildAniStockQueryResultCards } from "../../modules/finistocks/buildAniStockQueryResultCards";
import {
  AnimeSortOptions,
  determineSortOption,
} from "../../modules/finistocks/determineSort";
import { AniStock_Detail } from "../../types/PocketbaseTables";
import { QueryFunction, QueryParams } from "../../types/QueryTypes";
import { pb } from "../../utilities/pocketbase";

export const animeDetailsQuery: QueryFunction<AniStock_Detail> = {
  query: async ({
    queryString,
    page,
    perPage,
    sortOption,
    filterOption,
  }: QueryParams) => {
    const sortClause = determineSortOption(sortOption as AnimeSortOptions);

    // TODO: Build out filtering logic to actually include filters? ============================================================
    const filterClause = (() => {
      if (!queryString) return undefined;

      const isNumberQuery = /^\d+$/.test(queryString);

      if (isNumberQuery) {
        return `mal_id = ${queryString}`;
      } else {
        return `title ~ "${queryString}"`;
      }
      // Not gonna bother with database-id querying for now. Will likely make a separate query function for that
    })();

    console.log("Debug - Querying anime with params:", {
      queryString,
      page,
      perPage,
      sortOption,
      filterOption,
      sortClause,
      filterClause,
    });

    const result = await pb
      .collection<AniStock_Detail>("anistock_details")
      .getList(page, perPage, {
        sort: sortClause,
        filter: filterClause,
      });

    return {
      items: result.items,
      totalItems: result.totalItems,
      totalPages: result.totalPages,
      currentPage: result.page,
      perPage: result.perPage,
    };
  },
  id: "anistock_details",
  buildResults: async ({ items, userId, queryString, sortOption }) => {
    return await buildAniStockQueryResultCards({
      queryResults: items,
      userId,
      query: queryString,
      sort: sortOption,
    });
  },
};
