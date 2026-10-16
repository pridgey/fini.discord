import type { WeavePuzzle } from "./puzzle";

/**
 * Weave's rules, apart from Discord and the database: whether a guess is one
 * of the words, and what it all pays.
 *
 * A player's progress is what they have found, which words they took a hint
 * on, how many words they've guessed, and their one guess at the thread.
 * Words are guessed by typing them, so a guess is the word alone: it counts if
 * it is one of the five.
 */

/** Finicoin for a word found, and for one found after taking its hint. */
export const WORD_FC = 5;
export const HINTED_WORD_FC = 3;

/**
 * What a right guess at the thread pays, by how many of its letters were
 * showing when it was made: the fewer, the more. Letters show when their word
 * is found - or hinted, so hints can't be used to buy the thread cheaply.
 */
export const THREAD_PRIZES = [50, 25, 20, 15, 10] as const;
export const threadPrize = (lettersShowing: number): number => THREAD_PRIZES[lettersShowing] ?? 0;

export type WeaveProgress = {
  /** Indexes into `puzzle.words`, in the order found. */
  found: number[];
  /** Words whose first letter a hint has shown. */
  hinted: number[];
  /** Words guessed, right or wrong; repeats of a found word don't count. */
  guesses: number;
  /** The one guess at the thread, lower case, or null before it's made. */
  threadGuess: string | null;
  /** What the thread paid when it was guessed - it depends on the letters showing then. */
  threadFc: number;
};

export const NO_PROGRESS: WeaveProgress = {
  found: [],
  hinted: [],
  guesses: 0,
  threadGuess: null,
  threadFc: 0,
};

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

/** Words whose first letter is showing: found, or hinted. */
const showingWords = (progress: WeaveProgress): number[] => [
  ...new Set([...progress.found, ...progress.hinted]),
];

/**
 * The thread's letters showing so far, alphabetically - which letters are in
 * it, not where: "ac". The order is the puzzle.
 */
export const threadLetters = (puzzle: WeavePuzzle, progress: WeaveProgress): string =>
  showingWords(progress)
    .map((index) => puzzle.words[index].word[0])
    .sort()
    .join("");

/**
 * Whether the thread can still be guessed: once, and only while one of its
 * letters is still hidden - with all of them showing it's just an anagram.
 */
export const canGuessThread = (puzzle: WeavePuzzle, progress: WeaveProgress) =>
  progress.threadGuess === null && showingWords(progress).length < puzzle.words.length;

/** What a right guess at the thread would pay now. */
export const threadPrizeNow = (puzzle: WeavePuzzle, progress: WeaveProgress): number =>
  canGuessThread(puzzle, progress) ? threadPrize(showingWords(progress).length) : 0;

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
  const fc = right ? threadPrizeNow(puzzle, progress) : 0;
  return { progress: { ...progress, threadGuess: tidy, threadFc: fc }, right, fc };
};

/** Counts word guesses: each word typed, right or wrong, except one already found. */
export const countGuesses = (progress: WeaveProgress, count: number): WeaveProgress => ({
  ...progress,
  guesses: progress.guesses + count,
});

export const allFound = (puzzle: WeavePuzzle, progress: WeaveProgress) =>
  progress.found.length === puzzle.words.length;

/** The board is done once every word is found. */
export const finished = allFound;

const wordPay = (progress: WeaveProgress, index: number) =>
  progress.hinted.includes(index) ? HINTED_WORD_FC : WORD_FC;

/** What a player has earned, from their progress: it can be worked out again at any time. */
export const earned = (puzzle: WeavePuzzle, progress: WeaveProgress): number =>
  progress.found.reduce((sum, index) => sum + wordPay(progress, index), 0) + progress.threadFc;

/**
 * The most the board can still come to: what's earned, every word left found,
 * and the thread guessed right now. Hints and letters showing bring it down.
 */
export const stillPossible = (puzzle: WeavePuzzle, progress: WeaveProgress): number =>
  earned(puzzle, progress) +
  puzzle.words.reduce(
    (sum, _, index) => sum + (progress.found.includes(index) ? 0 : wordPay(progress, index)),
    0,
  ) +
  threadPrizeNow(puzzle, progress);

/** The most a fresh board pays. */
export const MAX_FC = WORD_FC * 5 + THREAD_PRIZES[0];
