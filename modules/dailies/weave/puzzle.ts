import { WEAVE_WORDS } from "./words";

/**
 * Weave's puzzles. A 5x5 grid holds five hidden words that between them use
 * every letter once; each runs from square to square up, down, left or right.
 * The first letters of the words, in some order, spell a sixth word: the
 * thread. Which word gives which of its letters is scattered at random, so the
 * grid says nothing about the order - the thread is an anagram to solve.
 *
 * Made by drawing one path through all 25 squares, cutting it into five
 * pieces, and fitting a word to each piece - so a solution always exists, and
 * the words never cross. Pure: pass `random` to pin it.
 */

export const SIZE = 5;
export const CELLS = SIZE * SIZE;
export const WORD_COUNT = 5;
const MIN_LENGTH = 4;
const MAX_LENGTH = 6;

type Random = () => number;

/** A hidden word and the squares it runs through, in spelling order. */
export type WeaveWord = { word: string; cells: number[] };

export type WeavePuzzle = {
  /** The 25 letters, row by row. */
  grid: string;
  /** The hidden words, in grid order: sorted by the square each starts on. */
  words: WeaveWord[];
  /** The sixth word, spelled by the words' first letters in some order. */
  thread: string;
};

export const rowOf = (cell: number) => Math.floor(cell / SIZE);
export const colOf = (cell: number) => cell % SIZE;

/** The squares next to `cell`: up, down, left and right. */
export const neighbours = (cell: number): number[] => {
  const row = rowOf(cell);
  const col = colOf(cell);
  return [
    row > 0 ? cell - SIZE : -1,
    row < SIZE - 1 ? cell + SIZE : -1,
    col > 0 ? cell - 1 : -1,
    col < SIZE - 1 ? cell + 1 : -1,
  ].filter((next) => next >= 0);
};

export const adjacent = (a: number, b: number) => neighbours(a).includes(b);

const shuffled = <T>(items: T[], random: Random): T[] => {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
};

/**
 * One path through every square. Depth-first, trying first the squares with
 * the fewest ways onward (Warnsdorff's rule) and breaking ties at random, so it
 * almost never has to back up. On an odd grid a path through every square has
 * to start on the colour there is more of, as on a chessboard.
 */
export const randomTour = (random: Random): number[] => {
  const starts = shuffled(
    Array.from({ length: CELLS }, (_, cell) => cell).filter(
      (cell) => (rowOf(cell) + colOf(cell)) % 2 === 0,
    ),
    random,
  );
  for (const start of starts) {
    const path = [start];
    const seen = new Set(path);
    let budget = 20_000;
    const extend = (): boolean => {
      if (path.length === CELLS) return true;
      if (budget-- <= 0) return false;
      const here = path[path.length - 1];
      const onward = (cell: number) =>
        neighbours(cell).filter((next) => !seen.has(next)).length;
      const options = shuffled(
        neighbours(here).filter((next) => !seen.has(next)),
        random,
      ).sort((a, b) => onward(a) - onward(b));
      for (const next of options) {
        path.push(next);
        seen.add(next);
        if (extend()) return true;
        path.pop();
        seen.delete(next);
      }
      return false;
    };
    if (extend()) return path;
  }
  throw new Error("No path through the grid");
};

/** Five word lengths of 4 to 6 that add up to the 25 squares. */
export const randomLengths = (random: Random): number[] => {
  for (;;) {
    const lengths = Array.from(
      { length: WORD_COUNT },
      () => MIN_LENGTH + Math.floor(random() * (MAX_LENGTH - MIN_LENGTH + 1)),
    );
    if (lengths.reduce((sum, length) => sum + length, 0) === CELLS)
      return lengths;
  }
};

/** Words by length and first letter: "5:c" is every 5-letter word starting with c. */
const BY_START = new Map<string, string[]>();
for (const word of WEAVE_WORDS) {
  const key = `${word.length}:${word[0]}`;
  BY_START.set(key, [...(BY_START.get(key) ?? []), word]);
}
const THREADS = WEAVE_WORDS.filter((word) => word.length === WORD_COUNT);

/**
 * Words for the pieces whose first letters are a thread word's letters, each
 * piece given one of them at random; null if no thread word fits these
 * lengths. Words are all different, and none is the thread itself.
 */
const fitWords = (
  lengths: number[],
  random: Random,
): { thread: string; words: string[] } | null => {
  for (const thread of shuffled(THREADS, random)) {
    const used = new Set([thread]);
    const words: string[] = [];
    const letters = shuffled([...thread], random);
    for (const [i, length] of lengths.entries()) {
      const options = (BY_START.get(`${length}:${letters[i]}`) ?? []).filter(
        (word) => !used.has(word),
      );
      if (options.length === 0) break;
      const word = options[Math.floor(random() * options.length)];
      used.add(word);
      words.push(word);
    }
    if (words.length === lengths.length) return { thread, words };
  }
  return null;
};

/** A new puzzle. */
export const generatePuzzle = (random: Random = Math.random): WeavePuzzle => {
  for (;;) {
    const tour = randomTour(random);
    const lengths = randomLengths(random);

    // Cut the tour into pieces, each read one way or the other.
    let at = 0;
    const pieces = lengths.map((length) => {
      const cells = tour.slice(at, (at += length));
      return random() < 0.5 ? cells.reverse() : cells;
    });
    pieces.sort((a, b) => a[0] - b[0]);

    const fitted = fitWords(
      pieces.map((cells) => cells.length),
      random,
    );
    if (!fitted) continue;

    const words = pieces.map((cells, i) => ({ word: fitted.words[i], cells }));
    const grid = Array<string>(CELLS).fill("");
    for (const { word, cells } of words)
      cells.forEach((cell, i) => (grid[cell] = word[i]));

    return { grid: grid.join(""), words, thread: fitted.thread };
  }
};

/** The letters along `cells`, as spelled. */
export const spell = (grid: string, cells: number[]) =>
  cells.map((cell) => grid[cell]).join("");
