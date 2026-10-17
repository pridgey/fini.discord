import { describe, expect, it } from "bun:test";

// A shared mock replaces this module for most suites, and Bun applies
// mock.module to the whole run. Importing it under a query gives this test
// its own, real copy.
const UNMOCKED = "../../utilities/splitBigString.ts?unmocked";
type SplitModule = typeof import("../../utilities/splitBigString");
const { splitBigString } = (await import(UNMOCKED)) as SplitModule;

const LIMIT = 1990;
const fences = (text: string) => (text.match(/```/g) ?? []).length;
/**
 * The text with its code fences and line breaks taken out - all that the
 * split may add - so pieces and original can be compared.
 */
const withoutFences = (text: string) =>
  text
    .replace(/```\w{0,20}\n/g, "")
    .replace(/```/g, "")
    .replace(/\n/g, "");

describe("splitBigString", () => {
  it("leaves short text alone", () => {
    expect(splitBigString("hello")).toEqual(["hello"]);
  });

  it("splits at spaces, losing nothing", () => {
    const text = "word ".repeat(1000);
    const pieces = splitBigString(text);

    expect(pieces.length).toBeGreaterThan(1);
    for (const piece of pieces) expect(piece.length).toBeLessThanOrEqual(LIMIT);
    expect(pieces.join("")).toBe(text);
  });

  it("hard-splits a run with no spaces, such as a long link", () => {
    const text = `https://example.org/${"x".repeat(5000)}`;
    const pieces = splitBigString(text);

    for (const piece of pieces) expect(piece.length).toBeLessThanOrEqual(LIMIT);
    expect(pieces.join("")).toBe(text);
  });

  it("closes a code block at the end of a piece and reopens it, language and all", () => {
    const text = `intro\n\`\`\`ts\n${"const a = 1;\n".repeat(250)}\`\`\`\nafter`;
    const pieces = splitBigString(text);

    expect(pieces.length).toBeGreaterThan(1);
    for (const piece of pieces) {
      expect(piece.length).toBeLessThanOrEqual(LIMIT);
      expect(fences(piece) % 2).toBe(0);
    }
    expect(pieces[1].startsWith("```ts\n")).toBe(true);
  });

  // A fence running straight into a long unbroken run once had the whole run
  // taken for the block's language: every reopened piece began with it, the
  // text never shrank, and the loop ran forever.
  it("finishes when a fence runs straight into unbroken text", () => {
    const text = `intro \`\`\`${"x".repeat(5000)} end`;
    const pieces = splitBigString(text);

    for (const piece of pieces) expect(piece.length).toBeLessThanOrEqual(LIMIT);
    expect(withoutFences(pieces.join(""))).toBe(withoutFences(text));
  });

  it("adds nothing when asked not to, for text that is stored and rejoined", () => {
    const text = `\`\`\`\n${"line\n".repeat(2000)}\`\`\``;
    const pieces = splitBigString(text, {
      maxLength: 4000,
      closeCodeBlocks: false,
    });

    for (const piece of pieces) expect(piece.length).toBeLessThanOrEqual(4000);
    expect(pieces.join("")).toBe(text);
  });

  it("always finishes, fits, and keeps the text, whatever it's given", () => {
    const words = [
      "a",
      "word",
      "```",
      "```js",
      "\n",
      " ",
      "x".repeat(300),
      "x".repeat(2500),
      "```js\n",
      "longer words here",
    ];
    for (let run = 0; run < 200; run++) {
      let text = "";
      while (text.length < 8000) {
        text +=
          words[Math.floor(Math.random() * words.length)] +
          (Math.random() < 0.5 ? " " : "");
      }
      const pieces = splitBigString(text);

      for (const piece of pieces)
        expect(piece.length).toBeLessThanOrEqual(LIMIT);
      expect(withoutFences(pieces.join(""))).toBe(withoutFences(text));
      // Every piece but the last closes what it opens; the last ends the way the text does.
      for (const piece of pieces.slice(0, -1))
        expect(fences(piece) % 2).toBe(0);
    }
  });
});
