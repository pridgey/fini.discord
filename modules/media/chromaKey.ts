/**
 * Chroma key colour parsing for `/convert`.
 *
 * Everything here exists to turn whatever someone typed into a value ffmpeg
 * will accept, and to guarantee that value is a fixed shape. ffmpeg colour
 * syntax is permissive - it takes names, `#rrggbb`, and an `@alpha` suffix -
 * and the filter string it ends up in is comma and colon delimited. Rather
 * than try to escape all of that, the parser only ever emits `0xRRGGBB`, so a
 * colour can never carry a delimiter into the filter graph.
 */

/**
 * Names accepted for convenience. `green` and `blue` are the pure primaries,
 * which is what a colour picker gives you; `greenscreen` and `bluescreen` are
 * the Rosco paint shades real studio cycs are painted, which is what actual
 * footage tends to contain.
 */
export const NAMED_CHROMA_COLORS: Record<string, string> = {
  green: "0x00FF00",
  greenscreen: "0x00B140",
  blue: "0x0000FF",
  bluescreen: "0x0047BB",
  red: "0xFF0000",
  magenta: "0xFF00FF",
  cyan: "0x00FFFF",
  yellow: "0xFFFF00",
  white: "0xFFFFFF",
  black: "0x000000",
};

/**
 * How much a pixel may differ from the key colour and still be keyed, and how
 * softly the edge falls off.
 *
 * ffmpeg's own defaults are 0.01/0 - a near-exact match with a hard edge,
 * which keys almost nothing on real footage because compression smears the
 * backdrop into dozens of nearby greens. These are the values that make an
 * unattended key produce something usable; the options exist for tuning from
 * there.
 */
export const DEFAULT_SIMILARITY = 0.3;
export const DEFAULT_BLEND = 0.1;

export const MIN_SIMILARITY = 0.01;
export const MAX_SIMILARITY = 1;
export const MIN_BLEND = 0;
export const MAX_BLEND = 1;

export type ChromaKey = {
  /** Always `0x` followed by six hex digits. */
  color: string;
  similarity: number;
  blend: number;
};

/**
 * Parses a user-supplied colour.
 *
 * Accepts a name from the table above, or hex as `#00ff00`, `00ff00`,
 * `0x00ff00`, or the three-digit `#0f0` shorthand.
 * @param input Whatever was typed into the option
 * @returns `0xRRGGBB`, or null if it is not a colour we recognise
 */
export const parseChromaColor = (input: string): string | null => {
  const trimmed = input.trim().toLowerCase();
  if (!trimmed) return null;

  const named = NAMED_CHROMA_COLORS[trimmed];
  if (named) return named;

  const hex = trimmed.replace(/^#/, "").replace(/^0x/, "");

  if (/^[0-9a-f]{3}$/.test(hex)) {
    // #0f0 means #00ff00 - each digit doubles.
    const expanded = [...hex].map((digit) => digit + digit).join("");
    return `0x${expanded.toUpperCase()}`;
  }

  if (/^[0-9a-f]{6}$/.test(hex)) {
    return `0x${hex.toUpperCase()}`;
  }

  return null;
};

/** Holds a number inside an inclusive range. */
const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

/**
 * Builds a validated chroma key from the raw option values.
 * @param color The colour option, required
 * @param similarity Optional tolerance; defaults and clamps
 * @param blend Optional edge softness; defaults and clamps
 * @returns The key to apply, or null if the colour did not parse
 */
export const buildChromaKey = (
  color: string,
  similarity?: number,
  blend?: number,
): ChromaKey | null => {
  const parsed = parseChromaColor(color);
  if (!parsed) return null;

  return {
    color: parsed,
    similarity: clamp(
      Number.isFinite(similarity) ? (similarity as number) : DEFAULT_SIMILARITY,
      MIN_SIMILARITY,
      MAX_SIMILARITY,
    ),
    blend: clamp(
      Number.isFinite(blend) ? (blend as number) : DEFAULT_BLEND,
      MIN_BLEND,
      MAX_BLEND,
    ),
  };
};

/**
 * Renders the key as an ffmpeg filter.
 *
 * `colorkey` rather than `chromakey`: it compares in RGB, which is what the
 * user picked their colour in. `chromakey` works on chroma planes and keys
 * more forgivingly on compressed footage, but the same numbers mean something
 * different there, so mixing them would make the tuning options lie.
 *
 * The numbers are fixed to three places so the filter string cannot pick up
 * exponent notation from a very small value.
 * @param key A key from `buildChromaKey`
 * @returns A single filter, ready to join into a chain
 */
export const colorkeyFilter = (key: ChromaKey): string =>
  `colorkey=${key.color}:${key.similarity.toFixed(3)}:${key.blend.toFixed(3)}`;
