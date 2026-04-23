import { buildAniStockQueryResultCards } from "../../modules/finistocks/buildAniStockQueryResultCards";
import {
  AnimeSortOptions,
  determineSortOption,
} from "../../modules/finistocks/determineSort";
import { AniStock_Detail } from "../../types/PocketbaseTables";
import {
  QueryFunction,
  QueryParams,
  ResultsBuilder,
} from "../../types/QueryTypes";
import { pb } from "../../utilities/pocketbase";

const buildAnimeDetailsResults = async ({
  items,
  userId,
  queryString,
  sortOption,
}: ResultsBuilder<AniStock_Detail>) => {
  const cards = await buildAniStockQueryResultCards({
    queryResults: items,
    userId: userId ?? "",
    query: queryString,
    sort: sortOption,
  });

  return {
    components: cards,
  };
};

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
  buildResults: buildAnimeDetailsResults,
};
