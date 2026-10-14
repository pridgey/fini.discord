import { ClientResponseError } from "pocketbase";
import { pb } from "../../utilities/pocketbase";
import {
  calculateStockPrice,
  getHypeScore,
  getVolatilityRating,
} from "./utilities";

const BASE_PRICE = 10;
const MAX_INITIAL_PRICE = 300;

const JIKAN_URL = "https://api.jikan.moe/v4";
// Jikan allows 3 requests a second and 60 a minute; one a second stays well clear.
// Retries wait backoffMs, doubling each time, unless Jikan sends a Retry-After.
// Exported so tests can shorten the waits.
export const jikanTiming = { spacingMs: 1000, backoffMs: 2000, attempts: 5 };
// A safety cap only - a season is read until Jikan says there is no next page
const MAX_SEASON_PAGES = 30;
// Unfinished anime the season lists missed, looked up one by one each run
const MAX_STALE_REFRESHES = 150;

// ============================================================================
// Jikan API Types
// ============================================================================

interface JikanPagination {
  last_visible_page: number;
  has_next_page: boolean;
  current_page: number;
  items: {
    count: number;
    total: number;
    per_page: number;
  };
}

interface JikanTitle {
  type: "Default" | "Synonym" | "Japanese" | "English";
  title: string;
}

interface JikanImage {
  image_url: string;
  small_image_url: string;
  large_image_url: string;
}

interface JikanImages {
  jpg: JikanImage;
  webp: JikanImage;
}

interface JikanNamedEntity {
  mal_id: number;
  type: string;
  name: string;
  url: string;
}

interface JikanBroadcast {
  day: string;
  time: string;
  timezone: string;
  string: string;
}

interface JikanAired {
  from: string;
  to: string;
  prop: {
    from: {
      day: number;
      month: number;
      year: number;
    };
    to: {
      day: number;
      month: number;
      year: number;
    };
  };
  string: string;
}

interface JikanAnime {
  mal_id: number;
  url: string;
  images: JikanImages;
  trailer: {
    youtube_id: string | null;
    url: string | null;
    embed_url: string | null;
    images: {
      image_url: string | null;
      small_image_url: string | null;
      medium_image_url: string | null;
      large_image_url: string | null;
      maximum_image_url: string | null;
    };
  };
  approved: boolean;
  titles: JikanTitle[];
  title: string;
  title_english: string | null;
  title_japanese: string | null;
  title_synonyms: string[];
  type: string;
  source: string;
  episodes: number | null;
  status: string;
  airing: boolean;
  aired: JikanAired;
  duration: string;
  rating: string;
  score: number | null;
  scored_by: number | null;
  rank: number | null;
  popularity: number;
  members: number;
  favorites: number;
  synopsis: string | null;
  background: string;
  season: "winter" | "spring" | "summer" | "fall" | null;
  year: number | null;
  broadcast: JikanBroadcast | null;
  producers: JikanNamedEntity[];
  licensors: JikanNamedEntity[];
  studios: JikanNamedEntity[];
  genres: JikanNamedEntity[];
  explicit_genres: JikanNamedEntity[];
  themes: JikanNamedEntity[];
  demographics: JikanNamedEntity[];
}

interface JikanSeasonResponse {
  pagination: JikanPagination;
  data: JikanAnime[];
}

interface JikanAnimeResponse {
  data: JikanAnime;
}

// ============================================================================
// Database Types
// ============================================================================

export type AnimeRecord = {
  id?: string;
  mal_id: number;
  title: string;
  image_url: string;
  synopsis: string;
  season: string;
  year: number;
  status: "upcoming" | "ongoing" | "finished";
  initial_popularity: number;
  initial_members: number;
  initial_favorites: number;
  initial_hype_score: number;
  initial_stock_price: number;
  volatility_rating: "low" | "medium" | "high" | "extreme";
  updated?: string;
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

type Season = "winter" | "spring" | "summer" | "fall";

interface SeasonConfig {
  year: number;
  season: Season;
}

// ============================================================================
// Helper Functions
// ============================================================================

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

let lastJikanRequest = 0;

/**
 * Fetches from Jikan, spacing requests out and backing off on 429s, 5xx errors
 * and network failures. Returns null once it gives up, or for any other error.
 */
export async function jikanFetch<T>(path: string): Promise<T | null> {
  const { spacingMs, backoffMs, attempts } = jikanTiming;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const wait = lastJikanRequest + spacingMs - Date.now();
    if (wait > 0) await sleep(wait);
    lastJikanRequest = Date.now();

    const response = await fetch(`${JIKAN_URL}${path}`).catch(() => null);
    if (response?.ok) return (await response.json()) as T;

    const retryable =
      !response || response.status === 429 || response.status >= 500;
    if (!retryable || attempt === attempts) {
      console.error(
        `❌ Jikan ${path} failed after ${attempt} attempt(s):`,
        response ? `${response.status} ${response.statusText}` : "no response",
      );
      return null;
    }

    // Jikan's Retry-After when it sends one, otherwise 2s, 4s, 8s, 16s, with jitter
    const retryAfter = Number(response?.headers.get("retry-after"));
    const backoff =
      retryAfter > 0 ? retryAfter * 1000 : backoffMs * 2 ** (attempt - 1);
    console.warn(
      `   ⏳ Jikan ${path}: ${response?.status ?? "no response"}, retrying in ${Math.round(backoff / 1000)}s`,
    );
    await sleep(backoff + Math.random() * backoffMs * 0.25);
  }
  return null;
}

/**
 * Gets the current season based on the current month
 */
function getCurrentSeason(): Season {
  const month = new Date().getMonth(); // 0-11

  if (month >= 0 && month <= 2) return "winter"; // Jan-Mar
  if (month >= 3 && month <= 5) return "spring"; // Apr-Jun
  if (month >= 6 && month <= 8) return "summer"; // Jul-Sep
  return "fall"; // Oct-Dec
}

/**
 * Generates a list of seasons to sync based on current date.
 * Goes back a configurable number of seasons and optionally looks ahead.
 */
function getSeasonsToSync(
  seasonsBack: number = 4,
  seasonsFuture: number = 4,
): SeasonConfig[] {
  const currentYear = new Date().getFullYear();
  const currentSeason = getCurrentSeason();
  const seasonOrder: Season[] = ["winter", "spring", "summer", "fall"];
  const currentSeasonIndex = seasonOrder.indexOf(currentSeason);

  const seasons: SeasonConfig[] = [];

  // Add future seasons (next year's worth of anime)
  for (let i = 1; i <= seasonsFuture; i++) {
    const futureSeasonIndex = (currentSeasonIndex + i) % 4;
    const yearOffset = Math.floor((currentSeasonIndex + i) / 4);

    const season = seasonOrder[futureSeasonIndex];
    const year = currentYear + yearOffset;

    seasons.push({ year, season });
  }

  // Add current + past seasons
  for (let i = 0; i <= seasonsBack; i++) {
    // Calculate which season and year this offset represents
    const offsetSeasonIndex = (currentSeasonIndex - i + 12) % 4;
    const yearOffset = Math.floor((currentSeasonIndex - i) / 4);

    const season = seasonOrder[offsetSeasonIndex];
    const year = currentYear + yearOffset;

    seasons.push({ year, season });
  }

  return seasons;
}
/**
 * Main function to sync all seasons and update stock prices.
 * Runs twice daily (midnight and noon).
 */
export const syncAllSeasons = async () => {
  const startTime = Date.now();
  console.log("🚀 Starting seasonal anime sync...");

  // Get seasons to sync (current season + 4 seasons back + 4 future seasons = ~1.5 years)
  const seasons = getSeasonsToSync(4, 4);

  console.log("📅 Syncing seasons:");
  seasons.forEach((s) => console.log(`   - ${s.year} ${s.season}`));

  let totalSynced = 0;
  let totalNew = 0;
  let totalUpdated = 0;

  for (const config of seasons) {
    const result = await syncSeason(config);
    totalSynced += result.synced;
    totalNew += result.newAnime;
    totalUpdated += result.updated;
  }

  // Anime the season lists no longer carry - delayed to TBA, moved outside the
  // window, or simply missing - would otherwise never be updated again
  const refreshed = await refreshStaleAnime(new Date(startTime));

  const duration = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log(`✅ Seasonal sync complete in ${duration}s`);
  console.log(`   Total: ${totalSynced} anime synced`);
  console.log(`   New: ${totalNew} | Updated: ${totalUpdated}`);
  console.log(`   Refreshed outside the season lists: ${refreshed}`);
};

/**
 * Syncs a single season and updates stock prices for all anime in that season
 */
async function syncSeason(config: SeasonConfig): Promise<{
  synced: number;
  newAnime: number;
  updated: number;
}> {
  const { year, season } = config;
  const seasonStartTime = Date.now();
  console.log(`📡 Syncing ${year} ${season}...`);

  let page = 1;
  let synced = 0;
  let newAnime = 0;
  let updated = 0;

  while (page <= MAX_SEASON_PAGES) {
    try {
      const json = await jikanFetch<JikanSeasonResponse>(
        `/seasons/${year}/${season}?page=${page}`,
      );

      if (!json) {
        console.error(`❌ Giving up on ${year} ${season} at page ${page}`);
        break;
      }

      if (!json.data?.length) {
        console.log(`   No more data for ${year} ${season}`);
        break;
      }

      // Process each anime in this page
      for (const animeData of json.data) {
        const result = await upsertAnimeAndUpdateStock(animeData, year, season);

        if (result.isNew) {
          newAnime++;
        } else {
          updated++;
        }
        synced++;
      }

      // Check if there's a next page
      if (!json.pagination?.has_next_page) {
        break;
      }

      page++;
    } catch (err) {
      console.error(`❌ Error syncing ${year} ${season} page ${page}:`, err);
      break;
    }
  }

  const seasonDuration = ((Date.now() - seasonStartTime) / 1000).toFixed(2);
  console.log(
    `✅ ${year} ${season}: ${synced} synced (${newAnime} new, ${updated} updated) in ${seasonDuration}s`,
  );

  return { synced, newAnime, updated };
}

/**
 * Looks up, one by one, unfinished anime that the season sync did not touch.
 * Held anime go first, then the longest-untouched, up to MAX_STALE_REFRESHES.
 */
async function refreshStaleAnime(since: Date): Promise<number> {
  let stale: AnimeRecord[];
  let held: Set<string>;
  try {
    stale = await pb.collection<AnimeRecord>("anistock_anime").getFullList({
      filter: pb.filter('status != "finished" && updated < {:since}', {
        since,
      }),
      sort: "updated",
    });
    const holdings = await pb
      .collection<{ anime: string }>("anistock_holdings")
      .getFullList({ filter: "shares_owned > 0", fields: "anime" });
    held = new Set(holdings.map((holding) => holding.anime));
  } catch (err) {
    console.error("❌ Could not list stale anime:", err);
    return 0;
  }

  const queue = [
    ...stale.filter((anime) => held.has(anime.id!)),
    ...stale.filter((anime) => !held.has(anime.id!)),
  ].slice(0, MAX_STALE_REFRESHES);

  console.log(
    `📡 Refreshing ${queue.length} of ${stale.length} stale anime directly...`,
  );

  let refreshed = 0;
  for (const anime of queue) {
    const json = await jikanFetch<JikanAnimeResponse>(`/anime/${anime.mal_id}`);
    if (!json?.data) continue;

    // A delayed anime with no date yet has no season; it keeps its last one
    await upsertAnimeAndUpdateStock(
      json.data,
      json.data.year ?? anime.year,
      json.data.season ?? anime.season,
    );
    refreshed++;
  }

  return refreshed;
}

/**
 * Upserts an anime record and creates a new stock price entry
 */
async function upsertAnimeAndUpdateStock(
  apiData: JikanAnime,
  year: number,
  season: string,
): Promise<{ isNew: boolean; record: AnimeRecord }> {
  try {
    // Check if anime already exists
    const existing = await pb
      .collection<AnimeRecord>("anistock_anime")
      .getFirstListItem(`mal_id = ${apiData.mal_id}`, {
        requestKey: `fetch-${apiData.mal_id}`,
      })
      .catch(() => null);

    let animeRecord: AnimeRecord;
    let isNew = false;

    const title =
      apiData.titles?.find((t) => t.type === "English")?.title || apiData.title;

    if (existing) {
      // Update existing record with fresh data
      animeRecord = await pb
        .collection<AnimeRecord>("anistock_anime")
        .update(existing.id!, {
          title,
          image_url: apiData.images?.webp?.image_url || existing.image_url,
          synopsis: apiData.synopsis || existing.synopsis,
          season,
          year,
          status: determineStatus(apiData),
        });
    } else {
      // Create new anime record
      const hypeScore = getHypeScore(
        apiData.popularity,
        apiData.members,
        apiData.favorites,
      );

      const initialPrice = calculateInitialPrice(hypeScore);

      animeRecord = await pb.collection<AnimeRecord>("anistock_anime").create(
        {
          mal_id: apiData.mal_id,
          title,
          image_url: apiData.images?.webp?.image_url || "",
          synopsis: apiData.synopsis || "",
          season,
          year,
          status: determineStatus(apiData),
          initial_popularity: apiData.popularity || 0,
          initial_members: apiData.members || 0,
          initial_favorites: apiData.favorites || 0,
          initial_hype_score: hypeScore,
          initial_stock_price: initialPrice,
          volatility_rating: getVolatilityRating(hypeScore),
        },
        {
          requestKey: `create-${apiData.mal_id}`,
        },
      );

      isNew = true;
      console.log(
        `   ✨ New anime: ${title} (${apiData.mal_id}) - $${initialPrice}`,
      );
    }

    // Calculate current stock price and create stock entry
    await createStockEntry(animeRecord, apiData);

    return { isNew, record: animeRecord };
  } catch (err) {
    if (err instanceof ClientResponseError) {
      // Ignore duplicate errors (race condition between checks)
      if (err.data?.data?.mal_id?.code !== "validation_not_unique") {
        console.error(`Error upserting anime ${apiData.mal_id}:`, err.message);
      }
    } else {
      console.error(`Error upserting anime ${apiData.mal_id}:`, err);
    }

    // Return a default response to continue processing
    return {
      isNew: false,
      record: {
        mal_id: apiData.mal_id,
        title: apiData.title,
        image_url: "",
        synopsis: "",
        season: "",
        year: 0,
        status: "ongoing",
        initial_popularity: 0,
        initial_members: 0,
        initial_favorites: 0,
        initial_hype_score: 0,
        initial_stock_price: 0,
        volatility_rating: "low",
      },
    };
  }
}

/**
 * Creates a new stock price entry if the price has changed
 */
async function createStockEntry(
  animeRecord: AnimeRecord,
  apiData: JikanAnime,
): Promise<void> {
  try {
    // Calculate current hype score
    const currentHypeScore = getHypeScore(
      apiData.popularity || animeRecord.initial_popularity,
      apiData.members || animeRecord.initial_members,
      apiData.favorites || animeRecord.initial_favorites,
    );

    // Calculate current stock price
    const priceData = calculateStockPrice(
      animeRecord.initial_stock_price,
      animeRecord.initial_hype_score,
      currentHypeScore,
      apiData.rank || 999999,
    );

    const newPrice = Math.round(priceData.currentPrice * 100) / 100;

    // Get the most recent stock entry
    const latestStock = await pb
      .collection<AnimeStockRecord>("anistock_stock")
      .getFirstListItem(`anime = "${animeRecord.id}"`, {
        sort: "-created",
        requestKey: `latest-stock-${animeRecord.mal_id}`,
      })
      .catch(() => null);

    // Only create a new entry if price has changed (or this is the first entry)
    if (!latestStock || latestStock.stock_price !== newPrice) {
      await pb.collection<AnimeStockRecord>("anistock_stock").create({
        anime: animeRecord.id!,
        popularity: apiData.popularity || 0,
        members: apiData.members || 0,
        favorites: apiData.favorites || 0,
        score: apiData.score || 0,
        rank: apiData.rank || 999999,
        stock_price: newPrice,
        hype_score: currentHypeScore,
        performance_score: 0, // TODO: Calculate performance score
      });

      if (latestStock) {
        const change = newPrice - latestStock.stock_price;
        const changePercent = (
          (change / latestStock.stock_price) *
          100
        ).toFixed(2);
        console.log(
          `   📊 ${animeRecord.title}: $${
            latestStock.stock_price
          } → $${newPrice} (${change >= 0 ? "+" : ""}${changePercent}%)`,
        );
      }
    }
  } catch (err) {
    console.error(`Error creating stock entry for ${animeRecord.title}:`, err);
  }
}

/**
 * Calculates initial stock price based on hype score
 */
function calculateInitialPrice(hypeScore: number): number {
  const initialPrice =
    (hypeScore < 0.4 ? hypeScore ** 2 : Math.sqrt(hypeScore)) *
      (MAX_INITIAL_PRICE - BASE_PRICE) +
    BASE_PRICE;

  return Math.round(initialPrice * 100) / 100;
}

/**
 * Determines anime status based on API data
 * Relies solely on the status string from the API
 */
function determineStatus(
  apiData: JikanAnime,
): "upcoming" | "ongoing" | "finished" {
  const status = apiData.status?.toLowerCase() || "";

  // Check for "not yet aired" first (upcoming)
  if (status.includes("not yet aired")) {
    return "upcoming";
  }

  // Then check for finished/complete
  if (status.includes("finished") || status.includes("complete")) {
    return "finished";
  }

  // Default to ongoing (currently airing)
  return "ongoing";
}

// Legacy exports for backward compatibility (if needed)
// These can be removed once you update any other files that might reference them

/**
 * @deprecated Use syncAllSeasons() instead
 */
export const getUpcomingStockData = async () => {
  console.warn("getUpcomingStockData() is deprecated. Use syncAllSeasons().");
  await syncAllSeasons();
};

/**
 * @deprecated Use syncAllSeasons() instead
 */
export const getOngoingAnimeStockData = async () => {
  console.warn(
    "getOngoingAnimeStockData() is deprecated. Use syncAllSeasons().",
  );
  await syncAllSeasons();
};
