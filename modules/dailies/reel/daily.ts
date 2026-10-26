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
  type Film,
  type ReelProgress,
  type TurnResult,
} from "./game";
import {
  createReelRound,
  filmsShown,
  getReelRound,
  getReelRoundById,
  openReelPlay,
  progressOf,
  saveReelProgress,
  type ReelPlayRecord,
  type ReelRoundRecord,
} from "./store";
import { POOL_PAGES, filmById, framesFor, matchGuess, poolPage } from "./tmdb";

/**
 * Reel, the daily guess-the-film game. At noon a film goes up in the daily post
 * (`../post.ts`); each player opens a private go at it, sees one frame, and
 * guesses or skips for the next. A right guess pays for how few frames it took.
 */

/**
 * Live since 2026-10-19. Off puts it back on trial: it isn't in the daily post,
 * only the bot admin can play it (`/daily reel`), and nothing is paid.
 */
export const REEL_LIVE = true;

/** Who's playing: the same as Weave's. */
export type ReelPlayer = WeavePlayer;

/** Films to try before giving up for the minute: most have five good frames. */
const ATTEMPTS = 8;

/** Where `chooseFilm` gets its films; swapped out in tests. */
export type FilmSource = {
  /** Every film a round has shown, with the last day it was shown. */
  shown: () => Promise<
    Map<number, { day: string; title: string; year: string }>
  >;
  page: (page: number) => Promise<Film[]>;
  frames: (movieId: number) => Promise<string[] | null>;
  random: () => number;
};

const TMDB_SOURCE: FilmSource = {
  shown: filmsShown,
  page: poolPage,
  frames: framesFor,
  random: Math.random,
};

/** 1 to POOL_PAGES in a random order. */
const shuffledPages = (random: () => number): number[] => {
  const pages = Array.from({ length: POOL_PAGES }, (_, i) => i + 1);
  for (let i = pages.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [pages[i], pages[j]] = [pages[j], pages[i]];
  }
  return pages;
};

/**
 * A film for `day` with five good frames, or null if none turned up in a few
 * tries. A film never comes round again while the pool has one not yet shown:
 * picking at random among those shown over a year ago would repeat within
 * thirteen months, and by year three a quarter of days would be repeats. Once
 * every film has been shown, the one shown longest ago goes next.
 */
export const chooseFilm = async (
  day: string,
  source: FilmSource = TMDB_SOURCE,
): Promise<Omit<ReelRoundRecord, "id" | "posts"> | null> => {
  const shown = await source.shown();
  const round = (film: Film, frames: string[]) => ({
    day,
    movie_id: film.movieId,
    title: film.title,
    year: film.year,
    frames,
  });

  let tries = 0;
  for (const page of shuffledPages(source.random)) {
    const fresh = (await source.page(page)).filter(
      (film) => !shown.has(film.movieId),
    );
    while (fresh.length && tries < ATTEMPTS) {
      const [film] = fresh.splice(
        Math.floor(source.random() * fresh.length),
        1,
      );
      tries++;
      const frames = await source.frames(film.movieId);
      if (frames) return round(film, frames);
    }
    if (tries >= ATTEMPTS) return null;
  }

  // The whole pool has been shown: round again, oldest first.
  const oldest = [...shown.entries()]
    .sort(([, a], [, b]) => a.day.localeCompare(b.day))
    .slice(0, ATTEMPTS);
  for (const [movieId, { title, year }] of oldest) {
    const frames = await source.frames(movieId);
    if (frames) return round({ movieId, title, year }, frames);
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
  choices?: Film[],
) => buildReelBoard({ round, progress, note, choices, trial: !REEL_LIVE });

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
  turn: (
    progress: ReelProgress,
  ) => Promise<TurnResult | string | { note: string; choices: Film[] }>,
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
    if ("choices" in result)
      return {
        board: await boardFor(round, before, result.note, result.choices),
        solve: null,
      };
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

/**
 * A typed guess: matched to a film on TMDB, then judged. A guess that could
 * mean more than one film isn't a turn yet: the board offers the films it
 * might be, and the one picked is judged (`pickReel`).
 */
export const guessReel = (
  round: ReelRoundRecord,
  player: ReelPlayer,
  typed: string,
) =>
  takeTurn(round, player, async (progress) => {
    if (finished(round.movie_id, progress)) return { kind: "over" };
    const match = await matchGuess(typed, round.movie_id).catch(
      () => undefined,
    );
    if (match === undefined)
      return "Couldn't reach the film database just now. Try that guess again in a moment - it didn't count.";
    if (!match)
      return `I couldn't find a film called **${typed.trim()}**. Check the spelling - that didn't count as a guess.`;
    if ("choices" in match)
      return {
        note: `Which film did you mean by **${typed.trim()}**? Pick one below - nothing's counted yet. Not there? Guess again.`,
        choices: match.choices,
      };
    return guess(round.movie_id, progress, match.film);
  });

/** One of the films a guess was offered as, picked: judged as that guess. */
export const pickReel = (
  round: ReelRoundRecord,
  player: ReelPlayer,
  movieId: number,
) =>
  takeTurn(round, player, async (progress) => {
    if (finished(round.movie_id, progress)) return { kind: "over" };
    const film = await filmById(movieId).catch(() => null);
    if (!film)
      return "Couldn't reach the film database just now. Pick it again in a moment - it didn't count.";
    return guess(round.movie_id, progress, film);
  });

/** Gives up on this frame for the next. */
export const skipReel = (round: ReelRoundRecord, player: ReelPlayer) =>
  takeTurn(round, player, async (progress) => skip(round.movie_id, progress));
