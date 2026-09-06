import { describe, expect, it } from "bun:test";
import {
  HORSE_COUNT,
  PAYOUTS,
  TRACK_LENGTH,
  type Horse,
  drawTrack,
  ordinal,
  payoutForPlace,
  placeOf,
  rankHorses,
  runRace,
  selectFrames,
} from "../../modules/games/horsey/horseyUtilities";

/** A finished race with the given final distances, in horse order. */
const raceEndingAt = (finals: number[]): Horse[] =>
  finals.map((final, index) => ({ id: index + 1, positions: [0, final] }));

describe("runRace", () => {
  it("runs every horse", () => {
    const horses = runRace();

    expect(horses).toHaveLength(HORSE_COUNT);
    expect(horses.map((horse) => horse.id)).toEqual([1, 2, 3, 4, 5]);
  });

  // Frames are drawn by index across all horses, so a ragged race would read
  // off the end of the shorter arrays mid-animation.
  it("records the same number of steps for every horse", () => {
    const horses = runRace();
    const lengths = new Set(horses.map((horse) => horse.positions.length));

    expect(lengths.size).toBe(1);
  });

  it("starts every horse at the gate and never sends one backwards", () => {
    for (const horse of runRace()) {
      expect(horse.positions[0]).toBe(0);

      horse.positions.forEach((position, index) => {
        if (index === 0) return;
        expect(position).toBeGreaterThanOrEqual(horse.positions[index - 1]);
      });
    }
  });

  it("stops as soon as someone crosses, and never past the line", () => {
    const horses = runRace();
    const finals = horses.map((horse) => horse.positions.at(-1)!);

    expect(Math.max(...finals)).toBe(TRACK_LENGTH);
    for (const final of finals) expect(final).toBeLessThanOrEqual(TRACK_LENGTH);
  });

  // No horse number should be worth more than another. Run enough races that a
  // systematically favoured lane would show up, without being flaky about it.
  it("does not favour any particular horse", () => {
    const wins = new Array(HORSE_COUNT).fill(0);

    for (let race = 0; race < 400; race++) {
      const horses = runRace();
      rankHorses(horses).forEach((place, index) => {
        if (place === 1) wins[index] += 1;
      });
    }

    // Ties mean total wins exceed the race count, so compare each horse
    // against the average rather than against a fixed share.
    const average = wins.reduce((sum, count) => sum + count, 0) / HORSE_COUNT;
    for (const count of wins) {
      expect(count).toBeGreaterThan(average * 0.5);
      expect(count).toBeLessThan(average * 1.5);
    }
  });
});

describe("rankHorses", () => {
  it("places the furthest horse first", () => {
    expect(rankHorses(raceEndingAt([10, 24, 15, 3, 8]))).toEqual([3, 1, 2, 5, 4]);
  });

  // Horses move in whole steps and the race stops the moment anyone crosses,
  // so dead heats are common rather than exotic.
  it("gives tied horses the same place and skips the one they consumed", () => {
    expect(rankHorses(raceEndingAt([24, 24, 20, 5, 5]))).toEqual([1, 1, 3, 4, 4]);
  });

  it("handles a five-way tie", () => {
    expect(rankHorses(raceEndingAt([24, 24, 24, 24, 24]))).toEqual([
      1, 1, 1, 1, 1,
    ]);
  });
});

describe("placeOf", () => {
  it("finds the place of the horse that was backed", () => {
    const horses = raceEndingAt([10, 24, 15, 3, 8]);

    expect(placeOf(horses, 2)).toBe(1);
    expect(placeOf(horses, 4)).toBe(5);
  });

  /*
   * The original paid 3x for a horse that never ran. findIndex returned -1,
   * and because -1 is truthy it survived `guessIndex || 0`, indexed the
   * rankings array to undefined, and `undefined || 0` resolved to the
   * first-place slot. Betting on horse 9 was a guaranteed win.
   */
  it.each([0, 6, 9, -1, 99])(
    "returns no place for horse %p, which never ran",
    (horseId) => {
      const horses = raceEndingAt([10, 24, 15, 3, 8]);

      expect(placeOf(horses, horseId)).toBe(0);
      expect(payoutForPlace(placeOf(horses, horseId))).toBe(0);
    },
  );
});

describe("payoutForPlace", () => {
  it("pays the advertised multiples", () => {
    expect(payoutForPlace(1)).toBe(3);
    expect(payoutForPlace(2)).toBe(1.5);
    expect(payoutForPlace(3)).toBe(0.5);
  });

  it.each([4, 5, 0])("pays nothing for place %p", (place) => {
    expect(payoutForPlace(place)).toBe(0);
  });

  /*
   * These multiples are total return, not profit, and that is what makes the
   * game break even over five horses. If someone adds a payout or a horse, this
   * is the test that should stop them shipping a money printer.
   */
  it("is break-even across the field", () => {
    const totalReturn = Object.values(PAYOUTS).reduce(
      (sum, multiplier) => sum + multiplier,
      0,
    );

    expect(totalReturn / HORSE_COUNT).toBe(1);
  });
});

describe("ordinal", () => {
  // The original rendered second place as "1nd": it looked the suffix up by
  // rank index while printing a rank number, and the two were off by one.
  it.each([
    [1, "1st"],
    [2, "2nd"],
    [3, "3rd"],
    [4, "4th"],
    [5, "5th"],
  ])("renders %p as %p", (place, expected) => {
    expect(ordinal(place)).toBe(expected);
  });
});

describe("selectFrames", () => {
  it("never shows more frames than asked for", () => {
    expect(selectFrames(30, 5).length).toBeLessThanOrEqual(5);
  });

  it("always ends on the finish, which is the frame that shows the winner", () => {
    for (const steps of [1, 2, 8, 17, 30]) {
      expect(selectFrames(steps, 5).at(-1)).toBe(steps - 1);
    }
  });

  it("starts at the gate and runs forwards", () => {
    const frames = selectFrames(30, 5);

    expect(frames[0]).toBe(0);
    expect([...frames].sort((a, b) => a - b)).toEqual(frames);
  });

  it("does not repeat a frame when the race is shorter than the frame count", () => {
    const frames = selectFrames(3, 5);

    expect(new Set(frames).size).toBe(frames.length);
  });

  it("copes with a race that somehow had no steps", () => {
    expect(selectFrames(0, 5)).toEqual([0]);
  });
});

describe("drawTrack", () => {
  it("draws one lane per horse", () => {
    const track = drawTrack(raceEndingAt([1, 2, 3, 4, 5]), 1);
    const lanes = track.split("\n").filter((line) => line.includes("🏇"));

    expect(lanes).toHaveLength(HORSE_COUNT);
  });

  it("keeps every lane the same width so the track doesn't wobble", () => {
    const track = drawTrack(raceEndingAt([0, 6, 12, 18, TRACK_LENGTH]), 1);
    const widths = track
      .split("\n")
      .filter((line) => line.includes("🏇"))
      .map((line) => line.length);

    expect(new Set(widths).size).toBe(1);
  });

  describe("with names", () => {
    const names = ["Alpha", "Bravo", "Charlie", "Delta", "Echo"];

    it("shows each horse's name in its lane", () => {
      const track = drawTrack(raceEndingAt([1, 2, 3, 4, 5]), 1, names);

      for (const name of names) expect(track).toContain(name);
    });

    // Ragged labels stagger the starting gates, so the field looks like it set
    // off at different times before the race has even begun.
    it("aligns the gates however long the names are", () => {
      const uneven = ["A", "Bartholomew", "Cy", "Dee", "Ethelred"];
      const gates = drawTrack(raceEndingAt([0, 0, 0, 0, 0]), 0, uneven)
        .split("\n")
        .filter((line) => line.includes("🏇"))
        .map((line) => line.indexOf("|"));

      expect(new Set(gates).size).toBe(1);
    });

    it("truncates a long name rather than pushing the track off screen", () => {
      const track = drawTrack(
        raceEndingAt([0, 0, 0, 0, 0]),
        0,
        ["x".repeat(32), "b", "c", "d", "e"],
      );
      const widths = track
        .split("\n")
        .filter((line) => line.includes("🏇"))
        .map((line) => line.length);

      expect(new Set(widths).size).toBe(1);
    });

    it("still draws numbered lanes when no names are given", () => {
      const track = drawTrack(raceEndingAt([1, 2, 3, 4, 5]), 1);

      expect(track).toContain("1 |");
      expect(track).not.toContain("Alpha");
    });
  });

  // The animation may be asked for a frame past a horse's last recorded step;
  // it should hold at the finish rather than render undefined.
  it("clamps a step beyond the end of the race", () => {
    const horses = raceEndingAt([TRACK_LENGTH, 5, 5, 5, 5]);

    expect(() => drawTrack(horses, 99)).not.toThrow();
    expect(drawTrack(horses, 99)).toBe(drawTrack(horses, 1));
  });
});
