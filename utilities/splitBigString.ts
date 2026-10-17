/** Discord's limit is 2000; a little room is left for a prefix such as a heading. */
const DEFAULT_MAX_LENGTH = 1990;

const FENCE = "```";
const CLOSING_FENCE = `\n${FENCE}`;

export type SplitOptions = {
  /** The longest a piece may be. */
  maxLength?: number;
  /**
   * Close a code block that a piece ends inside, and reopen it (with its
   * language) at the start of the next, so each message renders on its own.
   * Off for text that is split only to be stored and joined back together.
   */
  closeCodeBlocks?: boolean;
};

/**
 * The shortest piece cut at a space. Below this, the piece is cut at the
 * limit instead - which also guarantees every cut is longer than the fence
 * that may be added to the next piece, so the text always shrinks.
 */
const MIN_PIECE = 64;

/**
 * Where to end a piece of `text` that must be at most `limit` long: at a line
 * break in the last quarter, else after the last space, else - for a run with
 * no spaces, such as a long link - right at the limit.
 */
const cutPoint = (text: string, limit: number): number => {
  const window = text.slice(0, limit);
  const lastNewline = window.lastIndexOf("\n");
  if (lastNewline > limit * 0.75) return lastNewline + 1;
  const lastSpace = window.lastIndexOf(" ");
  if (lastSpace >= MIN_PIECE) return lastSpace + 1;
  return limit;
};

/**
 * The code block a piece of text ends inside, as the fence that reopens it
 * ("```ts"), or null. A language is a short word straight after the fence and
 * on its own line; anything else is code, and the block reopens plain.
 */
const openFenceAtEnd = (text: string): string | null => {
  const fences = [...text.matchAll(/```/g)];
  if (fences.length % 2 === 0) return null;
  const opening = fences[fences.length - 1].index;
  const language = text.slice(opening).match(/^```(\w{1,20})\n/)?.[1] ?? "";
  return FENCE + language;
};

/**
 * Breaks text into pieces short enough for a Discord message. Nothing is lost:
 * joined back together the pieces are the original text, apart from the code
 * fences added to close and reopen a block that spans two pieces.
 */
export const splitBigString = (
  text: string,
  { maxLength = DEFAULT_MAX_LENGTH, closeCodeBlocks = true }: SplitOptions = {},
): string[] => {
  const pieces: string[] = [];
  let rest = text;

  while (rest.length > maxLength) {
    // Leave room to close a code block, in case this piece ends inside one.
    const room = closeCodeBlocks ? maxLength - CLOSING_FENCE.length : maxLength;
    const cut = cutPoint(rest, room);
    let piece = rest.slice(0, cut);
    rest = rest.slice(cut);

    const openFence = closeCodeBlocks ? openFenceAtEnd(piece) : null;
    if (openFence) {
      piece += CLOSING_FENCE;
      rest = `${openFence}\n${rest}`;
    }
    pieces.push(piece);
  }

  pieces.push(rest);
  return pieces;
};
