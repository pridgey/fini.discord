import { describe, expect, it } from "bun:test";
import sharp from "sharp";
import { boardText, buildBoard } from "../../modules/dailies/weave/board";
import { parseWords, solvedMessage } from "../../modules/dailies/weave/daily";
import {
  NO_PROGRESS,
  countGuesses,
  findWord,
  takeHint,
} from "../../modules/dailies/weave/game";
import { generatePuzzle } from "../../modules/dailies/weave/puzzle";
import { weaveBoardSvg } from "../../modules/dailies/weave/render";
import type { WeaveRoundRecord } from "../../modules/dailies/weave/store";

const seeded = (seed: number) => () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 4294967296;
};

const puzzle = generatePuzzle(seeded(7));
const round: WeaveRoundRecord = {
  ...puzzle,
  id: "round123456789a",
  day: "2026-10-16",
  posts: {},
};
const allFound = () => {
  let progress = NO_PROGRESS;
  for (let i = 0; i < puzzle.words.length; i++)
    progress = findWord(progress, i).progress;
  return progress;
};

describe("the Weave board", () => {
  it("draws found words, the hint, the thread so far, and every word for the answers", () => {
    const progress = takeHint(puzzle, findWord(NO_PROGRESS, 0).progress);
    const svg = weaveBoardSvg({ puzzle, progress });
    // One path for the found word; every letter showing; the hinted letter ringed in gold.
    expect(svg.match(/<polyline/g)).toHaveLength(1);
    for (const letter of puzzle.grid.toUpperCase())
      expect(svg).toContain(`>${letter}</text>`);
    expect(svg).toContain('stroke="#f5b301"');
    // The found word's and the hinted word's letters in the thread; the other three still "?".
    expect(svg.match(/>\?<\/text>/g)).toHaveLength(puzzle.words.length - 2);
    const answers = weaveBoardSvg({
      puzzle,
      progress: NO_PROGRESS,
      reveal: true,
    });
    expect(answers.match(/<polyline/g)).toHaveLength(puzzle.words.length);
    expect(answers).not.toContain(">?</text>");
  });

  it("spells the thread in order once it can't be guessed, never its letters sorted into a non-word", () => {
    const missed = { ...allFound(), threadGuess: "wrong" };
    const svg = weaveBoardSvg({ puzzle, progress: missed });
    const boxes = [...svg.matchAll(/font-size="36"[^>]*>([A-Z?])<\/text>/g)]
      .map((match) => match[1])
      .join("");
    expect(boxes).toBe(puzzle.thread.toUpperCase());
    expect(svg).toContain('fill="#c4473f"');
    expect(
      boardText({ roundId: round.id, puzzle, progress: missed }),
    ).toContain(
      `You guessed **WRONG**. It was **${puzzle.thread.toUpperCase()}**.`,
    );
  });

  it("is an image with the words, and buttons to guess and hint until every word is found", async () => {
    const board = await buildBoard({
      roundId: round.id,
      puzzle,
      progress: NO_PROGRESS,
    });
    const meta = await sharp((board.files[0] as any).attachment).metadata();
    expect(meta.format).toBe("png");
    const json = JSON.stringify(board.components[0].toJSON());
    expect(json).toContain("attachment://weave.png");
    for (const action of ["words", "thread", "hint"])
      expect(json).toContain(`weave:round123456789a:${action}`);
    const done = JSON.stringify(
      (
        await buildBoard({ roundId: round.id, puzzle, progress: allFound() })
      ).components[0].toJSON(),
    );
    expect(done).not.toContain(":words");
  });

  it("lists the words shortest first, with their lengths, and the thread's letters without their order", () => {
    const text = boardText({
      roundId: round.id,
      puzzle,
      progress: findWord(NO_PROGRESS, 0).progress,
    });
    const lengths = [...text.matchAll(/\((\d)\)/g)].map((match) =>
      Number(match[1]),
    );
    expect(lengths).toEqual([...lengths].sort((a, b) => a - b));
    expect(text).toContain(
      `Letters showing: **${puzzle.words[0].word[0].toUpperCase()}**`,
    );
    // One letter showing: the thread is worth 25 now, and the board says so.
    expect(text).toContain("A right guess now pays **25 fc**");
    expect(text).toContain("so far · up to **50 fc**");
    expect(text).toContain("in some order");
    // Sections are set apart by blank lines.
    expect(text).toContain("\n\n**Words**\n");
    expect(text).toContain("\n\n**🧵 The thread**\n");
  });

  it("puts what the last guess did in a card of its own under the board, coloured by how it went", async () => {
    const wrong = await buildBoard({
      roundId: round.id,
      puzzle,
      progress: NO_PROGRESS,
      note: "❌ **ZEBRA** isn't one of the words.",
    });
    expect(wrong.components).toHaveLength(2);
    const card = wrong.components[1].toJSON() as any;
    expect(card.accent_color).toBe(0xd9534f);
    expect(JSON.stringify(card)).toContain("ZEBRA");
    expect(JSON.stringify(wrong.components[0].toJSON())).not.toContain("ZEBRA");
    const right = await buildBoard({
      roundId: round.id,
      puzzle,
      progress: NO_PROGRESS,
      note: "✅ **PURSE** · +5 fc\n❌ **ZEBRA** isn't one of the words.",
    });
    expect((right.components[1].toJSON() as any).accent_color).toBe(0x5fa834);
    expect(
      (await buildBoard({ roundId: round.id, puzzle, progress: NO_PROGRESS }))
        .components,
    ).toHaveLength(1);
  });

  it("announces a solve with the guesses it took and what it won", () => {
    let progress = countGuesses(NO_PROGRESS, 7);
    for (let i = 0; i < puzzle.words.length; i++)
      progress = findWord(progress, i).progress;
    expect(solvedMessage({ displayName: "Aya" }, progress, puzzle)).toBe(
      "🧵 **Aya** solved today's Weave in 7 guesses and won **25 fc**!",
    );
    const withThread = {
      ...progress,
      threadGuess: puzzle.thread,
      threadFc: 50,
    };
    expect(solvedMessage({ displayName: "Aya" }, withThread, puzzle)).toContain(
      "Weave, thread and all, in 7 guesses and won **75 fc**",
    );
  });

  it("reads one or several typed words, each once", () => {
    expect(parseWords("Purse")).toEqual(["purse"]);
    expect(parseWords(" purse, KEEP  seal,purse ")).toEqual([
      "purse",
      "keep",
      "seal",
    ]);
  });

  it("stops offering the thread once every word is found", () => {
    const text = boardText({ roundId: round.id, puzzle, progress: allFound() });
    expect(text).toContain(`It was **${puzzle.thread.toUpperCase()}**`);
  });
});
