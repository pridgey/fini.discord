import { describe, expect, it } from "bun:test";
import {
  CELLS,
  WORD_COUNT,
  adjacent,
  generatePuzzle,
  randomTour,
  spell,
} from "../../modules/dailies/weave/puzzle";
import { WEAVE_WORDS } from "../../modules/dailies/weave/words";

const seeded = (seed: number) => () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 4294967296;
};

describe("Weave puzzles", () => {
  const puzzles = Array.from({ length: 300 }, (_, i) => generatePuzzle(seeded(i * 7919 + 1)));

  it("walk a tour through every square, one step at a time", () => {
    for (let seed = 0; seed < 50; seed++) {
      const tour = randomTour(seeded(seed));
      expect(new Set(tour).size).toBe(CELLS);
      for (let i = 1; i < tour.length; i++) expect(adjacent(tour[i - 1], tour[i])).toBe(true);
    }
  });

  it("hide five real words that use every letter exactly once", () => {
    const known = new Set(WEAVE_WORDS);
    for (const puzzle of puzzles) {
      expect(puzzle.grid).toMatch(/^[a-z]{25}$/);
      expect(puzzle.words).toHaveLength(WORD_COUNT);
      const cells = puzzle.words.flatMap((word) => word.cells);
      expect(new Set(cells).size).toBe(CELLS);
      for (const { word, cells: path } of puzzle.words) {
        expect(known.has(word)).toBe(true);
        expect(word.length).toBeGreaterThanOrEqual(4);
        expect(word.length).toBeLessThanOrEqual(6);
        expect(spell(puzzle.grid, path)).toBe(word);
        for (let i = 1; i < path.length; i++) expect(adjacent(path[i - 1], path[i])).toBe(true);
      }
      expect(new Set(puzzle.words.map((word) => word.word)).size).toBe(WORD_COUNT);
    }
  });

  it("spell the thread with the words' first letters, scattered in no particular order", () => {
    const sorted = (text: string) => [...text].sort().join("");
    let inGridOrder = 0;
    for (const puzzle of puzzles) {
      const starts = puzzle.words.map((word) => word.cells[0]);
      expect([...starts].sort((a, b) => a - b)).toEqual(starts);
      const initials = puzzle.words.map((word) => word.word[0]).join("");
      expect(sorted(initials)).toBe(sorted(puzzle.thread));
      if (initials === puzzle.thread) inGridOrder++;
      expect(WEAVE_WORDS).toContain(puzzle.thread);
      expect(puzzle.words.map((word) => word.word)).not.toContain(puzzle.thread);
    }
    // Reading the grid in order gives the thread away only by chance.
    expect(inGridOrder).toBeLessThan(puzzles.length / 4);
  });

  it("come out the same for the same dice", () => {
    expect(generatePuzzle(seeded(42))).toEqual(generatePuzzle(seeded(42)));
  });
});
