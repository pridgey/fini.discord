import { addCoin } from "../../finicoin";
import { currentDay, dayKey } from "../shared";
import type { WeavePlayer } from "../weave/daily";
import { buildReelBoard } from "./board";
import {
  earned,
  filmName,
  finished,
  guess,
  skip,
  solved,
  solvedOn,
  type ReelProgress,
  type TurnResult,
} from "./game";
import {
  createReelRound,
  filmsShownSince,
  getReelRound,
  getReelRoundById,
  openReelPlay,
  progressOf,
  saveReelProgress,
  type ReelPlayRecord,
  type ReelRoundRecord,
} from "./store";
import { POOL_PAGES, framesFor, matchGuess, poolPage } from "./tmdb";

/**
 * Reel, the daily guess-the-film game. At noon a film goes up in the daily post
 * (`../post.ts`); each player opens a private go at it, sees one frame, and
 * guesses or skips for the next. A right guess pays for how few frames it took.
 */

/**
 * Off while Reel is being tried out: it isn't in the daily post, only the bot
 * admin can play it (`/daily reel`), and nothing is paid. Turning it on is all
 * it takes to go live.
 */
export const REEL_LIVE = false;

/** Who's playing: the same as Weave's. */
export type ReelPlayer = WeavePlayer;

/** A film doesn't come round again for this long. */
const REPEAT_DAYS = 365;
/** Films to try before giving up for the minute: most have five good frames. */
const ATTEMPTS = 8;

const daysBefore = (day: string, days: number): string => {
  const [year, month, date] = day.split("-").map(Number);
  return dayKey(new Date(year, month - 1, date - days));
};

/**
 * A film for `day`: a random one from the pool, not shown in the last year,
 * with five good frames. Null if none turned up in a few tries.
 */
export const chooseFilm = async (
  day: string,
  random: () => number = Math.random,
): Promise<Omit<ReelRoundRecord, "id" | "posts"> | null> => {
  const shown = await filmsShownSince(daysBefore(day, REPEAT_DAYS));
  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    const page = await poolPage(1 + Math.floor(random() * POOL_PAGES));
    const fresh = page.filter((film) => !shown.has(film.movieId));
    if (!fresh.length) continue;
    const film = fresh[Math.floor(random() * fresh.length)];
    const frames = await framesFor(film.movieId);
    if (!frames) {
      shown.add(film.movieId);
      continue;
    }
    return {
      day,
      movie_id: film.movieId,
      title: film.title,
      year: film.year,
      frames,
    };
  }
  return null;
};

/** Today's film, chosen and saved if it doesn't exist yet. */
export const ensureTodaysReel = async (): Promise<ReelRoundRecord | null> => {
  const day = dayKey();
  const existing = await getReelRound(day);
  if (existing) return existing;
  const film = await chooseFilm(day);
  if (!film) return null;
  // Two makers racing for the day: the unique index keeps the first.
  return createReelRound(film).catch(async (error) => {
    const raced = await getReelRound(day);
    if (raced) return raced;
    throw error;
  });
};

/* ------------------------------------------------------------- playing */

/** The round a button names, if it's still the one being played; otherwise why not. */
export const playableReel = async (
  roundId: string,
): Promise<{ round: ReelRoundRecord } | { refusal: string }> => {
  const round = await getReelRoundById(roundId);
  if (!round)
    return { refusal: "That Reel is gone. Today's is up with `/daily reel`." };
  if (round.day !== currentDay())
    return { refusal: "That Reel is over. Today's is up with `/daily reel`." };
  return { round };
};

/** Goes being saved, by play: a second press while one saves is let go. */
const saving = new Set<string>();

const playOf = (round: ReelRoundRecord, player: ReelPlayer) =>
  openReelPlay(round.id, player.serverId, player.userId, player.displayName);

const boardFor = (
  round: ReelRoundRecord,
  progress: ReelProgress,
  note?: string,
) => buildReelBoard({ round, progress, note, trial: !REEL_LIVE });

/** A player's go as it stands, made the first time they open it. */
export const openReel = async (round: ReelRoundRecord, player: ReelPlayer) =>
  boardFor(round, progressOf(await playOf(round, player)));

/** A round solved just now, for the daily post's announcement. */
export type ReelSolve = { frame: number; fc: number };

/** Saves a turn, and pays a right guess when Reel is live. */
const settle = async (
  round: ReelRoundRecord,
  play: ReelPlayRecord,
  player: ReelPlayer,
  progress: ReelProgress,
  fc: number,
) => {
  await saveReelProgress(play.id, progress, {
    paid: REEL_LIVE ? earned(round.movie_id, progress) : 0,
    solved: solved(round.movie_id, progress),
    finished: finished(round.movie_id, progress),
  });
  if (REEL_LIVE && fc > 0) {
    await addCoin(
      player.userId,
      player.serverId,
      fc,
      player.username,
      player.serverName,
      "Reserve",
    );
  }
};

/** What a turn did, said under the board. */
const noteFor = (round: ReelRoundRecord, result: TurnResult): string => {
  const answer = `**${filmName(round)}**`;
  switch (result.kind) {
    case "over":
      return "You've had your go today.";
    case "repeat":
      return `You've already guessed **${filmName(result.film)}**. That one's free - try another.`;
    case "right":
      return `✅ It's ${answer}! **+${result.fc} fc**${REEL_LIVE ? "" : " (on trial, so not paid)"}.`;
    case "wrong": {
      const last = result.progress.turns.at(-1);
      const named = last?.kind === "guess" ? `**${filmName(last)}**` : "that";
      return finished(round.movie_id, result.progress)
        ? `❌ Not ${named}. It was ${answer}.`
        : `❌ Not ${named}. Here's another frame.`;
    }
    case "skipped":
      return finished(round.movie_id, result.progress)
        ? `⏭️ Skipped. It was ${answer}.`
        : "⏭️ Skipped. Here's another frame.";
  }
};

/** Runs one turn: saved, paid, and the board redrawn with what it did. */
const takeTurn = async (
  round: ReelRoundRecord,
  player: ReelPlayer,
  turn: (progress: ReelProgress) => Promise<TurnResult | string>,
): Promise<{
  board: Awaited<ReturnType<typeof boardFor>>;
  solve: ReelSolve | null;
}> => {
  const play = await playOf(round, player);
  const before = progressOf(play);
  if (saving.has(play.id))
    return { board: await boardFor(round, before), solve: null };
  saving.add(play.id);
  try {
    const result = await turn(before);
    if (typeof result === "string")
      return { board: await boardFor(round, before, result), solve: null };
    if (
      result.kind === "right" ||
      result.kind === "wrong" ||
      result.kind === "skipped"
    ) {
      await settle(
        round,
        play,
        player,
        result.progress,
        result.kind === "right" ? result.fc : 0,
      );
      const solve =
        REEL_LIVE && result.kind === "right"
          ? {
              frame: solvedOn(round.movie_id, result.progress)!,
              fc: result.fc,
            }
          : null;
      return {
        board: await boardFor(round, result.progress, noteFor(round, result)),
        solve,
      };
    }
    return {
      board: await boardFor(round, before, noteFor(round, result)),
      solve: null,
    };
  } finally {
    saving.delete(play.id);
  }
};

/** A typed guess: matched to a film on TMDB, then judged. */
export const guessReel = (
  round: ReelRoundRecord,
  player: ReelPlayer,
  typed: string,
) =>
  takeTurn(round, player, async (progress) => {
    if (finished(round.movie_id, progress)) return { kind: "over" };
    const film = await matchGuess(typed, round.movie_id).catch(() => undefined);
    if (film === undefined)
      return "Couldn't reach the film database just now. Try that guess again in a moment - it didn't count.";
    if (!film)
      return `I couldn't find a film called **${typed.trim()}**. Check the spelling - that didn't count as a guess.`;
    return guess(round.movie_id, progress, film);
  });

/** Gives up on this frame for the next. */
export const skipReel = (round: ReelRoundRecord, player: ReelPlayer) =>
  takeTurn(round, player, async (progress) => skip(round.movie_id, progress));
