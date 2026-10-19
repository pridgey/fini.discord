import { ClientResponseError } from "pocketbase";
import { pb } from "../../../utilities/pocketbase";
import { NO_PROGRESS, type ReelProgress, type Turn } from "./game";
import type { DailyPost } from "../shared";

/**
 * Reel's Pocketbase records: one film a day, and one go per player per server
 * per day. See `pb_migrations/1792600000_created_daily_reel.js`.
 */

const ROUNDS = "daily_reel_round";
const PLAYS = "daily_reel_play";

export type ReelRoundRecord = {
  id: string;
  day: string;
  movie_id: number;
  title: string;
  year: string;
  /** TMDB image paths, hardest first. */
  frames: string[];
  posts: Record<string, DailyPost> | null;
};

export type ReelPlayRecord = {
  id: string;
  round: string;
  server_id: string;
  user_id: string;
  username: string;
  guesses: Turn[] | null;
  paid: number;
  solved: boolean;
  finished: boolean;
};

const nullOn404 = (error: unknown) => {
  if (error instanceof ClientResponseError && error.status === 404) return null;
  throw error;
};

export const getReelRound = (day: string): Promise<ReelRoundRecord | null> =>
  pb
    .collection<ReelRoundRecord>(ROUNDS)
    .getFirstListItem(pb.filter("day = {:day}", { day }))
    .catch(nullOn404);

export const getReelRoundById = (id: string): Promise<ReelRoundRecord | null> =>
  pb.collection<ReelRoundRecord>(ROUNDS).getOne(id).catch(nullOn404);

/** Films shown since `day`, so one doesn't come round again too soon. */
export const filmsShownSince = async (day: string): Promise<Set<number>> => {
  const rounds = await pb.collection<ReelRoundRecord>(ROUNDS).getFullList({
    filter: pb.filter("day >= {:day}", { day }),
    fields: "movie_id",
  });
  return new Set(rounds.map((round) => round.movie_id));
};

export const createReelRound = (
  round: Omit<ReelRoundRecord, "id" | "posts">,
): Promise<ReelRoundRecord> =>
  pb.collection<ReelRoundRecord>(ROUNDS).create({ ...round, posts: {} });

export const recordReelPost = async (
  roundId: string,
  serverId: string,
  post: DailyPost,
) => {
  const round = await pb.collection<ReelRoundRecord>(ROUNDS).getOne(roundId);
  await pb
    .collection<ReelRoundRecord>(ROUNDS)
    .update(roundId, { posts: { ...(round.posts ?? {}), [serverId]: post } });
};

export const progressOf = (play: ReelPlayRecord | null): ReelProgress =>
  play ? { turns: play.guesses ?? [] } : NO_PROGRESS;

export const findReelPlay = (
  roundId: string,
  serverId: string,
  userId: string,
): Promise<ReelPlayRecord | null> =>
  pb
    .collection<ReelPlayRecord>(PLAYS)
    .getFirstListItem(
      pb.filter(
        "round = {:roundId} && server_id = {:serverId} && user_id = {:userId}",
        { roundId, serverId, userId },
      ),
    )
    .catch(nullOn404);

/** A player's go for the day, made the first time they open it. */
export const openReelPlay = async (
  roundId: string,
  serverId: string,
  userId: string,
  username: string,
): Promise<ReelPlayRecord> => {
  const existing = await findReelPlay(roundId, serverId, userId);
  if (existing) return existing;
  return pb
    .collection<ReelPlayRecord>(PLAYS)
    .create({
      round: roundId,
      server_id: serverId,
      user_id: userId,
      username,
      guesses: [],
      paid: 0,
      solved: false,
      finished: false,
    })
    .catch(async (error) => {
      // Two first presses racing: the unique index keeps one go.
      const raced = await findReelPlay(roundId, serverId, userId);
      if (raced) return raced;
      throw error;
    });
};

export const saveReelProgress = (
  playId: string,
  progress: ReelProgress,
  result: { paid: number; solved: boolean; finished: boolean },
) =>
  pb
    .collection<ReelPlayRecord>(PLAYS)
    .update(playId, { guesses: progress.turns, ...result });

/** Every go at a round in a server, best first. */
export const reelPlaysFor = (
  roundId: string,
  serverId: string,
): Promise<ReelPlayRecord[]> =>
  pb.collection<ReelPlayRecord>(PLAYS).getFullList({
    filter: pb.filter("round = {:roundId} && server_id = {:serverId}", {
      roundId,
      serverId,
    }),
    sort: "-paid,updated",
  });
