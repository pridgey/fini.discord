import { describe, expect, it } from "bun:test";
import {
  HINTED_WORD_FC,
  MAX_FC,
  NO_PROGRESS,
  THREAD_PRIZES,
  countGuesses,
  stillPossible,
  threadPrizeNow,
  WORD_FC,
  canGuessThread,
  checkWord,
  earned,
  findWord,
  finished,
  guessThread,
  nextHint,
  takeHint,
  threadLetters,
  type WeaveProgress,
} from "../../modules/dailies/weave/game";
import type { WeavePuzzle } from "../../modules/dailies/weave/puzzle";

/*
 * A hand-made board, built from its words so letters and squares agree:
 *   p u r s e      purse along the top
 *   s p e e k      keep, right to left along row 2
 *   e a l f r      seal, down from square 5 then right
 *   l i m g o      frog, right then up and back; milked starts at the m
 *   k e d x x      ...and winds left and down; the two x squares are spare
 */
const WORDS = [
  { word: "purse", cells: [0, 1, 2, 3, 4] },
  { word: "keep", cells: [9, 8, 7, 6] },
  { word: "seal", cells: [5, 10, 11, 12] },
  { word: "frog", cells: [13, 14, 19, 18] },
  { word: "milked", cells: [17, 16, 15, 20, 21, 22] },
];
const grid = Array<string>(25).fill("x");
for (const { word, cells } of WORDS) cells.forEach((cell, i) => (grid[cell] = word[i]));
const P: WeavePuzzle = { grid: grid.join(""), words: WORDS, thread: "pksfm" };

describe("Weave's rules", () => {
  it("knows a typed word is one of the five, whatever its case and spacing", () => {
    expect(checkWord(P, NO_PROGRESS, "  Purse ")).toEqual({ kind: "found", index: 0 });
    expect(checkWord(P, NO_PROGRESS, "MILKED")).toEqual({ kind: "found", index: 4 });
    expect(checkWord(P, NO_PROGRESS, "pursed")).toEqual({ kind: "wrong" });
    expect(checkWord(P, findWord(NO_PROGRESS, 0).progress, "purse")).toEqual({ kind: "already", index: 0 });
  });

  it("pays for each word, less for one found after its hint", () => {
    let progress = NO_PROGRESS;
    expect(nextHint(P, progress)).toBe(0);
    progress = takeHint(P, progress);
    expect(nextHint(P, progress)).toBe(1);
    const first = findWord(progress, 0);
    expect(first.fc).toBe(HINTED_WORD_FC);
    const second = findWord(first.progress, 1);
    expect(second.fc).toBe(WORD_FC);
    expect(findWord(second.progress, 1).fc).toBe(0);
    expect(earned(P, second.progress)).toBe(HINTED_WORD_FC + WORD_FC);
  });

  it("pays more for the thread the fewer of its letters are showing", () => {
    expect(THREAD_PRIZES).toEqual([50, 25, 20, 15, 10]);
    expect(guessThread(P, NO_PROGRESS, " PKSFM ")).toMatchObject({ right: true, fc: 50 });
    let progress = NO_PROGRESS;
    for (const [i, prize] of [25, 20, 15, 10].entries()) {
      progress = findWord(progress, i).progress;
      expect(threadPrizeNow(P, progress)).toBe(prize);
    }
    const guess = guessThread(P, progress, "pksfm");
    expect(guess.fc).toBe(10);
    // The pay is fixed when guessed, and one guess is all there is.
    expect(earned(P, guess.progress)).toBe(4 * WORD_FC + 10);
    expect(guessThread(P, guess.progress, "pksfm").fc).toBe(0);
    expect(guessThread(P, NO_PROGRESS, "wrong")).toMatchObject({ right: false, fc: 0 });
  });

  it("counts a hinted letter as showing, so hints can't buy the thread cheaply", () => {
    let progress = takeHint(P, NO_PROGRESS);
    // Which letters, alphabetically - never where they go.
    expect(threadLetters(P, progress)).toBe("p");
    expect(threadPrizeNow(P, progress)).toBe(25);
    for (let i = 0; i < 4; i++) progress = takeHint(P, progress);
    // All five letters showing through hints: the thread has closed, words unfound or not.
    expect(threadLetters(P, progress)).toBe("fkmps");
    expect(canGuessThread(P, progress)).toBe(false);
    expect(guessThread(P, progress, "pksfm").fc).toBe(0);
  });

  it("says how much is still possible, which hints and showing letters bring down", () => {
    expect(stillPossible(P, NO_PROGRESS)).toBe(MAX_FC);
    expect(MAX_FC).toBe(5 * WORD_FC + 50);
    const hinted = takeHint(P, NO_PROGRESS);
    // One word down to 3 fc, and the thread down to 25.
    expect(stillPossible(P, hinted)).toBe(4 * WORD_FC + HINTED_WORD_FC + 25);
  });

  it("counts word guesses", () => {
    expect(countGuesses(countGuesses(NO_PROGRESS, 1), 2).guesses).toBe(3);
  });

  it("is finished once every word is found, which closes the thread", () => {
    let progress = NO_PROGRESS;
    for (let i = 0; i < 4; i++) progress = findWord(progress, i).progress;
    expect(finished(P, progress)).toBe(false);
    expect(canGuessThread(P, progress)).toBe(true);
    progress = findWord(progress, 4).progress;
    expect(finished(P, progress)).toBe(true);
    expect(canGuessThread(P, progress)).toBe(false);
    expect(guessThread(P, progress, "pksfm")).toMatchObject({ right: false, fc: 0 });
    expect(earned(P, progress)).toBe(5 * WORD_FC);
  });

});
