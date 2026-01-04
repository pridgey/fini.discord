import { pb } from "../../utilities/pocketbase";
import { AnimeRecord, AnimeStockRecord } from "./stockData";

// Weight factors for initial pricing
const POPULARITY_WEIGHT = 0.4;
const MEMBERS_WEIGHT = 0.4;
const FAVORITES_WEIGHT = 0.2;
// Weight factors for ongoing price adjustments
const MAX_VOLATILITY = 0.8; // 10%
const MIN_VOLATILITY = 0.1; // 2%

/**
 * Takes the MAL popularity, members, and favorites of an anime and returns a normalized hype score between 0 and 1
 * The higher the score, the more hyped the anime is
 * Popularity is weighted negatively, while members and favorites are weighted positively
 */
export const getNormalizedScores = (
  popularity: number,
  members: number,
  favorites: number
) => {
  const normalizedPopularity = Math.max(
    0,
    Math.min(1, 1 - Math.log10(popularity) / 4)
  );
  const normalizedMembers = Math.max(
    0,
    Math.min(1, Math.log10(members / 1000) / 3.3)
  );
  const normalizedFavorites = Math.max(
    0,
    Math.min(1, Math.log10(Math.max(1, favorites)) / 5)
  );

  return {
    normalizedPopularity,
    normalizedMembers,
    normalizedFavorites,
  };
};

/**
 * Helper method to get just the hype score of an anime stock, representing the community's initial hype
 * The hype score ultimately helps determine the initial stock price
 */
export const getHypeScore = (
  popularity: number,
  members: number,
  favorites: number
): number => {
  const { normalizedFavorites, normalizedMembers, normalizedPopularity } =
    getNormalizedScores(popularity, members, favorites);

  const hypeScore =
    normalizedFavorites * FAVORITES_WEIGHT +
    normalizedMembers * MEMBERS_WEIGHT +
    normalizedPopularity * POPULARITY_WEIGHT;

  const roundedHypeScore = Math.round(hypeScore * 10000) / 10000;
  return roundedHypeScore;
};

/**
 * Calculates the new price of an anime as the rank and score change
 */
export const calculateStockPrice = (
  initialPrice: number,
  hypeScore: number,
  newScore: number,
  newRank: number
) => {
  const normalizedScore = Math.max(0, Math.min(1, (newScore - 5) / 4));
  const normalizedRank = Math.max(
    0,
    Math.min(1, 1 - Math.log10(newRank) / 4.2)
  );
  // Weight score more heavily than rank (70/30 split)
  const weightedPerformance = normalizedScore * 0.7 + normalizedRank * 0.3;

  // Calculate volatility - less hyped anime are more volatile
  const volatility =
    MAX_VOLATILITY - hypeScore * (MAX_VOLATILITY - MIN_VOLATILITY);

  // Performance delta determines how much the price should change
  const performanceDelta = weightedPerformance - hypeScore;

  // Determine the price change from the performance delta and volatility
  const changePercent = performanceDelta * volatility;
  const priceChange = Math.round(initialPrice * changePercent * 100) / 100;

  // New price is initial price plus the change
  const currentPrice = Math.round((initialPrice + priceChange) * 100) / 100;
  const priceChangePercent =
    Math.round((priceChange / initialPrice) * 100 * 100) / 100;

  return { currentPrice, priceChange, priceChangePercent };
};

/**
 * Determines the volatility rating of an anime stock based on its hype score
 */
export const getVolatilityRating = (
  hypeScore: number
): "low" | "medium" | "high" | "extreme" => {
  const volatility =
    MAX_VOLATILITY - hypeScore * (MAX_VOLATILITY - MIN_VOLATILITY);
  if (volatility < 0.2) return "low";
  if (volatility < 0.4) return "medium";
  if (volatility < 0.6) return "high";
  return "extreme";
};

/**
 * Queries the anime database for a specific anime or all anime if no query is provided
 * @param query The query string to search for
 * @returns A list of anime matching the query
 */
export const queryAnime = async (query?: string) => {
  // If no query, return all anime
  if (!query) {
    try {
      const allAnime = await pb
        .collection<AnimeRecord>("anistock_anime")
        .getFullList({
          perPage: 10,
          sort: "-created",
        });

      console.log("Queried all anime:", JSON.stringify(allAnime, null, 2));
      return allAnime;
    } catch (error) {
      console.error("Error querying all anime:", error);
      return [];
    }
  } else {
    // Determine if query is just number shaped
    const isNumberQuery = /^\d+$/.test(query);

    if (isNumberQuery) {
      // Query by mal_id
      try {
        const animeByMalId = await pb
          .collection<AnimeRecord>("anistock_anime")
          .getFullList({
            filter: `mal_id = ${Number(query)}`,
          });

        if (animeByMalId.length > 0) {
          console.log(
            "Queried anime by mal_id:",
            JSON.stringify(animeByMalId, null, 2)
          );
          return animeByMalId;
        }
      } catch (error) {
        console.error("Error querying anime by mal_id:", error);
      }
    } else {
      // Not number shaped, query by title
      try {
        const animeByTitle = await pb
          .collection<AnimeRecord>("anistock_anime")
          .getFullList({
            filter: query
              .split(/\s+/)
              .map((w) => `title ~ "${w}"`)
              .join(" || "),
          });

        if (animeByTitle.length > 0) {
          console.log(
            "Queried anime by title:",
            JSON.stringify(animeByTitle, null, 2)
          );
          return animeByTitle;
        }
      } catch (error) {
        console.error("Error querying anime by title:", error);
      }

      // If no results by title, try querying by database id
      try {
        const animeById = await pb
          .collection<AnimeRecord>("anistock_anime")
          .getFullList({
            filter: `id = "${query}"`,
          });

        if (animeById.length > 0) {
          console.log(
            "Queried anime by id:",
            JSON.stringify(animeById, null, 2)
          );
          return animeById;
        }
      } catch (error) {
        console.error("Error querying anime by id:", error);
      }
    }

    // If no results, return an empty array
    console.log("No anime found for query:", query);
    return [];
  }
};
