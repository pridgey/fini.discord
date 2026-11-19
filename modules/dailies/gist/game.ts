import type { Phrase } from "./phrases";

/**
 * Gist's rules: a hidden phrase under its category, a pot that starts full,
 * and letters that cost more the more common they are. Solving keeps what's
 * left of the pot. Pure - the board, the store and the tests share it.
 *
 * A player's progress is the list of their moves, and everything else - the
 * pot, the letters called, whether it's over - is read off that list. Each
 * move records what it cost and what the pot was after, so the plays table is
 * also the log for tuning prices later.
 */

export const POT = 75;
export const WRONG_SOLVE_COST = 15;
/** The most a board pays: solving without calling a letter. */
export const MAX_FC = POT;

/** Approximate share of English text, in percent. */
const LETTER_FREQUENCY: Record<string, number> = {
  E: 12.7, T: 9.1, A: 8.2, O: 7.5, I: 7.0, N: 6.7, S: 6.3, H: 6.1, R: 6.0,
  D: 4.3, L: 4.0, C: 2.8, U: 2.8, M: 2.4, W: 2.4, F: 2.2, G: 2.0, Y: 2.0,
  P: 1.9, B: 1.5, V: 1.0, K: 0.8, J: 0.15, X: 0.15, Q: 0.1, Z: 0.07,
};

export const VOWELS = ["A", "E", "I", "O", "U"];
export const CONSONANTS = Object.keys(LETTER_FREQUENCY)
  .filter((l) => !VOWELS.includes(l))
  .sort();

/** Each letter's price in fc. */
export type Prices = Record<string, number>;

/**
 * Today's prices: E is 10, T and A 7, down to 1 for the rarest. Stored on
 * each round, so changing this doesn't rewrite what old rounds charged.
 */
export const currentPrices = (): Prices =>
  Object.fromEntries(
    Object.entries(LETTER_FREQUENCY).map(([letter, share]) => [
      letter,
      Math.max(1, Math.round(share * 0.8)),
    ]),
  );

export type GistPuzzle = Phrase & { prices: Prices };

export type SolveResult = "correct" | "wrong" | "doesnt-fit";

export type Move =
  | { kind: "letter"; letter: string; price: number; hits: number; pot: number }
  | {
      kind: "solve";
      guess: string;
      result: SolveResult;
      cost: number;
      pot: number;
    }
  | { kind: "give-up"; pot: number };

export type GistProgress = { moves: Move[] };
export const NO_PROGRESS: GistProgress = { moves: [] };

export type Status = "playing" | "solved" | "broke" | "gave-up";

export const potOf = (progress: GistProgress): number =>
  progress.moves.at(-1)?.pot ?? POT;

export const calledOf = (progress: GistProgress): string[] =>
  progress.moves.flatMap((m) => (m.kind === "letter" ? [m.letter] : []));

export const wrongGuessesOf = (progress: GistProgress): string[] =>
  progress.moves.flatMap((m) =>
    m.kind === "solve" && m.result === "wrong" ? [m.guess] : [],
  );

export const statusOf = (progress: GistProgress): Status => {
  if (progress.moves.some((m) => m.kind === "solve" && m.result === "correct"))
    return "solved";
  if (progress.moves.some((m) => m.kind === "give-up")) return "gave-up";
  // A pot with anything in it can still try a solve, even if no letter is
  // affordable any more.
  return potOf(progress) <= 0 ? "broke" : "playing";
};

export const finished = (progress: GistProgress) =>
  statusOf(progress) !== "playing";

/** What the board pays: the pot, if it was solved. */
export const earned = (progress: GistProgress): number =>
  statusOf(progress) === "solved" ? potOf(progress) : 0;

export const priceOf = (puzzle: GistPuzzle, letter: string): number =>
  puzzle.prices[letter] ?? 1;

export const hits = (puzzle: GistPuzzle, letter: string): number =>
  [...puzzle.text].filter((c) => c === letter).length;

/** The phrase with uncalled letters as underscores, a string per word. */
export const boardWords = (
  puzzle: GistPuzzle,
  progress: GistProgress,
): string[] => {
  const called = calledOf(progress);
  return puzzle.text
    .split(" ")
    .map((word) => [...word].map((c) => (called.includes(c) ? c : "_")).join(""));
};

/** Whether a letter can be called right now. */
export const canCall = (
  puzzle: GistPuzzle,
  progress: GistProgress,
  letter: string,
): boolean =>
  !finished(progress) &&
  letter in puzzle.prices &&
  !calledOf(progress).includes(letter) &&
  priceOf(puzzle, letter) <= potOf(progress);

/** Calls a letter, or returns the progress unchanged if it can't be called. */
export const callLetter = (
  puzzle: GistPuzzle,
  progress: GistProgress,
  letter: string,
): GistProgress => {
  if (!canCall(puzzle, progress, letter)) return progress;
  const price = priceOf(puzzle, letter);
  return {
    moves: [
      ...progress.moves,
      {
        kind: "letter",
        letter,
        price,
        hits: hits(puzzle, letter),
        pot: potOf(progress) - price,
      },
    ],
  };
};

/**
 * Uppercase letters and single spaces. Apostrophes vanish ("dont"), any other
 * punctuation separates words ("hot-dog" is "HOT DOG").
 */
export const normalizeGuess = (raw: string): string =>
  raw
    .toUpperCase()
    .replace(/['’]/g, "")
    .replace(/[^A-Z]+/g, " ")
    .trim();

/**
 * Whether a guess could be the answer given what the board shows: same word
 * lengths, every shown letter in place, and no called letter sitting in a
 * blank (it would be showing if it were there). A guess that fails this is
 * refused for free - it can't be right, and charging for a typo or a
 * miscounted blank punishes the wrong thing.
 */
export const fitsBoard = (
  puzzle: GistPuzzle,
  progress: GistProgress,
  guess: string,
): boolean => {
  const called = calledOf(progress);
  const words = guess.split(" ");
  const answer = puzzle.text.split(" ");
  if (words.length !== answer.length) return false;

  return answer.every((word, w) => {
    const guessed = words[w];
    if (guessed.length !== word.length) return false;
    return [...word].every((c, i) =>
      called.includes(c) ? guessed[i] === c : !called.includes(guessed[i]),
    );
  });
};

/**
 * A solve. Every attempt is recorded, a refused one too (at no cost), so the
 * log shows how often guesses miss the board.
 */
export const solve = (
  puzzle: GistPuzzle,
  progress: GistProgress,
  raw: string,
): { progress: GistProgress; result: SolveResult } => {
  if (finished(progress)) return { progress, result: "doesnt-fit" };
  const guess = normalizeGuess(raw);
  const pot = potOf(progress);
  const result: SolveResult = !fitsBoard(puzzle, progress, guess)
    ? "doesnt-fit"
    : guess === puzzle.text
      ? "correct"
      : "wrong";
  const cost = result === "wrong" ? Math.min(pot, WRONG_SOLVE_COST) : 0;
  return {
    progress: {
      moves: [
        ...progress.moves,
        { kind: "solve", guess, result, cost, pot: pot - cost },
      ],
    },
    result,
  };
};

export const giveUp = (progress: GistProgress): GistProgress =>
  finished(progress)
    ? progress
    : { moves: [...progress.moves, { kind: "give-up", pot: potOf(progress) }] };

/** How many letters a board called: the post's tiebreak. */
export const lettersCalled = (progress: GistProgress) =>
  calledOf(progress).length;

/* ---------------------------------------------------------- difficulty */

/**
 * What a player who calls letters most-common-first, and solves once half the
 * letters show, would keep. A rough difficulty: high is easy, low is hard.
 */
export const expectedKeep = (phrase: Phrase, prices = currentPrices()): number => {
  const puzzle = { ...phrase, prices };
  const order = Object.keys(LETTER_FREQUENCY).sort(
    (a, b) => LETTER_FREQUENCY[b] - LETTER_FREQUENCY[a],
  );
  const letters = [...phrase.text].filter((c) => c !== " ");
  let progress = NO_PROGRESS;

  for (const letter of order) {
    const called = calledOf(progress);
    const shown = letters.filter((c) => called.includes(c)).length;
    if (shown / letters.length >= 0.5) return potOf(progress);
    if (!canCall(puzzle, progress, letter)) return 0;
    progress = callLetter(puzzle, progress, letter);
  }
  return potOf(progress);
};

/** Phrases outside this band are too easy or too hard to be a good daily. */
export const DIFFICULTY_BAND = { min: 15, max: 55 };

export const inBand = (phrase: Phrase): boolean => {
  const keep = expectedKeep(phrase);
  return keep >= DIFFICULTY_BAND.min && keep <= DIFFICULTY_BAND.max;
};
