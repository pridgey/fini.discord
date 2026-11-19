import sharp from "sharp";
import {
  calledOf,
  statusOf,
  type GistProgress,
  type GistPuzzle,
} from "./game";

/**
 * Gist's board as an image: a tile per letter, words kept whole and wrapped
 * onto rows, the category above. Hidden letters are blank slate tiles; shown
 * ones are cream, and the letter just called is gold so the eye goes to what
 * changed. When the board ends the whole phrase shows - green if it was
 * solved, and the letters never found in red if not.
 *
 * Colours and type follow Weave's board, so the dailies look like one set.
 */

const TILE = 56;
const GAP = 6;
const MARGIN = 28;
const LABEL_HEIGHT = 40;
/** Tiles to a row on a player's board: wide, to keep it short. */
export const BOARD_COLUMNS = 14;
/** Tiles to a row in the daily post's recap, which has a squarer cell to fill. */
export const RECAP_COLUMNS = 9;

const BACKGROUND = "#23263a";
const HIDDEN = "#3a3e57";
const HIDDEN_EDGE = "#4a4f6b";
const SHOWN = "#f3efe6";
const JUST_CALLED = "#fbe6a2";
const SOLVED = "#cfe8b4";
const INK = "#23263a";
const MISSED_INK = "#e88a83";
const LABEL = "#b9bdd4";
const FONT = "Archivo, DejaVu Sans, sans-serif";

const escape = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Words packed onto rows of at most `columns` tiles, a blank tile between words. */
export const layoutRows = (words: string[], columns: number): string[][] => {
  const rows: string[][] = [[]];
  let used = 0;
  for (const word of words) {
    const row = rows[rows.length - 1];
    const needed = row.length ? used + 1 + word.length : word.length;
    if (row.length && needed > columns) {
      rows.push([word]);
      used = word.length;
    } else {
      row.push(word);
      used = needed;
    }
  }
  return rows;
};

export type GistRenderInput = {
  puzzle: GistPuzzle;
  progress: GistProgress;
  /** The letter just called, drawn gold where it shows. */
  highlight?: string;
  /** Show the whole phrase as solved, as the next day's recap does. */
  reveal?: boolean;
  columns?: number;
};

export const gistBoardSvg = ({
  puzzle,
  progress,
  highlight,
  reveal = false,
  columns = BOARD_COLUMNS,
}: GistRenderInput): string => {
  const words = puzzle.text.split(" ");
  // Never narrower than the longest word, which can't be split.
  const width = Math.max(columns, ...words.map((w) => w.length));
  const rows = layoutRows(words, width);
  const status = reveal ? "solved" : statusOf(progress);
  const over = status !== "playing";
  const solved = status === "solved";
  const called = calledOf(progress);
  const imageWidth = MARGIN * 2 + width * TILE + (width - 1) * GAP;
  const height =
    MARGIN * 2 + LABEL_HEIGHT + rows.length * TILE + (rows.length - 1) * GAP;

  const tiles: string[] = [];
  rows.forEach((rowWords, r) => {
    const tilesInRow =
      rowWords.reduce((n, w) => n + w.length, 0) + rowWords.length - 1;
    const rowWidth = tilesInRow * TILE + (tilesInRow - 1) * GAP;
    let x = (imageWidth - rowWidth) / 2;
    const y = MARGIN + LABEL_HEIGHT + r * (TILE + GAP);

    for (const word of rowWords) {
      for (const letter of word) {
        const shown = called.includes(letter);
        const fill = solved
          ? SOLVED
          : shown
            ? letter === highlight
              ? JUST_CALLED
              : SHOWN
            : HIDDEN;
        const edge =
          fill === HIDDEN ? ` stroke="${HIDDEN_EDGE}" stroke-width="2"` : "";
        const ink = shown || solved ? INK : MISSED_INK;

        tiles.push(
          `<rect x="${x}" y="${y}" width="${TILE}" height="${TILE}" rx="10" fill="${fill}"${edge}/>`,
        );
        if (shown || over) {
          tiles.push(
            `<text x="${x + TILE / 2}" y="${y + TILE / 2 + 12}" text-anchor="middle" font-family="${FONT}" font-size="34" font-weight="800" fill="${ink}">${letter}</text>`,
          );
        }
        x += TILE + GAP;
      }
      x += TILE + GAP;
    }
  });

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${imageWidth}" height="${height}" viewBox="0 0 ${imageWidth} ${height}">`,
    `<rect width="${imageWidth}" height="${height}" fill="${BACKGROUND}"/>`,
    `<text x="${imageWidth / 2}" y="${MARGIN + 18}" text-anchor="middle" font-family="${FONT}" font-size="18" font-weight="800" letter-spacing="5" fill="${LABEL}">${escape(puzzle.category.toUpperCase())}</text>`,
    ...tiles,
    "</svg>",
  ].join("");
};

export const GIST_IMAGE = "gist.png";

export const renderGistBoard = (input: GistRenderInput): Promise<Buffer> =>
  sharp(Buffer.from(gistBoardSvg(input))).png().toBuffer();
