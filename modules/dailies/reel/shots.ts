import sharp from "sharp";

/**
 * Telling when two of a film's stills are the same shot.
 *
 * TMDB holds the same picture several times over - recropped, shifted,
 * zoomed, regraded - and showing a player one they've already seen spends a
 * frame for nothing. A whole-picture fingerprint misses all of those, since a
 * shift moves every patch. So one picture is laid over the other at a run of
 * zooms and offsets, and they're the same shot if, somewhere, the part where
 * they overlap matches closely.
 *
 * The cut-off was set by eye on six films. A recrop or regrade scores over
 * 0.9; two photos from one photoshoot - the same pose a moment apart, one
 * vignetted - score 0.77 or so, and are as unfair to show twice. Different
 * shots that merely look alike stayed at 0.73 and below. Dropping a still that
 * was fine costs little, since a film keeps 11 to 19 of its 20 candidates, so
 * it errs that way. Comparing edges instead of brightness was tried and was
 * worse: it splits those photoshoot pairs.
 */

/** Pictures are compared this small: enough to see a shot's shape, cheap to slide. */
const WIDTH = 48;
const HEIGHT = 27;
/** How far one picture is zoomed against the other, each step 6% from the last. */
const ZOOMS: number[] = [];
for (let zoom = 0.6; zoom <= 1.67; zoom *= 1.06) ZOOMS.push(zoom);
/** The overlap has to cover this much of a picture to count. */
const MIN_OVERLAP = 0.5;
/** At or above this, two stills are the same shot. */
export const SAME_SHOT = 0.75;

type Grey = { pixels: Float32Array; width: number; height: number };

/** A still made ready to compare: greyscale, at its own size and every zoom. */
export type Shot = { base: Grey; zoomed: Grey[] };

const greyAt = async (
  image: Buffer,
  width: number,
  height: number,
): Promise<Grey> => ({
  pixels: Float32Array.from(
    await sharp(image)
      .greyscale()
      .resize(width, height, { fit: "fill" })
      .raw()
      .toBuffer(),
  ),
  width,
  height,
});

export const prepareShot = async (image: Buffer): Promise<Shot> => ({
  base: await greyAt(image, WIDTH, HEIGHT),
  zoomed: await Promise.all(
    ZOOMS.map((zoom) =>
      greyAt(image, Math.round(WIDTH * zoom), Math.round(HEIGHT * zoom)),
    ),
  ),
});

/**
 * How well `b`, zoomed and shifted every way, can be made to match `a`: the
 * best correlation of their overlap, from -1 to 1.
 */
export const shotSimilarity = (a: Shot, b: Shot): number => {
  const { base } = a;
  const needed = WIDTH * HEIGHT * MIN_OVERLAP;
  let best = -1;
  for (const over of b.zoomed) {
    for (let dx = 1 - over.width; dx < WIDTH; dx++) {
      for (let dy = 1 - over.height; dy < HEIGHT; dy++) {
        const x0 = Math.max(0, dx);
        const x1 = Math.min(WIDTH, dx + over.width);
        const y0 = Math.max(0, dy);
        const y1 = Math.min(HEIGHT, dy + over.height);
        const n = (x1 - x0) * (y1 - y0);
        if (n < needed || n < over.width * over.height * MIN_OVERLAP) continue;
        let sumA = 0;
        let sumB = 0;
        let sumAA = 0;
        let sumBB = 0;
        let sumAB = 0;
        for (let y = y0; y < y1; y++) {
          for (let x = x0; x < x1; x++) {
            const va = base.pixels[y * WIDTH + x];
            const vb = over.pixels[(y - dy) * over.width + (x - dx)];
            sumA += va;
            sumB += vb;
            sumAA += va * va;
            sumBB += vb * vb;
            sumAB += va * vb;
          }
        }
        const covariance = sumAB - (sumA * sumB) / n;
        const varianceA = sumAA - (sumA * sumA) / n;
        const varianceB = sumBB - (sumB * sumB) / n;
        // A flat patch matches anything; it says nothing.
        if (varianceA > 1 && varianceB > 1)
          best = Math.max(best, covariance / Math.sqrt(varianceA * varianceB));
      }
    }
  }
  return best;
};

export const sameShot = (a: Shot, b: Shot): boolean =>
  shotSimilarity(a, b) >= SAME_SHOT;

/** Lets other work in between comparisons, which take tens of milliseconds each. */
const breathe = () => new Promise((resolve) => setImmediate(resolve));

/**
 * `paths` with every repeat of an earlier one's shot left out, in order. A
 * still that couldn't be fetched to compare is kept: better a rare repeat than
 * a film with too few frames.
 */
export const distinctShots = async (
  paths: string[],
  shots: Map<string, Shot>,
): Promise<string[]> => {
  const kept: string[] = [];
  for (const path of paths) {
    const shot = shots.get(path);
    let repeat = false;
    for (const other of kept) {
      const otherShot = shots.get(other);
      if (!shot || !otherShot) continue;
      await breathe();
      if (sameShot(shot, otherShot)) {
        repeat = true;
        break;
      }
    }
    if (!repeat) kept.push(path);
  }
  return kept;
};
