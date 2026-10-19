import { describe, expect, it } from "bun:test";
import sharp from "sharp";
import {
  FRAME_PAY,
  NO_PROGRESS,
  earned,
  finished,
  framesShown,
  guess,
  payNow,
  skip,
  solvedOn,
  type Film,
  type ReelProgress,
} from "../../modules/dailies/reel/game";
import {
  fingerprint,
  parseGuess,
  pickFrames,
  pickMatch,
} from "../../modules/dailies/reel/tmdb";
import { reelBoardText } from "../../modules/dailies/reel/board";
import type { ReelRoundRecord } from "../../modules/dailies/reel/store";

const ANSWER: Film = { movieId: 157336, title: "Interstellar", year: "2014" };
const film = (movieId: number, title = `Film ${movieId}`): Film => ({
  movieId,
  title,
  year: "2000",
});

/** Plays `turns` in order: a Film is a guess, "skip" a skip. */
const play = (...turns: (Film | "skip")[]): ReelProgress =>
  turns.reduce<ReelProgress>((progress, turn) => {
    const result =
      turn === "skip"
        ? skip(ANSWER.movieId, progress)
        : guess(ANSWER.movieId, progress, turn);
    if (!("progress" in result)) throw new Error(`${result.kind} turn`);
    return result.progress;
  }, NO_PROGRESS);

describe("Reel's rules", () => {
  it("pays 30, 25, 20, 10 and 5 for a right guess on frames 1 to 5", () => {
    expect(FRAME_PAY).toEqual([30, 25, 20, 10, 5]);
    const misses = [film(1), "skip", film(2), "skip"] as const;
    for (let frame = 0; frame < 5; frame++) {
      const progress = play(...misses.slice(0, frame), ANSWER);
      expect(earned(ANSWER.movieId, progress)).toBe(FRAME_PAY[frame]);
      expect(solvedOn(ANSWER.movieId, progress)).toBe(frame + 1);
    }
  });

  it("shows one more frame per miss, and every frame once it's over", () => {
    expect(framesShown(ANSWER.movieId, NO_PROGRESS)).toBe(1);
    expect(framesShown(ANSWER.movieId, play(film(1), "skip"))).toBe(3);
    expect(framesShown(ANSWER.movieId, play(ANSWER))).toBe(5);
    expect(payNow(play(film(1)))).toBe(25);
  });

  it("ends after five misses with nothing paid", () => {
    const progress = play(film(1), film(2), "skip", film(3), "skip");
    expect(finished(ANSWER.movieId, progress)).toBe(true);
    expect(earned(ANSWER.movieId, progress)).toBe(0);
    expect(guess(ANSWER.movieId, progress, ANSWER).kind).toBe("over");
    expect(skip(ANSWER.movieId, progress).kind).toBe("over");
  });

  it("doesn't charge a frame for guessing the same film twice", () => {
    const progress = play(film(1));
    const again = guess(ANSWER.movieId, progress, film(1));
    expect(again.kind).toBe("repeat");
    expect(framesShown(ANSWER.movieId, progress)).toBe(2);
  });

  it("takes no turn once solved", () => {
    expect(guess(ANSWER.movieId, play(ANSWER), film(2)).kind).toBe("over");
  });
});

describe("Reel's frames and guesses", () => {
  const image = (file_path: string, vote_count: number, width = 1920) => ({
    file_path,
    vote_count,
    width,
  });

  it("picks five frames from the most-voted, the most-voted last", () => {
    const images = Array.from({ length: 20 }, (_, i) =>
      image(`/f${i}.jpg`, 100 - i),
    );
    const frames = pickFrames(images)!;
    expect(frames).toHaveLength(5);
    expect(frames.at(-1)).toBe("/f0.jpg");
    // Only the 15 most-voted are candidates.
    expect(frames[0]).toBe("/f14.jpg");
    expect(new Set(frames).size).toBe(5);
  });

  it("passes over a still that's the same shot as one already kept", () => {
    const images = Array.from({ length: 6 }, (_, i) =>
      image(`/f${i}.jpg`, 100 - i),
    );
    const print = (bit: boolean) => Array.from({ length: 64 }, () => bit);
    /** Patterns far apart from each other and from all-on or all-off. */
    const unlike = (on: (i: number) => boolean) =>
      Array.from({ length: 64 }, (_, i) => on(i));
    const prints = new Map([
      ["/f0.jpg", print(true)],
      // One bit off /f0: the same shot, recropped.
      ["/f1.jpg", [false, ...print(true).slice(1)]],
      ["/f2.jpg", print(false)],
      ["/f3.jpg", unlike((i) => i % 2 === 0)],
      ["/f4.jpg", unlike((i) => i < 32)],
      ["/f5.jpg", unlike((i) => i % 4 < 2)],
    ]);
    const frames = pickFrames(images, prints)!;
    expect(frames).not.toContain("/f1.jpg");
    expect(frames).toHaveLength(5);
    // Without its repeat there aren't five left among four.
    expect(pickFrames(images.slice(0, 5), prints)).toBeNull();
  });

  it("refuses a film without five frames wide enough to see", () => {
    const images = [
      ...Array.from({ length: 4 }, (_, i) => image(`/ok${i}.jpg`, 10)),
      image("/small.jpg", 50, 780),
    ];
    expect(pickFrames(images)).toBeNull();
  });

  // "Blade Runner 2049" reads as a year too; matchGuess searches the whole
  // text when that year finds nothing.
  it("reads a year off the end of a guess", () => {
    expect(parseGuess("Dune (1984)")).toEqual({ title: "Dune", year: "1984" });
    expect(parseGuess("dune 1984")).toEqual({ title: "dune", year: "1984" });
    expect(parseGuess("Blade Runner 2049")).toEqual({
      title: "Blade Runner",
      year: "2049",
    });
    expect(parseGuess("  Heat ")).toEqual({ title: "Heat" });
  });

  it("matches a shared title to the answer, and otherwise takes the top result", () => {
    const results = [
      {
        id: 438631,
        title: "Dune",
        release_date: "2021-09-15",
        vote_count: 15744,
      },
      { id: 841, title: "Dune", release_date: "1984-12-14", vote_count: 3579 },
    ];
    expect(pickMatch(results, "dune", 841)?.movieId).toBe(841);
    expect(pickMatch(results, "dune", 999)?.movieId).toBe(438631);
    expect(pickMatch(results, "dun", 841)?.movieId).toBe(438631);
    expect(pickMatch([], "dune", 841)).toBeNull();
  });

  it("holds a typed year to that film", () => {
    const results = [
      {
        id: 438631,
        title: "Dune",
        release_date: "2021-09-15",
        vote_count: 15744,
      },
      { id: 841, title: "Dune", release_date: "1984-12-14", vote_count: 3579 },
    ];
    expect(pickMatch(results, "dune", 841, "2021")?.movieId).toBe(438631);
    expect(pickMatch(results, "dune", 841, "1984")?.movieId).toBe(841);
  });

  it("matches nothing rather than a film nobody's heard of", () => {
    const results = [
      {
        id: 1768657,
        title: "Interstelar",
        release_date: "2014-01-01",
        vote_count: 0,
      },
      {
        id: 2,
        title: "Interstellar Wars",
        release_date: "2016-01-01",
        vote_count: 15,
      },
    ];
    expect(pickMatch(results, "interstelar", 157336)).toBeNull();
  });
});

describe("Reel's fingerprints", () => {
  it("are the same for an image and its resize, and differ for another", async () => {
    const gradient = await sharp({
      create: { width: 90, height: 80, channels: 3, background: "#000" },
    })
      .composite([
        {
          input: Buffer.from(
            '<svg width="90" height="80"><defs><linearGradient id="g"><stop offset="0" stop-color="#000"/><stop offset="1" stop-color="#fff"/></linearGradient></defs><rect width="90" height="80" fill="url(#g)"/></svg>',
          ),
        },
      ])
      .png()
      .toBuffer();
    const smaller = await sharp(gradient).resize(45, 40).png().toBuffer();
    const flipped = await sharp(gradient).flop().png().toBuffer();
    const [a, b, c] = await Promise.all(
      [gradient, smaller, flipped].map(fingerprint),
    );
    const apart = (x: boolean[], y: boolean[]) =>
      x.filter((bit, i) => bit !== y[i]).length;
    expect(apart(a, b)).toBeLessThanOrEqual(4);
    expect(apart(a, c)).toBeGreaterThan(40);
  });
});

describe("Reel's board", () => {
  const round: ReelRoundRecord = {
    id: "reelround123456",
    day: "2026-10-19",
    movie_id: ANSWER.movieId,
    title: ANSWER.title,
    year: ANSWER.year,
    frames: ["/1.jpg", "/2.jpg", "/3.jpg", "/4.jpg", "/5.jpg"],
    posts: {},
  };

  it("says which frame it is and what a right guess pays, without the answer", () => {
    const text = reelBoardText({ round, progress: play(film(1, "Gravity")) });
    expect(text).toContain("1. ❌ Gravity (2000)");
    expect(text).toContain(
      "Frame **2** of 5 · 🪙 a right guess pays **25 fc**",
    );
    expect(text).not.toContain("Interstellar");
    expect(text).toContain("TMDB");
  });

  it("names the film once the round is over, either way", () => {
    expect(reelBoardText({ round, progress: play("skip", ANSWER) })).toContain(
      "✅ **Interstellar (2014)** on frame 2 · 🪙 **25 fc**",
    );
    expect(
      reelBoardText({
        round,
        progress: play("skip", "skip", "skip", "skip", "skip"),
      }),
    ).toContain("It was **Interstellar (2014)**");
  });
});
