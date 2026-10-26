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
  answerByName,
  frameCandidates,
  parseGuess,
  pickFrames,
  pickMatch,
} from "../../modules/dailies/reel/tmdb";
import {
  SAME_SHOT,
  distinctShots,
  prepareShot,
  shotSimilarity,
} from "../../modules/dailies/reel/shots";
import { reelBoardText } from "../../modules/dailies/reel/board";
import { chooseFilm, type FilmSource } from "../../modules/dailies/reel/daily";
import { withoutPromo } from "../../modules/dailies/reel/promo";
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

  it("draws from the 20 most-voted stills wide enough to see, best first", () => {
    const images = [
      ...Array.from({ length: 25 }, (_, i) => image(`/f${i}.jpg`, 100 - i)),
      image("/small.jpg", 500, 780),
    ];
    const candidates = frameCandidates(images);
    expect(candidates).toHaveLength(20);
    expect(candidates[0]).toBe("/f0.jpg");
    expect(candidates).not.toContain("/small.jpg");
  });

  it("spreads five frames across the stills, the most-voted last", () => {
    const stills = Array.from({ length: 9 }, (_, i) => `/s${i}.jpg`);
    expect(pickFrames(stills)).toEqual([
      "/s8.jpg",
      "/s6.jpg",
      "/s4.jpg",
      "/s2.jpg",
      "/s0.jpg",
    ]);
    expect(pickFrames(stills.slice(0, 4))).toBeNull();
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

  const DUNES = [
    {
      id: 438631,
      title: "Dune",
      release_date: "2021-09-15",
      vote_count: 15744,
    },
    { id: 841, title: "Dune", release_date: "1984-12-14", vote_count: 3579 },
  ];
  const idOf = (match: ReturnType<typeof pickMatch>) =>
    match && "film" in match ? match.film.movieId : null;
  const choicesOf = (match: ReturnType<typeof pickMatch>) =>
    match && "choices" in match
      ? match.choices.map((film) => film.movieId)
      : null;

  // Whichever film is today's, so being asked gives nothing away.
  it("asks which film a shared title means", () => {
    expect(choicesOf(pickMatch(DUNES, "dune"))).toEqual([438631, 841]);
    expect(pickMatch([], "dune")).toBeNull();
  });

  it("holds a typed year to that film", () => {
    expect(idOf(pickMatch(DUNES, "dune", "2021"))).toBe(438631);
    expect(idOf(pickMatch(DUNES, "dune", "1984"))).toBe(841);
  });

  it("takes the one film with the title typed, however popular its sequels", () => {
    const results = [
      {
        id: 1234821,
        title: "Jurassic World Rebirth",
        release_date: "2025-07-01",
        vote_count: 3885,
      },
      {
        id: 135397,
        title: "Jurassic World",
        release_date: "2015-06-06",
        vote_count: 22059,
      },
      {
        id: 351286,
        title: "Jurassic World: Fallen Kingdom",
        release_date: "2018-06-06",
        vote_count: 13115,
      },
    ];
    expect(idOf(pickMatch(results, "jurassic world"))).toBe(135397);
    // No exact title: offered, nearest title first.
    expect(choicesOf(pickMatch(results, "jurassic"))).toEqual([
      135397, 1234821, 351286,
    ]);
  });

  it("knows the answer by any of its names, held to a typed year", () => {
    const se7en = {
      movieId: 807,
      title: "Se7en",
      year: "1995",
      names: ["Se7en", "Se7en", "The Seven Deadly Sins", "Seven"],
    };
    expect(answerByName(se7en, "seven")?.title).toBe("Se7en");
    expect(answerByName(se7en, "SE7EN")?.movieId).toBe(807);
    expect(answerByName(se7en, "seven", "1995")?.movieId).toBe(807);
    expect(answerByName(se7en, "seven", "2002")).toBeNull();
    expect(answerByName(se7en, "seven samurai")).toBeNull();
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
    expect(pickMatch(results, "interstelar")).toBeNull();
  });
});

describe("telling the same shot apart", () => {
  /** A made-up still: soft blobs of light and dark, the same for a seed. */
  const scene = async (seed: number) => {
    let state = seed;
    const random = () => {
      state = (state * 1664525 + 1013904223) >>> 0;
      return state / 4294967296;
    };
    const blobs = Array.from(
      { length: 14 },
      () =>
        `<circle cx="${random() * 640}" cy="${random() * 360}" r="${20 + random() * 70}" fill="rgb(${Math.round(random() * 255)},${Math.round(random() * 255)},${Math.round(random() * 255)})"/>`,
    ).join("");
    return sharp(
      Buffer.from(
        `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"><rect width="640" height="360" fill="#333"/>${blobs}</svg>`,
      ),
    )
      .blur(4)
      .png()
      .toBuffer();
  };
  /** Part of a still, blown back up to full size: a recrop. */
  const recrop = (still: Buffer, left: number, top: number, width: number) =>
    sharp(still)
      .extract({ left, top, width, height: Math.round((width * 9) / 16) })
      .resize(640, 360)
      .png()
      .toBuffer();

  it("knows a shifted, zoomed or regraded copy for the same shot", async () => {
    const still = await scene(1);
    const [base, shifted, zoomed, regraded] = await Promise.all(
      [
        still,
        await recrop(still, 110, 20, 520),
        await recrop(still, 40, 30, 420),
        await sharp(still)
          .modulate({ brightness: 0.7, hue: 40 })
          .png()
          .toBuffer(),
      ].map(prepareShot),
    );
    for (const copy of [shifted, zoomed, regraded]) {
      expect(shotSimilarity(base, copy)).toBeGreaterThanOrEqual(SAME_SHOT);
    }
  });

  it("tells different shots apart", async () => {
    const [a, b, c] = await Promise.all(
      [1, 2, 3].map(async (seed) => prepareShot(await scene(seed))),
    );
    expect(shotSimilarity(a, b)).toBeLessThan(SAME_SHOT);
    expect(shotSimilarity(a, c)).toBeLessThan(SAME_SHOT);
  });

  it("keeps the first of each shot, in order", async () => {
    const one = await scene(1);
    const shots = new Map([
      ["/a.jpg", await prepareShot(one)],
      ["/b.jpg", await prepareShot(await scene(2))],
      ["/a-again.jpg", await prepareShot(await recrop(one, 60, 10, 560))],
      ["/c.jpg", await prepareShot(await scene(3))],
    ]);
    expect(
      await distinctShots(
        ["/a.jpg", "/b.jpg", "/a-again.jpg", "/c.jpg", "/unfetched.jpg"],
        shots,
      ),
    ).toEqual(["/a.jpg", "/b.jpg", "/c.jpg", "/unfetched.jpg"]);
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

describe("choosing the day's film", () => {
  /** A pool of `pages` pages of 20 films, ids page*100 + i. */
  const source = (
    shown: number[],
    {
      pages = 50,
      noFrames = [] as number[],
    }: { pages?: number; noFrames?: number[] } = {},
  ): FilmSource => ({
    shown: async () =>
      new Map(
        shown.map((id, i) => [
          id,
          {
            day: `2026-01-${String(i + 1).padStart(2, "0")}`,
            title: `Film ${id}`,
            year: "2000",
          },
        ]),
      ),
    page: async (page) =>
      page > pages
        ? []
        : Array.from({ length: 20 }, (_, i) => film(page * 100 + i)),
    frames: async (id) =>
      noFrames.includes(id) ? null : ["/1", "/2", "/3", "/4", "/5"],
    random: seededRandom(4),
  });
  const seededRandom = (seed: number) => () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const everyFilm = Array.from({ length: 50 }, (_, p) =>
    Array.from({ length: 20 }, (_, i) => (p + 1) * 100 + i),
  ).flat();

  it("never picks a film already shown while others haven't been", async () => {
    // All but one film shown: that one's the only choice.
    const left = 3707;
    const round = await chooseFilm(
      "2026-10-20",
      source(everyFilm.filter((id) => id !== left)),
    );
    expect(round?.movie_id).toBe(left);
  });

  it("passes over a film without five good frames", async () => {
    const left = [3707, 3708];
    const round = await chooseFilm(
      "2026-10-20",
      source(
        everyFilm.filter((id) => !left.includes(id)),
        { noFrames: [3707] },
      ),
    );
    expect(round?.movie_id).toBe(3708);
  });

  it("comes round again, oldest first, once every film has been shown", async () => {
    const round = await chooseFilm("2026-10-20", source(everyFilm));
    expect(round?.movie_id).toBe(everyFilm[0]);
    expect(round?.title).toBe(`Film ${everyFilm[0]}`);
  });
});

describe("leaving out promo art", () => {
  const images = new Map([
    ["/still.jpg", true],
    ["/poster.jpg", false],
    ["/unsure.jpg", null],
  ]);
  const judge = async (image: Buffer) => images.get(image.toString()) ?? null;
  const fetchImage = async (path: string) =>
    path === "/gone.jpg" ? null : Buffer.from(path);

  it("drops what's judged promo, and keeps what couldn't be judged", async () => {
    expect(
      await withoutPromo(
        ["/still.jpg", "/poster.jpg", "/unsure.jpg", "/gone.jpg"],
        fetchImage,
        judge,
      ),
    ).toEqual(["/still.jpg", "/unsure.jpg", "/gone.jpg"]);
  });

  it("keeps a still whose judging failed", async () => {
    const failing = async () => {
      throw new Error("API down");
    };
    expect(await withoutPromo(["/a.jpg"], fetchImage, failing)).toEqual([
      "/a.jpg",
    ]);
  });
});
