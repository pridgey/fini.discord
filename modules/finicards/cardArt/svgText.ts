/**
 * Text fitting for SVG.
 *
 * SVG has no line wrapping and no overflow handling - a long string simply runs
 * off the edge of the card, which is a bug v1 still has. Everything the renderer
 * puts on a card goes through here first.
 *
 * Widths are estimated rather than measured: measuring would mean loading the
 * font and shaping the text, and an estimate that is a few percent out only ever
 * costs a slightly early line break.
 */

/** Escapes text for use inside an SVG text node or attribute. */
export const escapeXml = (value: string): string =>
  (value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

/**
 * Safety factor on every width estimate.
 *
 * The templates ask for Archivo and JetBrains Mono. If those aren't installed the
 * renderer falls back to whatever the system has - usually DejaVu Sans, which is
 * appreciably wider - and an underestimate here is text running off the card.
 * Overestimating only breaks a line slightly early, so the estimate is
 * deliberately pessimistic.
 */
const WIDTH_SAFETY = 1.12;

/** Per-character width as a fraction of the font size, for a humanist sans. */
const NARROW = new Set("iljtfrI.,;:!|'`()[]{}-/\\ ".split(""));
const WIDE = new Set("mwMW@%&".split(""));
const CAPS = new Set("ABCDEFGHJKLNOPQRSTUVXYZ0123456789".split(""));

const charWidth = (character: string): number => {
  if (NARROW.has(character)) return 0.31;
  if (WIDE.has(character)) return 0.86;
  if (CAPS.has(character)) return 0.62;
  return 0.53;
};

/**
 * Estimated rendered width in user units.
 *
 * `letterSpacing` matters: the templates track their small-caps labels out by
 * 1-2 units a character, which on a 12-character label is most of a stat box.
 */
export const estimateWidth = (
  text: string,
  fontSize: number,
  letterSpacing = 0,
  bold = false,
): number => {
  let width = 0;
  for (const character of text) width += charWidth(character) * fontSize;
  if (bold) width *= 1.04;
  width *= WIDTH_SAFETY;
  return width + Math.max(0, text.length - 1) * letterSpacing;
};

export type FitOptions = {
  fontSize: number;
  letterSpacing?: number;
  bold?: boolean;
};

/** Shortens text with an ellipsis until it fits `maxWidth`. */
export const truncateToWidth = (
  text: string,
  maxWidth: number,
  options: FitOptions,
): string => {
  const { fontSize, letterSpacing = 0, bold = false } = options;
  const clean = (text ?? "").trim();

  if (estimateWidth(clean, fontSize, letterSpacing, bold) <= maxWidth) {
    return clean;
  }

  let candidate = clean;
  while (
    candidate.length > 1 &&
    estimateWidth(`${candidate}…`, fontSize, letterSpacing, bold) > maxWidth
  ) {
    candidate = candidate.slice(0, -1);
  }

  return `${candidate.trimEnd()}…`;
};

/**
 * Greedy word wrap into at most `maxLines` lines.
 *
 * A word too long for a line on its own is broken rather than allowed to
 * overflow, and anything past the last line is ellipsised - so the card is
 * always well-formed even when the text is unreasonable.
 */
export const wrapToWidth = (
  text: string,
  maxWidth: number,
  maxLines: number,
  options: FitOptions,
): string[] => {
  const { fontSize, letterSpacing = 0, bold = false } = options;
  const words = (text ?? "").trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];

  const lines: string[] = [];
  let current = "";

  const fits = (candidate: string) =>
    estimateWidth(candidate, fontSize, letterSpacing, bold) <= maxWidth;

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;

    if (fits(candidate)) {
      current = candidate;
      continue;
    }

    if (current) {
      lines.push(current);
      current = "";
      if (lines.length === maxLines) break;
    }

    // A single word wider than the line: hard-break it.
    let remainder = word;
    while (remainder && !fits(remainder)) {
      let cut = remainder.length - 1;
      while (cut > 1 && !fits(remainder.slice(0, cut))) cut -= 1;
      lines.push(remainder.slice(0, cut));
      remainder = remainder.slice(cut);
      if (lines.length === maxLines) break;
    }

    if (lines.length === maxLines) break;
    current = remainder;
  }

  if (current && lines.length < maxLines) lines.push(current);

  // Anything that did not fit gets folded into an ellipsis on the last line.
  const consumed = lines.join(" ").split(/\s+/).filter(Boolean).length;
  if (consumed < words.length && lines.length > 0) {
    const last = lines.length - 1;
    lines[last] = truncateToWidth(`${lines[last]}…`, maxWidth, options);
  }

  return lines;
};

/**
 * Wraps a keyword sentence, keeping the keyword name on the first line.
 *
 * The templates all set the keyword in bold colour followed by an em dash, so
 * the first line has less room than the rest - passing the same width for every
 * line would overflow it.
 */
export const wrapAbility = (
  keywordName: string,
  description: string,
  maxWidth: number,
  maxLines: number,
  options: FitOptions,
): { firstLine: string; rest: string[] } => {
  const prefixWidth = keywordName
    ? estimateWidth(`${keywordName} — `, options.fontSize, options.letterSpacing, true)
    : 0;

  const words = (description ?? "").trim().split(/\s+/).filter(Boolean);
  const fitsFirst = (candidate: string) =>
    prefixWidth +
      estimateWidth(candidate, options.fontSize, options.letterSpacing ?? 0) <=
    maxWidth;

  let firstLine = "";
  let index = 0;

  while (index < words.length) {
    const candidate = firstLine ? `${firstLine} ${words[index]}` : words[index];
    if (!fitsFirst(candidate)) break;
    firstLine = candidate;
    index += 1;
  }

  const rest = wrapToWidth(
    words.slice(index).join(" "),
    maxWidth,
    Math.max(0, maxLines - 1),
    options,
  );

  return { firstLine, rest };
};
