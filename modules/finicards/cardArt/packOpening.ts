import { readFile } from "fs/promises";
import path from "path";

/**
 * The booster pack: sealed, and opening.
 *
 * Both are files kept with the module, the same for every pack, and only ever
 * read here. The opening is a GIF that plays once and ends on an empty frame,
 * so the first card can take its place. They are drawn by
 * `scripts/finicards/pack-art.ts`, which is where to change how they look.
 */

const ASSETS = path.join(import.meta.dir, "..", "assets");

export const PACK_COVER_FILE = path.join(ASSETS, "booster-pack.png");
export const PACK_OPENING_FILE = path.join(ASSETS, "booster-pack-opening.gif");

/** The opening's timing. The script that draws it reads these. */
export const PACK_OPENING_FRAMES = 40;
export const PACK_OPENING_DELAY_MS = 50;

/** How long the opening takes to play through. */
export const PACK_OPENING_MS = PACK_OPENING_FRAMES * PACK_OPENING_DELAY_MS;

export const PACK_COVER_NAME = "booster-pack.png";
export const PACK_OPENING_NAME = "booster-pack-opening.gif";

let cover: Promise<Buffer> | null = null;
let opening: Promise<Buffer> | null = null;

/** Reads a file once and keeps it; a failed read is tried again next time. */
const kept = (held: Promise<Buffer> | null, file: string, forget: () => void): Promise<Buffer> => {
  if (held) return held;
  const reading = readFile(file);
  reading.catch(forget);
  return reading;
};

/** The sealed pack, as a still. */
export const packCover = (): Promise<Buffer> =>
  (cover = kept(cover, PACK_COVER_FILE, () => (cover = null)));

/** The pack opening, as a GIF that plays once. */
export const packOpeningGif = (): Promise<Buffer> =>
  (opening = kept(opening, PACK_OPENING_FILE, () => (opening = null)));
