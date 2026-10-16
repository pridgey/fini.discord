import { describe, expect, it } from "bun:test";
import {
  HINTED_WORD_FC,
  MAX_FC,
  NO_PROGRESS,
  THREAD_FC,
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

  it("pays for each word, less for one found after its hint, and for the thread", () => {
    let progress = NO_PROGRESS;
    expect(nextHint(P, progress)).toBe(0);
    progress = takeHint(P, progress);
    expect(nextHint(P, progress)).toBe(1);
    const first = findWord(progress, 0);
    expect(first.fc).toBe(HINTED_WORD_FC);
    const second = findWord(first.progress, 1);
    expect(second.fc).toBe(WORD_FC);
    expect(findWord(second.progress, 1).fc).toBe(0);
    // Which letters, alphabetically - never where they go.
    expect(threadLetters(P, second.progress)).toBe("kp");
    const guess = guessThread(P, second.progress, " PKSFM ");
    expect(guess).toMatchObject({ right: true, fc: THREAD_FC });
    expect(guessThread(P, guess.progress, "pksfm").fc).toBe(0);
    expect(earned(P, guess.progress)).toBe(HINTED_WORD_FC + WORD_FC + THREAD_FC);
  });

  it("is finished once every word is found, which closes the thread", () => {
    let progress = NO_PROGRESS;
    for (let i = 0; i < 4; i++) progress = findWord(progress, i).progress;
    expect(finished(P, progress)).toBe(false);
    expect(canGuessThread(P, progress)).toBe(true);
    progress = findWord(progress, 4).progress;
    expect(finished(P, progress)).toBe(true);
    // Every first letter is showing now, so the guess has closed.
    expect(canGuessThread(P, progress)).toBe(false);
    expect(guessThread(P, progress, "pksfm")).toMatchObject({ right: false, fc: 0 });
    expect(earned(P, progress)).toBe(5 * WORD_FC);
    expect(MAX_FC).toBe(5 * WORD_FC + THREAD_FC);
  });

});
