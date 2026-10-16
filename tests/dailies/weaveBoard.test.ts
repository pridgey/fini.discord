import { describe, expect, it } from "bun:test";
import sharp from "sharp";
import { boardText, buildBoard } from "../../modules/dailies/weave/board";
import { parseWords, weavePost, weaveResultsText } from "../../modules/dailies/weave/daily";
import { NO_PROGRESS, findWord, takeHint } from "../../modules/dailies/weave/game";
import { generatePuzzle } from "../../modules/dailies/weave/puzzle";
import { weaveBoardSvg } from "../../modules/dailies/weave/render";
import type { WeavePlayRecord, WeaveRoundRecord } from "../../modules/dailies/weave/store";

const seeded = (seed: number) => () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 4294967296;
};

const puzzle = generatePuzzle(seeded(7));
const round: WeaveRoundRecord = { ...puzzle, id: "round123456789a", day: "2026-10-16", posts: {} };
const allFound = () => {
  let progress = NO_PROGRESS;
  for (let i = 0; i < puzzle.words.length; i++) progress = findWord(progress, i).progress;
  return progress;
};

describe("the Weave board", () => {
  it("draws found words, the hint, the thread so far, and every word for the answers", () => {
    const progress = takeHint(puzzle, findWord(NO_PROGRESS, 0).progress);
    const svg = weaveBoardSvg({ puzzle, progress });
    // One path for the found word; every letter showing; the hinted letter ringed in gold.
    expect(svg.match(/<polyline/g)).toHaveLength(1);
    for (const letter of puzzle.grid.toUpperCase()) expect(svg).toContain(`>${letter}</text>`);
    expect(svg).toContain('stroke="#f5b301"');
    // The found word's first letter in the thread; the other four still "?".
    expect(svg.match(/>\?<\/text>/g)).toHaveLength(puzzle.words.length - 1);
    const answers = weaveBoardSvg({ puzzle, progress: NO_PROGRESS, reveal: true });
    expect(answers.match(/<polyline/g)).toHaveLength(puzzle.words.length);
    expect(answers).not.toContain(">?</text>");
  });

  it("is an image with the words, and buttons to guess and hint until every word is found", async () => {
    const board = await buildBoard({ roundId: round.id, puzzle, progress: NO_PROGRESS });
    const meta = await sharp((board.files[0] as any).attachment).metadata();
    expect(meta.format).toBe("png");
    const json = JSON.stringify(board.components[0].toJSON());
    expect(json).toContain("attachment://weave.png");
    for (const action of ["words", "thread", "hint"]) expect(json).toContain(`weave:round123456789a:${action}`);
    const done = JSON.stringify((await buildBoard({ roundId: round.id, puzzle, progress: allFound() })).components[0].toJSON());
    expect(done).not.toContain(":words");
  });

  it("lists the words shortest first, with their lengths, and the thread's letters without their order", () => {
    const text = boardText({ roundId: round.id, puzzle, progress: findWord(NO_PROGRESS, 0).progress });
    const lengths = [...text.matchAll(/\((\d)\)/g)].map((match) => Number(match[1]));
    expect(lengths).toEqual([...lengths].sort((a, b) => a - b));
    expect(text).toContain(`Letters found so far: **${puzzle.words[0].word[0].toUpperCase()}**`);
    expect(text).toContain("in some order");
    // Sections are set apart by blank lines.
    expect(text).toContain("\n\n**Words**\n");
    expect(text).toContain("\n\n**🧵 The thread**\n");
  });

  it("reads one or several typed words, each once", () => {
    expect(parseWords("Purse")).toEqual(["purse"]);
    expect(parseWords(" purse, KEEP  seal,purse ")).toEqual(["purse", "keep", "seal"]);
  });

  it("stops offering the thread once every word is found", () => {
    const text = boardText({ roundId: round.id, puzzle, progress: allFound() });
    expect(text).toContain(`It was **${puzzle.thread.toUpperCase()}**`);
  });

  it("posts the grid as an image, and the next day the answers and who did what", async () => {
    const post = await weavePost(round);
    expect(post.content).toContain("Today's Weave");
    expect(post.files).toHaveLength(1);
    const play: WeavePlayRecord = {
      id: "p",
      round: round.id,
      server_id: "s",
      user_id: "u",
      username: "Weaver",
      found: [0, 1],
      hinted: [],
      thread_guess: puzzle.thread,
      paid: 25,
      finished: false,
    };
    const results = weaveResultsText(round, [play]);
    expect(results).toContain(`the thread was **${puzzle.thread.toUpperCase()}**`);
    expect(results).toContain("🥇 **Weaver** · 25 fc · 2/5 words · thread ✅");
    expect(weaveResultsText(round, [])).toContain("Nobody played it.");
  });
});
