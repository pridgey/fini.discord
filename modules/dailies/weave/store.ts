import { ClientResponseError } from "pocketbase";
import { pb } from "../../../utilities/pocketbase";
import { NO_PROGRESS, type WeaveProgress } from "./game";
import type { WeavePuzzle } from "./puzzle";

/**
 * Weave's Pocketbase records: one puzzle a day, and one board per player per
 * server per day. See `pb_migrations/1792300000_created_daily_weave.js`.
 */

const ROUNDS = "daily_weave_round";
const PLAYS = "daily_weave_play";

export type WeaveRoundRecord = WeavePuzzle & {
  id: string;
  day: string;
  posts: Record<string, { channelId: string; messageId: string }> | null;
};

export type WeavePlayRecord = {
  id: string;
  round: string;
  server_id: string;
  user_id: string;
  username: string;
  found: number[] | null;
  hinted: number[] | null;
  thread_guess: string;
  /** What the thread paid, fixed when it was guessed. */
  thread_fc: number;
  /** Words guessed, right or wrong. */
  guesses: number;
  paid: number;
  finished: boolean;
};

const nullOn404 = (error: unknown) => {
  if (error instanceof ClientResponseError && error.status === 404) return null;
  throw error;
};

export const getWeaveRound = (day: string): Promise<WeaveRoundRecord | null> =>
  pb
    .collection<WeaveRoundRecord>(ROUNDS)
    .getFirstListItem(pb.filter("day = {:day}", { day }))
    .catch(nullOn404);

export const getWeaveRoundById = (
  id: string,
): Promise<WeaveRoundRecord | null> =>
  pb.collection<WeaveRoundRecord>(ROUNDS).getOne(id).catch(nullOn404);

export const createWeaveRound = (
  day: string,
  puzzle: WeavePuzzle,
): Promise<WeaveRoundRecord> =>
  pb.collection<WeaveRoundRecord>(ROUNDS).create({ day, ...puzzle, posts: {} });

export const recordWeavePost = async (
  roundId: string,
  serverId: string,
  post: { channelId: string; messageId: string },
) => {
  const round = await pb.collection<WeaveRoundRecord>(ROUNDS).getOne(roundId);
  await pb
    .collection<WeaveRoundRecord>(ROUNDS)
    .update(roundId, { posts: { ...(round.posts ?? {}), [serverId]: post } });
};

/** The puzzle part of a round. */
export const puzzleOf = (round: WeaveRoundRecord): WeavePuzzle => ({
  grid: round.grid,
  words: round.words,
  thread: round.thread,
});

export const progressOf = (play: WeavePlayRecord | null): WeaveProgress =>
  play
    ? {
        found: play.found ?? [],
        hinted: play.hinted ?? [],
        guesses: play.guesses ?? 0,
        threadGuess: play.thread_guess ? play.thread_guess : null,
        threadFc: play.thread_fc ?? 0,
      }
    : NO_PROGRESS;

export const findWeavePlay = (
  roundId: string,
  serverId: string,
  userId: string,
): Promise<WeavePlayRecord | null> =>
  pb
    .collection<WeavePlayRecord>(PLAYS)
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
    .catch(nullOn404);

/** A player's board for the day, made the first time they open it. */
export const openWeavePlay = async (
  roundId: string,
  serverId: string,
  userId: string,
  username: string,
): Promise<WeavePlayRecord> => {
  const existing = await findWeavePlay(roundId, serverId, userId);
  if (existing) return existing;
  return pb
    .collection<WeavePlayRecord>(PLAYS)
    .create({
      round: roundId,
      server_id: serverId,
      user_id: userId,
      username,
      found: [],
      hinted: [],
      thread_guess: "",
      thread_fc: 0,
      guesses: 0,
      paid: 0,
      finished: false,
    })
    .catch(async (error) => {
      // Two first presses racing: the unique index keeps one board.
      const raced = await findWeavePlay(roundId, serverId, userId);
      if (raced) return raced;
      throw error;
    });
};

export const saveWeaveProgress = (
  playId: string,
  progress: WeaveProgress,
  paid: number,
  finished: boolean,
) =>
  pb.collection<WeavePlayRecord>(PLAYS).update(playId, {
    found: progress.found,
    hinted: progress.hinted,
    thread_guess: progress.threadGuess ?? "",
    thread_fc: progress.threadFc,
    guesses: progress.guesses,
    paid,
    finished,
  });

/** Every board for a round in a server, best first. */
export const weavePlaysFor = (
  roundId: string,
  serverId: string,
): Promise<WeavePlayRecord[]> =>
  pb.collection<WeavePlayRecord>(PLAYS).getFullList({
    filter: pb.filter("round = {:roundId} && server_id = {:serverId}", {
      roundId,
      serverId,
    }),
    sort: "-paid,updated",
  });
