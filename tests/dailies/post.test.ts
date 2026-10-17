import { describe, expect, it } from "bun:test";
import type {
  DailyGuessRecord,
  DailyRoundRecord,
} from "../../modules/dailies/geo/dailyStore";
import { dailyPost, recapLines, todayLines } from "../../modules/dailies/post";
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

const guess = (username: string, total: number) =>
  ({ username, total, km: 10 }) as DailyGuessRecord;

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

    expect(text).toContain("Played by 2 · best **Aya** 214 fc");
    expect(text).toContain(
      "Solved by **Aya** (7 guesses), **Fen** (12) · 3 playing",
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
    const ids = both.components.flatMap((row) =>
      row
        .toJSON()
        .components.map(
          (button) => (button as { custom_id: string }).custom_id,
        ),
    );
    expect(ids).toEqual([
      `geodaily:play:${geoRound.id}`,
      `weave:${weaveRound.id}:open`,
    ]);

    // Weave on trial: only the location game is in the post.
    const geoOnly = dailyPost(
      { geo: null, weave: null },
      { geo: { round: geoRound, guesses: [] }, weave: null },
    );
    expect(geoOnly.content).not.toContain("Weave");
    expect(geoOnly.components[0].toJSON().components).toHaveLength(1);
  });
});
