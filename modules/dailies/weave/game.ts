import type { WeavePuzzle } from "./puzzle";

/**
 * Weave's rules, apart from Discord and the database: whether a guess is one
 * of the words, and what it all pays.
 *
 * A player's progress is what they have found, which words they took a hint
 * on, and their one guess at the thread. Words are guessed by typing them, so
 * a guess is the word alone: it counts if it is one of the five.
 */

/** Finicoin for a word found; for one found after taking its hint; for the thread. */
export const WORD_FC = 5;
export const HINTED_WORD_FC = 3;
export const THREAD_FC = 15;

export type WeaveProgress = {
  /** Indexes into `puzzle.words`, in the order found. */
  found: number[];
  /** Words whose first letter a hint has shown. */
  hinted: number[];
  /** The one guess at the thread, lower case, or null before it's made. */
  threadGuess: string | null;
};

export const NO_PROGRESS: WeaveProgress = { found: [], hinted: [], threadGuess: null };

/** Squares already taken by found words. */
export const foundCells = (puzzle: WeavePuzzle, progress: WeaveProgress): Set<number> =>
  new Set(progress.found.flatMap((index) => puzzle.words[index].cells));

export type WordGuess =
  /** One of the hidden words: its index. */
  | { kind: "found"; index: number }
  | { kind: "already"; index: number }
  | { kind: "wrong" };

/** Whether a typed word is one of the hidden ones. Case and spaces don't matter. */
export const checkWord = (puzzle: WeavePuzzle, progress: WeaveProgress, guess: string): WordGuess => {
  const tidy = guess.trim().toLowerCase();
  const index = puzzle.words.findIndex((word) => word.word === tidy);
  if (index < 0) return { kind: "wrong" };
  return progress.found.includes(index) ? { kind: "already", index } : { kind: "found", index };
};

/** Records a found word, and what it pays. */
export const findWord = (progress: WeaveProgress, index: number): { progress: WeaveProgress; fc: number } => {
  if (progress.found.includes(index)) return { progress, fc: 0 };
  return {
    progress: { ...progress, found: [...progress.found, index] },
    fc: progress.hinted.includes(index) ? HINTED_WORD_FC : WORD_FC,
  };
};

/** The next word a hint would show: the first in grid order not found or hinted yet. */
export const nextHint = (puzzle: WeavePuzzle, progress: WeaveProgress): number | null => {
  const index = puzzle.words.findIndex(
    (_, i) => !progress.found.includes(i) && !progress.hinted.includes(i),
  );
  return index >= 0 ? index : null;
};

export const takeHint = (puzzle: WeavePuzzle, progress: WeaveProgress): WeaveProgress => {
  const index = nextHint(puzzle, progress);
  return index === null ? progress : { ...progress, hinted: [...progress.hinted, index] };
};

/**
 * The thread's letters the found words have shown, alphabetically - which
 * letters are in it, not where: "ac". The order is the puzzle.
 */
export const threadLetters = (puzzle: WeavePuzzle, progress: WeaveProgress): string =>
  progress.found
    .map((index) => puzzle.words[index].word[0])
    .sort()
    .join("");

/**
 * Whether the thread can still be guessed: once, and only while a word is
 * still hidden - with every word found, their first letters spell it out.
 */
export const canGuessThread = (puzzle: WeavePuzzle, progress: WeaveProgress) =>
  progress.threadGuess === null && progress.found.length < puzzle.words.length;

/** The one guess at the thread, and what it pays. A guess that's too late, or a second one, changes nothing. */
export const guessThread = (
  puzzle: WeavePuzzle,
  progress: WeaveProgress,
  guess: string,
): { progress: WeaveProgress; right: boolean; fc: number } => {
  if (!canGuessThread(puzzle, progress)) {
    return { progress, right: progress.threadGuess === puzzle.thread, fc: 0 };
  }
  const tidy = guess.trim().toLowerCase();
  const right = tidy === puzzle.thread;
  return { progress: { ...progress, threadGuess: tidy }, right, fc: right ? THREAD_FC : 0 };
};

export const allFound = (puzzle: WeavePuzzle, progress: WeaveProgress) =>
  progress.found.length === puzzle.words.length;

/** The board is done once every word is found; the thread's chance ends with it. */
export const finished = allFound;

/** What a player has earned, from their progress: it can be worked out again at any time. */
export const earned = (puzzle: WeavePuzzle, progress: WeaveProgress): number =>
  progress.found.reduce(
    (sum, index) => sum + (progress.hinted.includes(index) ? HINTED_WORD_FC : WORD_FC),
    0,
  ) + (progress.threadGuess === puzzle.thread ? THREAD_FC : 0);

export const MAX_FC = WORD_FC * 5 + THREAD_FC;
