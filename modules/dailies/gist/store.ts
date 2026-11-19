import { ClientResponseError } from "pocketbase";
import { pb } from "../../../utilities/pocketbase";
import {
  NO_PROGRESS,
  potOf,
  type GistProgress,
  type GistPuzzle,
  type Move,
  type Prices,
} from "./game";
import type { DailyPost } from "../shared";

/**
 * Gist's Pocketbase records: one phrase a day, and one go per player per
 * server per day. See `pb_migrations/1793100000_created_daily_gist.js`.
 */

const ROUNDS = "daily_gist_round";
const PLAYS = "daily_gist_play";

export type GistRoundRecord = {
  id: string;
  day: string;
  category: string;
  text: string;
  prices: Prices;
  difficulty: number;
  posts: Record<string, DailyPost> | null;
};

export type GistPlayRecord = {
  id: string;
  round: string;
  server_id: string;
  user_id: string;
  username: string;
  moves: Move[] | null;
  pot: number;
  paid: number;
  solved: boolean;
  finished: boolean;
};

const nullOn404 = (error: unknown) => {
  if (error instanceof ClientResponseError && error.status === 404) return null;
  throw error;
};

export const puzzleOf = (round: GistRoundRecord): GistPuzzle => ({
  category: round.category,
  text: round.text,
  prices: round.prices,
});

export const getGistRound = (day: string): Promise<GistRoundRecord | null> =>
  pb
    .collection<GistRoundRecord>(ROUNDS)
    .getFirstListItem(pb.filter("day = {:day}", { day }))
    .catch(nullOn404);

export const getGistRoundById = (id: string): Promise<GistRoundRecord | null> =>
  pb.collection<GistRoundRecord>(ROUNDS).getOne(id).catch(nullOn404);

/** Every phrase a round has used, with the last day it was used. */
export const phrasesUsed = async (): Promise<Map<string, string>> => {
  const rounds = await pb.collection<GistRoundRecord>(ROUNDS).getFullList({
    fields: "text,day",
    sort: "day",
  });
  // Oldest first, so a phrase used twice ends on its latest day.
  return new Map(rounds.map((round) => [round.text, round.day]));
};

export const createGistRound = (
  round: Omit<GistRoundRecord, "id" | "posts">,
): Promise<GistRoundRecord> =>
  pb.collection<GistRoundRecord>(ROUNDS).create({ ...round, posts: {} });

export const recordGistPost = async (
  roundId: string,
  serverId: string,
  post: DailyPost,
) => {
  const round = await pb.collection<GistRoundRecord>(ROUNDS).getOne(roundId);
  await pb
    .collection<GistRoundRecord>(ROUNDS)
    .update(roundId, { posts: { ...(round.posts ?? {}), [serverId]: post } });
};

export const progressOf = (play: GistPlayRecord | null): GistProgress =>
  play ? { moves: play.moves ?? [] } : NO_PROGRESS;

export const findGistPlay = (
  roundId: string,
  serverId: string,
  userId: string,
): Promise<GistPlayRecord | null> =>
  pb
    .collection<GistPlayRecord>(PLAYS)
    .getFirstListItem(
      pb.filter(
        "round = {:roundId} && server_id = {:serverId} && user_id = {:userId}",
        { roundId, serverId, userId },
      ),
    )
    .catch(nullOn404);

/** A player's go for the day, made the first time they open it. */
export const openGistPlay = async (
  roundId: string,
  serverId: string,
  userId: string,
  username: string,
): Promise<GistPlayRecord> => {
  const existing = await findGistPlay(roundId, serverId, userId);
  if (existing) return existing;
  return pb
    .collection<GistPlayRecord>(PLAYS)
    .create({
      round: roundId,
      server_id: serverId,
      user_id: userId,
      username,
      moves: [],
      pot: potOf(NO_PROGRESS),
      paid: 0,
      solved: false,
      finished: false,
    })
    .catch(async (error) => {
      // Two first presses racing: the unique index keeps one go.
      const raced = await findGistPlay(roundId, serverId, userId);
      if (raced) return raced;
      throw error;
    });
};

export const saveGistProgress = (
  playId: string,
  progress: GistProgress,
  result: { paid: number; solved: boolean; finished: boolean },
) =>
  pb.collection<GistPlayRecord>(PLAYS).update(playId, {
    moves: progress.moves,
    pot: potOf(progress),
    ...result,
  });

/** Every go at a round in a server, best first. */
export const gistPlaysFor = (
  roundId: string,
  serverId: string,
): Promise<GistPlayRecord[]> =>
  pb.collection<GistPlayRecord>(PLAYS).getFullList({
    filter: pb.filter("round = {:roundId} && server_id = {:serverId}", {
      roundId,
      serverId,
    }),
    sort: "-paid,updated",
  });
