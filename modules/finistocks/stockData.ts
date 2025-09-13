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
  id?: string;
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
  hype_score: number;
  performance_score: number;
  created: string;
};

/**
 * Helper function to create a new initial stock entry for an anime
 */
export const createInitialStockEntry = async (animeData: AnimeRecord) => {
  try {
    const hypeScore = getHypeScore(
      animeData.initial_popularity,
      animeData.initial_members,
      animeData.initial_favorites
    );

    // Initial price calculation based on hype score
    // Lower hype scores get a quadratic reduction, higher hype scores get a square root boost (hype is < 1)
    const initialPrice =
      (hypeScore < 0.4 ? hypeScore ** 2 : Math.sqrt(hypeScore)) *
        (MAX_INITIAL_PRICE - BASE_PRICE) +
      BASE_PRICE;

    animeData.initial_hype_score = hypeScore;
    animeData.initial_stock_price = Math.round(initialPrice * 100) / 100;
    animeData.volatility_rating = getVolatilityRating(hypeScore);

    // Add anime to database for tracking initial offerings
    return await pb
      .collection<AnimeRecord>("anistock_anime")
      .create(animeData, {
        requestKey: `create-${animeData.mal_id}`,
      });
  } catch (err) {
    if (err instanceof ClientResponseError) {
      console.error("Pocketbase Error Data:", err.message, err.data);
    } else {
      console.error("Error creating initial stock entry:", err);
    }
  }
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

      // Get the relevant data from the response
      formattedData.push(
        ...json.data.map((upcomingAnime) => {
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
            initial_hype_score: 0, // To be calculated
            initial_stock_price: 0, // To be calculated
            volatility_rating: "low", // To be calculated
          };
        })
      );
    }

    // Insert upcoming anime into the database if they don't already exist
    for (const anime of formattedData) {
      // Add anime to database for tracking initial offerings
      await createInitialStockEntry(anime);
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
export const getOngoingAnimeStockData = async () => {
  try {
    const pagesToFetch = 4;

    for (let page = 1; page <= pagesToFetch; page++) {
      await new Promise((resolve) => setTimeout(resolve, 1000)); // Rate limit to 1 request per second
      const respond = await fetch(
        "https://api.jikan.moe/v4/seasons/now?page=" + page
      );

      if (!respond.ok) {
        console.error("Failed to fetch ongoing anime:", respond.statusText);
        return;
      }

      const json = await respond.json();
      console.log("-- Retrieved ongoing anime list");

      for (const ongoingAnime of json.data) {
        console.log(
          `-- Processing ${ongoingAnime.title}-${ongoingAnime.mal_id}`
        );
        const initialStockResponse = await pb
          .collection<AnimeRecord>("anistock_anime")
          .getFullList({
            filter: `mal_id = ${ongoingAnime.mal_id}`,
            requestKey: `fetch-${ongoingAnime.mal_id}`,
          });

        let initialStock = initialStockResponse?.at(0);

        if (!initialStock) {
          console.log(
            `-- Initial Stock record not found, creating new entry for ${ongoingAnime.title}-${ongoingAnime.mal_id}`
          );
          // If the anime doesn't exist in the database, create it
          initialStock =
            (await createInitialStockEntry({
              mal_id: ongoingAnime.mal_id,
              title:
                ongoingAnime.titles.filter((t) => t.type === "English")[0]
                  ?.title || ongoingAnime.title,
              image_url: ongoingAnime.images.webp.image_url,
              season: ongoingAnime.season,
              year: ongoingAnime.year,
              status: "ongoing",
              initial_popularity: ongoingAnime.popularity,
              initial_members: ongoingAnime.members,
              initial_favorites: ongoingAnime.favorites,
              initial_hype_score: 0, // To be calculated
              initial_stock_price: 0, // To be calculated
              volatility_rating: "low", // To be calculated
            })) ??
            ({
              mal_id: 0,
              title: "",
              image_url: "",
              season: "",
              year: 0,
              status: "ongoing",
              initial_popularity: 0,
              initial_members: 0,
              initial_favorites: 0,
              initial_hype_score: 0,
              initial_stock_price: 0,
              volatility_rating: "low",
            } as AnimeRecord);
          console.log("-- Created new initial stock entry");
        }

        // Calculate new hype score
        const hypeScore = getHypeScore(
          ongoingAnime.popularity,
          ongoingAnime.members,
          ongoingAnime.favorites
        );

        // Calculate latest price
        const latestPriceData = calculateStockPrice(
          initialStock.initial_stock_price,
          initialStock.initial_hype_score,
          hypeScore,
          ongoingAnime.rank
        );

        const latestStock = await pb
          .collection<AnimeStockRecord>("anistock_stock")
          .getFullList({
            filter: `anime = "${initialStock.id}"`,
            sort: "-created",
            perPage: 1,
            requestKey: `latest-${ongoingAnime.mal_id}`,
          });

        // If the latest stock price is the same as the last entry, skip creating a new entry
        if (
          latestStock.length > 0 &&
          latestStock[0].stock_price ===
            Math.round(latestPriceData.currentPrice * 100) / 100
        ) {
          // Create a new stock entry given the current pricing
          console.log(
            `-- Creating new stock price entry for ${ongoingAnime.title}-${ongoingAnime.mal_id} at $${latestPriceData.currentPrice}`
          );
          await pb.collection<AnimeStockRecord>("anistock_stock").create({
            anime: initialStock.id ?? "unknown anime",
            popularity: ongoingAnime.popularity,
            members: ongoingAnime.members,
            favorites: ongoingAnime.favorites,
            score: ongoingAnime.score ?? 0,
            rank: ongoingAnime.rank,
            stock_price: Math.round(latestPriceData.currentPrice * 100) / 100,
            hype_score: hypeScore,
            performance_score: 0, // To be calculated later1,
          });
        }
      }
    }
  } catch (err) {
    if (err instanceof ClientResponseError) {
      console.error("Pocketbase Error Data:", err.message);
    } else {
      console.error("Error fetching ongoing anime:", err);
    }
  }
};
