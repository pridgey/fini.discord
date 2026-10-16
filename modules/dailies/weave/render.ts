import sharp from "sharp";
import { canGuessThread, threadLetters, type WeaveProgress } from "./game";
import { SIZE, colOf, rowOf, type WeavePuzzle } from "./puzzle";

/**
 * Weave's board as an image: the 5x5 letters, each found word coloured along
 * the path it takes, a hinted word's first letter ringed,
 * and below, the thread's letters the found words have shown - not their order.
 */

const TILE = 96;
const GAP = 8;
const MARGIN = 24;
const GRID = SIZE * TILE + (SIZE - 1) * GAP;
const WIDTH = GRID + MARGIN * 2;
const THREAD_TOP = MARGIN + GRID + 34;
const THREAD_BOX = 60;
const HEIGHT = THREAD_TOP + THREAD_BOX + MARGIN + 18;

const BACKGROUND = "#23263a";
const TILE_FILL = "#f3efe6";
const INK = "#23263a";
const HINT_RING = "#f5b301";
/** One colour per word, in grid order: a light fill for its tiles and a strong one for its path. */
const WORD_COLOURS: { fill: string; path: string }[] = [
  { fill: "#f8c9b0", path: "#e2703a" },
  { fill: "#bcdcef", path: "#3b8dc4" },
  { fill: "#cfe8b4", path: "#5fa834" },
  { fill: "#e6c9e3", path: "#a9579f" },
  { fill: "#fbe6a2", path: "#d1a20f" },
];
const FONT = "Archivo, DejaVu Sans, sans-serif";

const tileX = (cell: number) => MARGIN + colOf(cell) * (TILE + GAP);
const tileY = (cell: number) => MARGIN + rowOf(cell) * (TILE + GAP);
const centre = (cell: number) => ({ x: tileX(cell) + TILE / 2, y: tileY(cell) + TILE / 2 });

export type RenderInput = {
  puzzle: WeavePuzzle;
  progress: WeaveProgress;
  /** Show every word, as the next day's answers do. */
  reveal?: boolean;
};

export const weaveBoardSvg = ({ puzzle, progress, reveal = false }: RenderInput): string => {
  const shown = reveal ? puzzle.words.map((_, i) => i) : progress.found;
  const colourOf = new Map<number, (typeof WORD_COLOURS)[number]>();
  for (const index of shown) {
    for (const cell of puzzle.words[index].cells) colourOf.set(cell, WORD_COLOURS[index % WORD_COLOURS.length]);
  }
  const hinted = new Set(
    progress.hinted.filter((i) => !shown.includes(i)).map((i) => puzzle.words[i].cells[0]),
  );

  const tiles = Array.from({ length: SIZE * SIZE }, (_, cell) => {
    const x = tileX(cell);
    const y = tileY(cell);
    const fill = colourOf.get(cell)?.fill ?? TILE_FILL;
    const ring = hinted.has(cell)
      ? `<rect x="${x + 3}" y="${y + 3}" width="${TILE - 6}" height="${TILE - 6}" rx="14" fill="none" stroke="${HINT_RING}" stroke-width="6"/>`
      : "";
    return `<rect x="${x}" y="${y}" width="${TILE}" height="${TILE}" rx="16" fill="${fill}"/>${ring}`;
  });

  // Paths go over the tiles and under the letters, so a word reads as one stroke.
  const paths = shown.map((index) => {
    const { cells } = puzzle.words[index];
    const points = cells.map((cell) => `${centre(cell).x},${centre(cell).y}`).join(" ");
    const colour = WORD_COLOURS[index % WORD_COLOURS.length].path;
    const start = centre(cells[0]);
    return [
      `<polyline points="${points}" fill="none" stroke="${colour}" stroke-width="20" stroke-linecap="round" stroke-linejoin="round" opacity="0.55"/>`,
      `<circle cx="${start.x}" cy="${start.y}" r="34" fill="none" stroke="${colour}" stroke-width="5" opacity="0.8"/>`,
    ].join("");
  });

  const letters = Array.from({ length: SIZE * SIZE }, (_, cell) => {
    const { x, y } = centre(cell);
    return `<text x="${x}" y="${y + 19}" text-anchor="middle" font-family="${FONT}" font-size="54" font-weight="800" fill="${INK}">${puzzle.grid[cell].toUpperCase()}</text>`;
  });

  // The thread: a box per letter. Until it's solved, the boxes hold the
  // letters found so far in alphabetical order - which letters, not where - in
  // one colour, so none can be matched to its word.
  // Once the thread can't be guessed - guessed right or wrong, or every
  // letter showing - the boxes spell it in order: green if the player got it,
  // red if not. Until then its letters stay alphabetical, which isn't a word.
  const solved = reveal || progress.threadGuess === puzzle.thread;
  const over = solved || !canGuessThread(puzzle, progress);
  const threadShown = over ? [...puzzle.thread] : [...threadLetters(puzzle, { ...progress, found: shown })];
  const boxGap = 12;
  const boxes = puzzle.thread.length;
  const boxesWidth = boxes * THREAD_BOX + (boxes - 1) * boxGap;
  const boxesLeft = (WIDTH - boxesWidth) / 2;
  const thread = Array.from({ length: boxes }, (_, i) => {
    const x = boxesLeft + i * (THREAD_BOX + boxGap);
    const letter = threadShown[i];
    const fill = solved ? "#5fa834" : over ? "#c4473f" : letter ? TILE_FILL : "#3a3e57";
    const ink = over ? "#ffffff" : letter ? INK : "#8a8fa8";
    return [
      `<rect x="${x}" y="${THREAD_TOP}" width="${THREAD_BOX}" height="${THREAD_BOX}" rx="12" fill="${fill}"/>`,
      `<text x="${x + THREAD_BOX / 2}" y="${THREAD_TOP + THREAD_BOX / 2 + 13}" text-anchor="middle" font-family="${FONT}" font-size="36" font-weight="800" fill="${ink}">${letter ? letter.toUpperCase() : "?"}</text>`,
    ].join("");
  });

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">`,
    `<rect width="${WIDTH}" height="${HEIGHT}" fill="${BACKGROUND}"/>`,
    ...tiles,
    ...paths,
    ...letters,
    `<text x="${WIDTH / 2}" y="${THREAD_TOP - 12}" text-anchor="middle" font-family="${FONT}" font-size="16" font-weight="800" letter-spacing="4" fill="#b9bdd4">THE THREAD</text>`,
    ...thread,
    "</svg>",
  ].join("");
};

export const WEAVE_IMAGE = "weave.png";

export const renderWeaveBoard = (input: RenderInput): Promise<Buffer> =>
  sharp(Buffer.from(weaveBoardSvg(input))).png().toBuffer();
