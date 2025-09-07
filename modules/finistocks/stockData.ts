import { ClientResponseError } from "pocketbase";
import { pb } from "../../utilities/pocketbase";
import { getHypeScore, getVolatilityRating } from "./utilities";

const BASE_PRICE = 10;
const MAX_INITIAL_PRICE = 500;

export type AnimeRecord = {
  mal_id: number;
  title: string;
  image_url: string;
  season: string;
  year: number;
  status: "upcoming" | "ongoing" | "finished";
  initial_popularity: number;
  initial_members: number;
  initial_favorites: number;
  initial_hype_score: number;
  initial_stock_price: number;
  volatility_rating: "low" | "medium" | "high" | "extreme";
};

/**
 * Called by a interval polling function to get the latest stock data for ongoing anime
 */
export const getUpcomingStockData = async () => {
  try {
    const formattedData: AnimeRecord[] = [];

    const pagesToFetch = 4;

    for (let page = 1; page <= pagesToFetch; page++) {
      await new Promise((resolve) => setTimeout(resolve, 1000)); // Rate limit to 1 request per second
      const respond = await fetch(
        "https://api.jikan.moe/v4/seasons/upcoming?page=" + page
      );

      if (!respond.ok) {
        console.error("Failed to fetch upcoming anime:", respond.statusText);
        return;
      }

      const json = await respond.json();

      formattedData.push(
        ...json.data.map((upcomingAnime) => {
          const hypeScore = getHypeScore(
            upcomingAnime.popularity,
            upcomingAnime.members,
            upcomingAnime.favorites
          );

          // Considering hypescore is between 0 and 1, calculate initial price using BASE_PRICE and MAX_INITIAL_PRICE
          // The higher the hypescore, the closer the price is to MAX_INITIAL_PRICE, exponentially
          const initialPrice =
            Math.pow(hypeScore, 0.75) * (MAX_INITIAL_PRICE - BASE_PRICE) +
            BASE_PRICE;

          // (hypeScore > 0.4 ? hypeScore : Math.pow(hypeScore, 0.75)) *
          //   (MAX_INITIAL_PRICE - BASE_PRICE) +
          // BASE_PRICE;

          return {
            mal_id: upcomingAnime.mal_id,
            title:
              upcomingAnime.titles.filter((t) => t.type === "English")[0]
                ?.title || upcomingAnime.title,
            image_url: upcomingAnime.images.webp.image_url,
            season: upcomingAnime.season,
            year: upcomingAnime.year,
            status: "upcoming",
            initial_popularity: upcomingAnime.popularity,
            initial_members: upcomingAnime.members,
            initial_favorites: upcomingAnime.favorites,
            initial_hype_score: hypeScore,
            initial_stock_price: Math.round(initialPrice * 100) / 100,
            volatility_rating: getVolatilityRating(hypeScore),
          };
        })
      );
    }

    // Insert upcoming anime into the database if they don't already exist
    for (const anime of formattedData) {
      // Add anime to database for tracking initial offerings
      await pb.collection("anistock_anime").create(
        {
          ...anime,
        },
        {
          requestKey: `create-${anime.mal_id}`,
        }
      );
    }
  } catch (err) {
    if (err instanceof ClientResponseError) {
      if (
        (err.cause as any)?.data?.data["mal_id"]?.code !==
        "validation_not_unique"
      ) {
        console.error("Pocketbase Error Data:", err.message);
      }
    } else {
      console.error("Error fetching upcoming anime:", err);
    }
  }
};
