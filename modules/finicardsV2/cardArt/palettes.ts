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
  };
};
