import { describe, expect, it } from "bun:test";
import type {
  DailyGuessRecord,
  DailyRoundRecord,
} from "../../modules/dailies/geo/dailyStore";
import sharp from "sharp";
import {
  RECAP_IMAGE,
  dailyPost,
  finishText,
  recapImage,
  recapLines,
  todayLines,
} from "../../modules/dailies/post";
import { generatePuzzle } from "../../modules/dailies/weave/puzzle";
import type {
  WeavePlayRecord,
  WeaveRoundRecord,
} from "../../modules/dailies/weave/store";

const seeded = (seed: number) => () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 4294967296;
};

const geoRound = {
  id: "georound1234567",
  day: "2026-10-18",
  place: { city: "Lyon", province: "Auvergne-Rhône-Alpes", country: "France" },
  photos: ["a.jpg", "b.jpg", "c.jpg"],
  posts: {},
} as unknown as DailyRoundRecord;

/** A guess that climbed the ladder as far as `rung`. */
const guess = (
  username: string,
  total: number,
  { km = 10, rung = "city" }: { km?: number; rung?: string } = {},
) => {
  const ladder = ["continent", "country", "province", "city"];
  const checks = ladder
    .slice(0, ladder.indexOf(rung) + 1)
    .map((kind) => ({ kind, label: kind, outcome: "earned", fc: 1 }));
  return { username, total, km, checks } as DailyGuessRecord;
};

const puzzle = generatePuzzle(seeded(7));
const weaveRound: WeaveRoundRecord = {
  ...puzzle,
  id: "weaveround12345",
  day: "2026-10-18",
  posts: {},
};

const board = (
  username: string,
  found: number[],
  guesses: number,
  finished = false,
): WeavePlayRecord => ({
  id: `play-${username}`,
  round: weaveRound.id,
  server_id: "s",
  user_id: username,
  username,
  found,
  hinted: [],
  thread_guess: "",
  thread_fc: 0,
  guesses,
  paid: found.length * 5,
  finished,
});
const ALL_WORDS = [0, 1, 2, 3, 4];

type Post = ReturnType<typeof dailyPost>;
/** Every text in a post's cards, joined. */
const textOf = (post: Post) =>
  post.components
    .flatMap((card) => card.toJSON().components)
    .map((part) => ("content" in part ? part.content : ""))
    .join("\n");
/** The custom ids of a post's buttons. */
const buttonIds = (post: Post) =>
  JSON.stringify(post.components.map((card) => card.toJSON())).match(
    /(geodaily|weave):[^"]+/g,
  ) ?? [];

describe("the daily post", () => {
  it("recaps yesterday: each answer and the top three", () => {
    const lines = recapLines({
      geo: {
        round: geoRound,
        guesses: [
          guess("Aya", 214),
          guess("Fen", 90),
          guess("Bo", 40),
          guess("Cy", 5),
        ],
      },
      weave: {
        round: weaveRound,
        plays: [
          board("Aya", ALL_WORDS, 9, true),
          board("Fen", [0], 3),
          board("Idle", [], 0),
        ],
      },
    }).join("\n");

    expect(lines).toContain(
      "Where in the world was **Lyon, Auvergne-Rhône-Alpes, France**",
    );
    expect(lines).toContain(
      "🥇 **Aya** 214 fc · 🥈 **Fen** 90 fc · 🥉 **Bo** 40 fc",
    );
    expect(lines).not.toContain("Cy");
    expect(lines).toContain(`thread was **${puzzle.thread.toUpperCase()}**`);
    expect(lines).toContain("🥇 **Aya** 25 fc · 🥈 **Fen** 5 fc");
    // An opened board with nothing played doesn't count.
    expect(lines).not.toContain("Idle");
  });

  it("leaves out a game that wasn't posted yesterday, and the recap when none was", () => {
    expect(recapLines({ geo: null, weave: null })).toEqual([]);
    const geoOnly = recapLines({
      geo: { round: geoRound, guesses: [] },
      weave: null,
    });
    expect(geoOnly.join("\n")).toContain("Nobody played it.");
    expect(geoOnly.join("\n")).not.toContain("Weave");
  });

  it("shows each game's live line: who's played, and who solved Weave, fewest guesses first", () => {
    const text = todayLines({
      geo: { round: geoRound, guesses: [guess("Aya", 214), guess("Fen", 90)] },
      weave: {
        round: weaveRound,
        plays: [
          board("Fen", ALL_WORDS, 12, true),
          board("Aya", ALL_WORDS, 7, true),
          board("Bo", [0, 1], 4),
        ],
      },
    }).join("\n");

    expect(text).toContain(
      "Played by 2 · 🏙️ **Aya**, **Fen** found the city · closest 10 km",
    );
    expect(text).toContain(
      "Solved by **Aya** (7 guesses), **Fen** (12) · 3 playing",
    );
  });

  it("names the best rung reached when nobody has found the city", () => {
    const live = (guesses: DailyGuessRecord[]) =>
      todayLines({ geo: { round: geoRound, guesses }, weave: null }).join("\n");

    expect(
      live([
        guess("Aya", 60, { km: 134, rung: "country" }),
        guess("Fen", 40, { km: 862, rung: "continent" }),
      ]),
    ).toContain("Played by 2 · best so far: the country · closest 134 km");
    expect(live([guess("Bo", 10, { km: 13935, rung: "none" })])).toContain(
      "Played by 1 · nobody's found the continent yet · closest 13,935 km",
    );
  });

  it("names three city finders and counts the rest", () => {
    const finders = ["Aya", "Fen", "Bo", "Cy", "Di"].map((name) =>
      guess(name, 150, { km: 3 }),
    );
    expect(
      todayLines({
        geo: { round: geoRound, guesses: finders },
        weave: null,
      }).join("\n"),
    ).toContain(
      "Played by 5 · 🏙️ **Aya**, **Fen**, **Bo** +2 more found the city · closest 3 km",
    );
  });

  it("says when nobody has played or solved yet", () => {
    const text = todayLines({
      geo: { round: geoRound, guesses: [] },
      weave: { round: weaveRound, plays: [] },
    }).join("\n");

    expect(text).toContain("No guesses yet.");
    expect(text).toContain("Nobody's solved it yet.");
  });

  it("has a button for each of today's games, and none for a game that isn't up", () => {
    const both = dailyPost(
      { geo: null, weave: null },
      {
        geo: { round: geoRound, guesses: [] },
        weave: { round: weaveRound, plays: [] },
      },
    );
    expect(buttonIds(both)).toEqual([
      `geodaily:play:${geoRound.id}`,
      `weave:${weaveRound.id}:open`,
    ]);

    // Weave on trial: only the location game is in the post.
    const geoOnly = dailyPost(
      { geo: null, weave: null },
      { geo: { round: geoRound, guesses: [] }, weave: null },
    );
    expect(textOf(geoOnly)).not.toContain("Weave");
    expect(buttonIds(geoOnly)).toHaveLength(1);
  });

  it("puts Yesterday and Today in cards of their own, a blank line between games", () => {
    const games = {
      geo: { round: geoRound, guesses: [guess("Aya", 214)] },
      weave: { round: weaveRound, plays: [] },
    };
    const post = dailyPost(games, games, { withImage: true });
    const [yesterday, today] = post.components.map((card) => card.toJSON());

    expect(post.components).toHaveLength(2);
    expect(JSON.stringify(yesterday)).toContain("Yesterday");
    expect(JSON.stringify(yesterday)).toContain(`attachment://${RECAP_IMAGE}`);
    expect(JSON.stringify(today)).toContain("Today's dailies");
    expect(textOf(post)).toContain("fc\n\n🧵");
  });

  it("leaves out the Yesterday card when nothing was posted yesterday, and the image when there isn't one", () => {
    const today = { geo: { round: geoRound, guesses: [] }, weave: null };
    expect(
      dailyPost({ geo: null, weave: null }, today).components,
    ).toHaveLength(1);

    const noImage = dailyPost(
      { geo: { round: geoRound, guesses: [] }, weave: null },
      today,
    );
    expect(JSON.stringify(noImage.components[0].toJSON())).not.toContain(
      "attachment://",
    );
  });
});

describe("yesterday's image", () => {
  it("is one short strip, whatever games it holds", async () => {
    const image = await recapImage({
      geo: null,
      weave: { round: weaveRound, plays: [] },
    });
    const { height } = await sharp(image!).metadata();
    expect(height).toBe(360);
    expect(await recapImage({ geo: null, weave: null })).toBeNull();
  });
});

describe("finishing a game", () => {
  it("tells the channel what the player won", () => {
    expect(
      finishText({ game: "geo", name: "graham1", total: 267, cityRight: true }),
    ).toBe(
      "🌍 **graham1** played today's **Where in the World** and won **267 fc**, right down to the city!",
    );
    expect(
      finishText({ game: "geo", name: "Bo", total: 0, cityRight: false }),
    ).toBe(
      "🌍 **Bo** played today's **Where in the World** and came away empty-handed.",
    );
    expect(
      finishText({
        game: "weave",
        name: "Aya",
        guesses: 7,
        fc: 58,
        thread: true,
      }),
    ).toBe(
      "🧵 **Aya** solved today's **Weave**, thread and all, in 7 guesses and won **58 fc**!",
    );
  });
});
