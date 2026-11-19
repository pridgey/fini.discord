import { describe, expect, it } from "bun:test";
import {
  NO_PROGRESS,
  POT,
  WRONG_SOLVE_COST,
  boardWords,
  callLetter,
  canCall,
  currentPrices,
  earned,
  expectedKeep,
  fitsBoard,
  giveUp,
  inBand,
  potOf,
  solve,
  statusOf,
  wrongGuessesOf,
  type GistPuzzle,
} from "../../modules/dailies/gist/game";
import { choosePhrase } from "../../modules/dailies/gist/daily";
import { GIST_PHRASES } from "../../modules/dailies/gist/phrases";

const puzzle: GistPuzzle = {
  category: "Test",
  text: "HOT DOG STAND",
  prices: currentPrices(),
};

describe("prices", () => {
  it("charge more for common letters, at least 1", () => {
    const prices = currentPrices();
    expect(prices.E).toBe(10);
    expect(prices.T).toBeGreaterThan(prices.D);
    expect(prices.Z).toBe(1);
    expect(Object.keys(prices)).toHaveLength(26);
  });

  it("are the round's own, not today's", () => {
    const cheap = { ...puzzle, prices: { ...puzzle.prices, T: 1 } };
    expect(potOf(callLetter(cheap, NO_PROGRESS, "T"))).toBe(POT - 1);
  });
});

describe("calling letters", () => {
  it("logs the price, the hits and the pot after", () => {
    const progress = callLetter(puzzle, NO_PROGRESS, "T");
    expect(progress.moves).toEqual([
      { kind: "letter", letter: "T", price: 7, hits: 2, pot: POT - 7 },
    ]);
    expect(boardWords(puzzle, progress)).toEqual(["__T", "___", "_T___"]);
  });

  it("ignores a letter already called, or one the pot can't cover", () => {
    const once = callLetter(puzzle, NO_PROGRESS, "T");
    expect(callLetter(puzzle, once, "T")).toBe(once);
    const poor = { moves: [{ kind: "give-up" as const, pot: 5 }] };
    expect(canCall(puzzle, { moves: [] }, "E")).toBe(true);
    expect(canCall(puzzle, poor, "E")).toBe(false);
  });

  it("leaves a solve open while anything is in the pot, even with no letter affordable", () => {
    const lean = {
      moves: [
        { kind: "letter" as const, letter: "Q", price: 1, hits: 0, pot: 1 },
      ],
    };
    expect(statusOf(lean)).toBe("playing");
    const { progress } = solve(puzzle, lean, "HOT DOG STAND");
    expect(earned(progress)).toBe(1);
  });
});

describe("fitsBoard", () => {
  const shown = callLetter(puzzle, callLetter(puzzle, NO_PROGRESS, "T"), "O");

  it("accepts a guess that matches what shows", () => {
    expect(fitsBoard(puzzle, shown, "HOT DOG STAND")).toBe(true);
    expect(fitsBoard(puzzle, shown, "POT LOG STAND")).toBe(true);
  });

  it("refuses wrong lengths, moved letters, and called letters in blanks", () => {
    expect(fitsBoard(puzzle, shown, "HOT DOGS STAND")).toBe(false);
    expect(fitsBoard(puzzle, shown, "HAT DOG STAND")).toBe(false);
    expect(fitsBoard(puzzle, shown, "HOT DOG STOND")).toBe(false);
  });
});

describe("solving", () => {
  it("keeps the pot on a right answer, ignoring case and punctuation", () => {
    const { progress, result } = solve(puzzle, NO_PROGRESS, "hot-dog  stand!");
    expect(result).toBe("correct");
    expect(statusOf(progress)).toBe("solved");
    expect(earned(progress)).toBe(POT);
  });

  it("charges for a wrong answer that fits, and logs it", () => {
    const { progress, result } = solve(puzzle, NO_PROGRESS, "HAT BOX SPOON");
    expect(result).toBe("wrong");
    expect(potOf(progress)).toBe(POT - WRONG_SOLVE_COST);
    expect(wrongGuessesOf(progress)).toEqual(["HAT BOX SPOON"]);
  });

  it("logs a guess that can't fit, at no cost", () => {
    const { progress, result } = solve(puzzle, NO_PROGRESS, "HOT DOGS");
    expect(result).toBe("doesnt-fit");
    expect(progress.moves).toEqual([
      { kind: "solve", guess: "HOT DOGS", result: "doesnt-fit", cost: 0, pot: POT },
    ]);
    expect(statusOf(progress)).toBe("playing");
  });

  it("ends the board when a wrong answer empties the pot", () => {
    const low = { moves: [{ kind: "letter" as const, letter: "Q", price: 1, hits: 0, pot: 10 }] };
    const { progress } = solve(puzzle, low, "HAT BOX SPOON");
    expect(potOf(progress)).toBe(0);
    expect(statusOf(progress)).toBe("broke");
    expect(earned(progress)).toBe(0);
  });

  it("pays nothing after giving up", () => {
    const progress = giveUp(callLetter(puzzle, NO_PROGRESS, "T"));
    expect(statusOf(progress)).toBe("gave-up");
    expect(earned(progress)).toBe(0);
    expect(solve(puzzle, progress, "HOT DOG STAND").progress).toBe(progress);
  });
});

describe("the phrase list", () => {
  it("holds about a thousand well-formed phrases", () => {
    expect(GIST_PHRASES.length).toBeGreaterThanOrEqual(1000);
    for (const { text, category } of GIST_PHRASES) {
      expect(text).toMatch(/^[A-Z]+( [A-Z]+)+$/);
      expect(category.length).toBeGreaterThan(0);
      const words = text.split(" ").length;
      const letters = text.replace(/ /g, "").length;
      expect(letters >= 12 || (words >= 3 && letters >= 10)).toBe(true);
    }
  });

  it("has no phrase twice, counting A and THE as the same", () => {
    const cores = GIST_PHRASES.map((p) => p.text.replace(/^(A|AN|THE) /, ""));
    expect(new Set(cores).size).toBe(cores.length);
  });

  it("is mostly inside the difficulty band", () => {
    const fair = GIST_PHRASES.filter(inBand).length;
    expect(fair / GIST_PHRASES.length).toBeGreaterThan(0.9);
  });
});

describe("choosing a phrase", () => {
  const easy = { category: "T", text: "ZZZZ ZZZZ ZZZZ" };
  const fair = { category: "T", text: "BETTER LATE THAN NEVER" };
  const other = { category: "T", text: "ONCE IN A BLUE MOON" };

  it("prefers an unused phrase inside the band", () => {
    expect(expectedKeep(fair)).toBeGreaterThanOrEqual(15);
    expect(choosePhrase(new Map(), [easy, fair], () => 0)).toBe(fair);
    expect(
      choosePhrase(new Map([[fair.text, "2026-11-01"]]), [easy, fair, other], () => 0),
    ).toBe(other);
  });

  it("brings back the one used longest ago once all are used", () => {
    const used = new Map([
      [fair.text, "2026-11-02"],
      [other.text, "2026-11-01"],
    ]);
    expect(choosePhrase(used, [fair, other], () => 0)).toBe(other);
  });
});
