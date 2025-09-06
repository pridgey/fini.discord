import { pb } from "../../utilities/pocketbase";
import { getHypeScore, getVolatilityRating } from "./utilities";

/**
 * Called by a interval polling function to get the latest stock data for ongoing anime
 */
export const getUpcomingStockData = async () => {
  const respond = await fetch("https://api.jikan.moe/v4/seasons/upcoming");
  const json = await respond.json();

  const formattedData = json.data.map((upcomingAnime) => {
    const hypeScore = getHypeScore(
      upcomingAnime.popularity,
      upcomingAnime.members,
      upcomingAnime.favorites
    );

    return {
      mal_id: upcomingAnime.mal_id,
      title:
        upcomingAnime.titles.filter((t) => t.type === "English")[0]?.title ||
        upcomingAnime.title,
      image_url: upcomingAnime.images.webp.image_url,
      season: upcomingAnime.season,
      year: upcomingAnime.year,
      status: "upcoming",
      initial_popularity: upcomingAnime.popularity,
      initial_members: upcomingAnime.members,
      initial_favorites: upcomingAnime.favorites,
      initial_hype_score: hypeScore,
      initial_stock_price: Math.round(hypeScore * 100) / 100 || 0.01,
      volatility_rating: getVolatilityRating(hypeScore),
    };
  });

  // Insert upcoming anime into the database if they don't already exist
  for (const anime of formattedData) {
    // Create small timeout to prevent rate limiting
    await new Promise((resolve) => setTimeout(resolve, 2000));
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
};
