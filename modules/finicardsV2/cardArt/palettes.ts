import type { CardType } from "../../../types/PocketbaseTablesV2";

/**
 * Per-type colour themes for the card templates.
 *
 * The templates arrived as fully-designed mockups themed by *type* - the Heart
 * examples in rose, the Wit examples in indigo. Tokenising those hexes means one
 * template file can render any type, so there is one design per rarity rather
 * than one per rarity-and-type combination.
 *
 * The Power palette had no example to copy, so it is invented: a warm amber that
 * reads as force and sits clearly apart from both the indigo and the rose. If it
 * looks wrong next to the others, this object is the only place to change it.
 */
export type TypePalette = {
  /** Vivid. Accents on dark faces, and the bright end of the lead gradient. */
  bright: string;
  /** The primary accent. */
  main: string;
  /** Deep enough to read as text on white. */
  deep: string;
  /** Deeper still - the rare template's keyword colour. */
  deeper: string;
  /** Near-black tint, for text sitting on a `bright` fill. */
  ink: string;
  /** Hairline rules and pale strokes on white. */
  hairline: string;
  /** Pale chip and panel backgrounds. */
  pale_fill: string;
  /** Muted text: secondary tags, flavour, faint labels. */
  pale_ink: string;
  /** Light tint for text and sparkle on dark faces. */
  glow: string;
  /**
   * The soft accent of the dark-faced frames: stat label, name rule, corner
   * tint, and what the uncommon's border is tinted with.
   */
  soft: string;
};

export const TYPE_PALETTES: Record<CardType, TypePalette> = {
  /* Invented - no Power mockup was supplied. */
  power: {
    bright: "#FFB259",
    main: "#F2913D",
    deep: "#D2701C",
    deeper: "#A4520E",
    ink: "#331d05",
    hairline: "#f6e7d6",
    pale_fill: "#fdf2e6",
    pale_ink: "#8a5a29",
    glow: "#ffe3c2",
    soft: "#f6c18a",
  },
  /* From card-uncommon / card-rare / card-special-wit. */
  wit: {
    bright: "#8B95FF",
    main: "#6c78f0",
    deep: "#5865F2",
    deeper: "#3A46C4",
    ink: "#141733",
    hairline: "#dfe2f6",
    pale_fill: "#eceefe",
    pale_ink: "#4d5490",
    glow: "#d9e2ff",
    soft: "#aab4f8",
  },
  /* From card-common / card-double-rare / card-special-heart. */
  heart: {
    bright: "#F28BA6",
    main: "#E15C7E",
    deep: "#B33A5C",
    deeper: "#8E2B47",
    ink: "#3a0f1e",
    hairline: "#f0dfe4",
    pale_fill: "#fdeef2",
    pale_ink: "#8c5568",
    glow: "#ffd9e5",
    // The one soft accent that was supplied, on the dark common and uncommon.
    soft: "#f4a6c6",
  },
};

/** Stat labels. The narrow form is used when the stat is not the card's type. */
export const STAT_LABELS: Record<CardType, { short: string; full: string }> = {
  // The mockups label this "STR"; the schema and the design doc both call the
  // stat Power, so the card says POWER. Change it here if you prefer STR.
  power: { short: "PWR", full: "POWER" },
  wit: { short: "WIT", full: "WIT" },
  heart: { short: "HRT", full: "HEART" },
};

/** The neutral border of the dark frames, which a type's `soft` tints. */
const FRAME_BASE = "#2b2d37";

/** Blends `amount` of `tint` into `base`. Both are six-digit hexes. */
const mixHex = (base: string, tint: string, amount: number): string => {
  const channel = (hex: string, index: number) =>
    parseInt(hex.slice(1 + index * 2, 3 + index * 2), 16);
  return `#${[0, 1, 2]
    .map((index) =>
      Math.round(
        channel(base, index) + (channel(tint, index) - channel(base, index)) * amount,
      )
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
};

/** Substitution map for one type, keyed by the `{t_*}` tokens in a template. */
export const paletteTokens = (
  type: CardType,
): Record<string, string> => {
  const palette = TYPE_PALETTES[type];
  return {
    t_bright: palette.bright,
    t_main: palette.main,
    t_deep: palette.deep,
    t_deeper: palette.deeper,
    t_ink: palette.ink,
    t_hairline: palette.hairline,
    t_pale_fill: palette.pale_fill,
    t_pale_ink: palette.pale_ink,
    t_glow: palette.glow,
    t_soft: palette.soft,
    // 28% is what the supplied uncommon works out to: #634f5f from #f4a6c6.
    t_frame: mixHex(FRAME_BASE, palette.soft, 0.28),
  };
};
