import { ClientResponseError } from "pocketbase";
import { pb } from "../../utilities/pocketbase";
import {
  calculateStockPrice,
  getHypeScore,
  getVolatilityRating,
} from "./utilities";

const BASE_PRICE = 10;
const MAX_INITIAL_PRICE = 300;

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

export type AnimeStockRecord = {
  anime: string;
  popularity: number;
  members: number;
  favorites: number;
  score: number;
  rank: number;
  stock_price: number;
  price_change: number;
  price_change_percent: number;
  hype_score: number;
  performance_score: number;
  created: string;
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

          // Initial price calculation based on hype score
          // Lower hype scores get a quadratic reduction, higher hype scores get a square root boost (hype is < 1)
          const initialPrice =
            (hypeScore < 0.4 ? hypeScore ** 2 : Math.sqrt(hypeScore)) *
              (MAX_INITIAL_PRICE - BASE_PRICE) +
            BASE_PRICE;

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

/**
 * Called by an interval polling function to get the latest stock data for ongoing anime
 */
// export const getOngoingAnimeStockData = async () => {
//   try {
//     const formattedData: AnimeStockRecord[] = [];

//     const pagesToFetch = 4;

//     for (let page = 1; page <= pagesToFetch; page++) {
//       await new Promise((resolve) => setTimeout(resolve, 1000)); // Rate limit to 1 request per second
//       const respond = await fetch(
//         "https://api.jikan.moe/v4/seasons/now?page=" + page
//       );

//       if (!respond.ok) {
//         console.error("Failed to fetch ongoing anime:", respond.statusText);
//         return;
//       }

//       const json = await respond.json();

//       formattedData.push(
//         ...json.data.map((ongoingAnime) => {
//           const hypeScore = getHypeScore(
//             ongoingAnime.popularity,
//             ongoingAnime.members,
//             ongoingAnime.favorites
//           );

//           // Calculate latest price
//           const latestPrice = calculateStockPrice();

//           return {
//             mal_id: ongoingAnime.mal_id,
//             title:
//               ongoingAnime.titles.filter((t) => t.type === "English")[0]
//                 ?.title || ongoingAnime.title,
//             image_url: ongoingAnime.images.webp.image_url,
//             season: ongoingAnime.season,
//             year: ongoingAnime.year,
//             status: "upcoming",
//             initial_popularity: ongoingAnime.popularity,
//             initial_members: ongoingAnime.members,
//             initial_favorites: ongoingAnime.favorites,
//             initial_hype_score: hypeScore,
//             initial_stock_price: Math.round(initialPrice * 100) / 100,
//             volatility_rating: getVolatilityRating(hypeScore),
//           };
//         })
//       );
//     }
//   } catch (err) {
//     if (err instanceof ClientResponseError) {
//       if (
//         (err.cause as any)?.data?.data["mal_id"]?.code !==
//         "validation_not_unique"
//       ) {
//         console.error("Pocketbase Error Data:", err.message);
//       }
//     } else {
//       console.error("Error fetching ongoing anime:", err);
//     }
//   }
// };
