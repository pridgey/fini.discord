import { pb } from "../../utilities/pocketbase";
import {
  PaginationParams,
  PaginatedResult,
} from "../../utilities/pagination/pagination";
import { AnimeRecord } from "./stockData";
import { AnimeSortOptions, determineSortOption } from "./determineSort";

/**
 * Queries the anime database for a specific anime or all anime if no query is provided
 * @param query The query string to search for
 * @param pagination Pagination parameters for paginated results
 * @returns A list of anime matching the query
 */
export const queryAnime = async (
  query?: string,
  pagination: PaginationParams = {},
  sort?: AnimeSortOptions,
): Promise<PaginatedResult<AnimeRecord>> => {
  // Grab, or default, pagination parameters
  const { page = 1, perPage = 5 } = pagination;

  const sortOption = determineSortOption(sort);

  // If no query, return all anime
  if (!query) {
    try {
      const result = await pb
        .collection<AnimeRecord>("anistock_anime")
        .getList(page, perPage, {
          sort: sortOption,
        });

      return {
        items: result.items,
        totalItems: result.totalItems,
        totalPages: result.totalPages,
        currentPage: result.page,
        perPage: result.perPage,
      };
    } catch (error) {
      console.error("Error querying all anime:", error);
      return {
        items: [],
        totalItems: 0,
        totalPages: 0,
        currentPage: 1,
        perPage,
      };
    }
  } else {
    // Determine if query is just number shaped
    const isNumberQuery = /^\d+$/.test(query);

    if (isNumberQuery) {
      // Query by mal_id
      try {
        const animeByMalId = await pb
          .collection<AnimeRecord>("anistock_anime")
          .getList(page, perPage, {
            filter: `mal_id = ${Number(query)}`,
          });

        if (animeByMalId.items.length > 0) {
          console.log(
            "Queried anime by mal_id:",
            JSON.stringify(animeByMalId, null, 2),
          );

          return {
            items: animeByMalId.items,
            totalItems: animeByMalId.totalItems,
            totalPages: animeByMalId.totalPages,
            currentPage: animeByMalId.page,
            perPage: animeByMalId.perPage,
          };
        }
      } catch (error) {
        console.error("Error querying anime by mal_id:", error);
      }
    } else {
      // Not number shaped, query by title
      try {
        const animeByTitle = await pb
          .collection<AnimeRecord>("anistock_anime")
          .getList(page, perPage, {
            filter: query
              .split(/\s+/)
              .map((w) => `title ~ "${w}"`)
              .join(" || "),
            sort: sortOption,
          });

        if (animeByTitle.items.length > 0) {
          console.log(
            "Queried anime by title:",
            JSON.stringify(animeByTitle, null, 2),
          );

          return {
            items: animeByTitle.items,
            totalItems: animeByTitle.totalItems,
            totalPages: animeByTitle.totalPages,
            currentPage: animeByTitle.page,
            perPage: animeByTitle.perPage,
          };
        }
      } catch (error) {
        console.error("Error querying anime by title:", error);
      }

      // If no results by title, try querying by database id
      try {
        const animeById = await pb
          .collection<AnimeRecord>("anistock_anime")
          .getList(page, perPage, {
            filter: `id = "${query}"`,
          });

        if (animeById.items.length > 0) {
          console.log(
            "Queried anime by id:",
            JSON.stringify(animeById, null, 2),
          );

          return {
            items: animeById.items,
            totalItems: animeById.totalItems,
            totalPages: animeById.totalPages,
            currentPage: animeById.page,
            perPage: animeById.perPage,
          };
        }
      } catch (error) {
        console.error("Error querying anime by id:", error);
      }
    }

    // If no results, return an empty array
    console.log("No anime found for query:", query);
    return {
      items: [],
      totalItems: 0,
      totalPages: 0,
      currentPage: 1,
      perPage,
    };
  }
};
