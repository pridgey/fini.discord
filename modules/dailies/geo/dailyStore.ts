import { ClientResponseError } from "pocketbase";
import { pb } from "../../../utilities/pocketbase";
import type { Check } from "./judge";
import type { GeoRound } from "./imagery";
import type { PlaceInfo } from "./geocode";
import type { RoundFacts } from "./messages";

/**
 * The daily location game's Pocketbase records: one round a day, and one guess
 * per player per server per round. See `pb_migrations/1792200000_created_daily_geo.js`.
 */

const ROUNDS = "daily_geo_round";
const GUESSES = "daily_geo_guess";

export type DailyPost = { channelId: string; messageId: string };

export type DailyRoundRecord = {
  id: string;
  collectionId: string;
  collectionName: string;
  day: string;
  answer_lat: number;
  answer_lon: number;
  place: PlaceInfo;
  /** File names; see `roundPhotos`. */
  photos: string[];
  credit: string;
  license: string;
  source: string;
  posts: Record<string, DailyPost> | null;
};

export type DailyGuessRecord = {
  id?: string;
  round: string;
  server_id: string;
  user_id: string;
  username: string;
  guess: string;
  label: string;
  guess_lat: number;
  guess_lon: number;
  km: number;
  total: number;
  checks: Check[];
};

export { dayKey, previousDay } from "../shared";

const notFound = (error: unknown) =>
  error instanceof ClientResponseError && error.status === 404;

export const getRound = async (day: string): Promise<DailyRoundRecord | null> =>
  pb
    .collection<DailyRoundRecord>(ROUNDS)
    .getFirstListItem(pb.filter("day = {:day}", { day }))
    .catch((error) => {
      if (notFound(error)) return null;
      throw error;
    });

export const getRoundById = async (
  id: string,
): Promise<DailyRoundRecord | null> =>
  pb
    .collection<DailyRoundRecord>(ROUNDS)
    .getOne(id)
    .catch((error) => {
      if (notFound(error)) return null;
      throw error;
    });

/** Saves a round, photos and all, as the round for `day`. */
export const createRound = async (
  day: string,
  round: GeoRound,
  place: PlaceInfo,
): Promise<DailyRoundRecord> =>
  pb.collection<DailyRoundRecord>(ROUNDS).create({
    day,
    answer_lat: round.answer.lat,
    answer_lon: round.answer.lon,
    place,
    photos: round.photos.map(
      (photo, i) =>
        new File([new Uint8Array(photo)], `view-${i + 1}.jpg`, {
          type: "image/jpeg",
        }),
    ),
    credit: round.credit,
    license: round.license,
    source: round.source,
    posts: {},
  });

/** Notes where a round was posted in a server. */
export const recordPost = async (
  roundId: string,
  serverId: string,
  post: DailyPost,
) => {
  const round = await pb.collection<DailyRoundRecord>(ROUNDS).getOne(roundId);
  await pb
    .collection<DailyRoundRecord>(ROUNDS)
    .update(roundId, { posts: { ...(round.posts ?? {}), [serverId]: post } });
};

/** The round's photos, downloaded from Pocketbase. */
export const roundPhotos = async (
  round: DailyRoundRecord,
): Promise<Buffer[]> => {
  const photos = await Promise.all(
    round.photos.map(async (name) => {
      const response = await fetch(pb.files.getURL(round, name)).catch(
        () => null,
      );
      return response?.ok ? Buffer.from(await response.arrayBuffer()) : null;
    }),
  );
  return photos.filter((photo) => photo !== null);
};

export const factsOf = (round: DailyRoundRecord): RoundFacts => ({
  answer: { lat: round.answer_lat, lon: round.answer_lon },
  photoCount: round.photos.length,
  credit: round.credit,
  source: round.source,
  license: round.license,
});

export const findGuess = async (
  roundId: string,
  serverId: string,
  userId: string,
): Promise<DailyGuessRecord | null> =>
  pb
    .collection<DailyGuessRecord>(GUESSES)
    .getFirstListItem(
      pb.filter(
        "round = {:roundId} && server_id = {:serverId} && user_id = {:userId}",
        {
          roundId,
          serverId,
          userId,
        },
      ),
    )
    .catch((error) => {
      if (notFound(error)) return null;
      throw error;
    });

/**
 * Records a guess. Returns null if the player already has one for this round
 * in this server - the unique index refuses the second, so a double-click on
 * Lock in can't pay twice.
 */
export const saveGuess = async (
  guess: DailyGuessRecord,
): Promise<DailyGuessRecord | null> =>
  pb
    .collection<DailyGuessRecord>(GUESSES)
    .create(guess)
    .catch((error) => {
      if (error instanceof ClientResponseError && error.status === 400)
        return null;
      throw error;
    });

/** Every guess at a round in a server, best first. */
export const guessesFor = async (
  roundId: string,
  serverId: string,
): Promise<DailyGuessRecord[]> =>
  pb.collection<DailyGuessRecord>(GUESSES).getFullList({
    filter: pb.filter("round = {:roundId} && server_id = {:serverId}", {
      roundId,
      serverId,
    }),
    sort: "-total,km",
  });
