import type { CardRarity } from "../../../types/PocketbaseTablesV2";

/**
 * Per-template geometry.
 *
 * The split is deliberate: the SVG files own everything *visual* - frames,
 * gradients, foil borders, sparkle, panels - and these specs own only where
 * generated text and boxes go. That way a template can be redesigned without
 * touching TypeScript, as long as the tokens stay put, and the renderer never
 * has to parse SVG.
 *
 * Every number here was read off the supplied mockups. The common and uncommon
 * and their foils are the redrawn dark frames, in 606x849 units; the full-art
 * frame is the first set's, in 320x448.
 */

export type Box = { x: number; y: number; w: number; h: number };

/** Boxed stat bars (common, uncommon, rare, double-rare). */
export type BoxedStatBar = {
  style: "boxed";
  /** Left edge of the first box and right edge of the last. */
  x0: number;
  x1: number;
  y: number;
  h: number;
  rx: number;
  gap: number;
  /** How much wider the type stat's box is than the others. */
  leadRatio: number;
  box: { fill: string; stroke: string };
  label: { fill: string; size: number; letterSpacing: number };
  value: { fill: string; size: number };
  lead: {
    labelFill: string;
    labelOpacity?: number;
    labelSize: number;
    labelLetterSpacing: number;
    valueFill: string;
    valueSize: number;
  };
  /** Offsets inside a box. */
  padX: number;
  labelDy: number;
  valueDy: number;
};

/** The inline stat line used by the special template. */
export type InlineStatBar = {
  style: "inline";
  x: number;
  labelY: number;
  valueY: number;
  leadLabelY: number;
  leadValueY: number;
  advance: number;
  leadAdvance: number;
  leadOffset: number;
  divider: { dx: number; y: number; h: number; fill: string; opacity: number };
  label: { fill: string; opacity: number; size: number; letterSpacing: number };
  value: { fill: string; opacity: number; size: number };
  lead: {
    labelFill: string;
    labelSize: number;
    labelLetterSpacing: number;
    valueFill: string;
    valueSize: number;
    italic: boolean;
  };
};

export type StatBarSpec = BoxedStatBar | InlineStatBar;

/** Two tags separated by a bullet, drawn as one text element. */
export type InlineTags = {
  style: "inline";
  x: number;
  y: number;
  size: number;
  letterSpacing: number;
  separator: string;
  first: { fill: string };
  second: { fill: string };
  separatorFill: string;
  opacity?: number;
  maxWidth: number;
};

/** Two rounded chips. */
export type ChipTags = {
  style: "chips";
  x: number;
  y: number;
  h: number;
  size: number;
  letterSpacing: number;
  padX: number;
  gap: number;
  rx: number;
  first: { fill: string; textFill: string };
  second: { fill: string; fillOpacity?: number; textFill: string };
  textDy: number;
  maxWidth: number;
};

export type TagsSpec = InlineTags | ChipTags;

export type AbilitySpec = {
  x: number;
  y: number;
  lineHeight: number;
  size: number;
  maxWidth: number;
  maxLines: number;
  fill: string;
  opacity?: number;
  keywordFill: string;
  /** Shown instead of a keyword when the card has none. */
  emptyFill: string;
};

export type FlavourSpec = {
  x: number;
  y: number;
  size: number;
  fill: string;
  maxWidth: number;
};

export type TemplateLayout = {
  /** File in `modules/finicardsV2/templates`. */
  file: string;
  /**
   * Width of the template in its own user units. Every other number in the
   * layout is in those units, and the templates do not all share a scale.
   */
  width: number;
  /** Letter shown in the header and footer. */
  rarityCode: string;
  /** Whether the card face is dark - decides the art placeholder pattern. */
  face: "light" | "dark";
  art: Box;
  /**
   * Which end of the artwork to keep when it is taller than the window.
   * Unset, the crop goes wherever the picture is busiest; "top" holds on to
   * the top edge, which is where a portrait keeps its face.
   */
  artAnchor?: "top";
  /** Placeholder caption position, when there is no artwork. */
  artCaption: { x: number; y: number; fill: string; size?: number };
  /**
   * How the name is fitted. One that fits at `size` within `maxWidth` is set
   * on its one line. One that does not is broken over two lines at `wrapSize`,
   * the second on the usual baseline and the first a line above it - so a long
   * name grows upward, and nothing under it has to move. A single word too
   * long to break is set smaller, down to `minSize`, and only then cut.
   *
   * `x` is where the template starts the name, which a second line has to
   * return to. `widen` is how much wider the name's face sets than the width
   * estimator assumes. The template takes the size through `{name_size}`.
   */
  name: {
    size: number;
    maxWidth: number;
    bold: boolean;
    x?: number;
    wrapSize?: number;
    minSize?: number;
    widen?: number;
  };
  /**
   * A panel the text sits on, where the frame has one. A name that takes a
   * second line grows it upward by that line, so the name is never left
   * hanging above its own backing. The template draws it from `{panel_y}`,
   * `{panel_h}` and, for its hairline, `{panel_edge_y}` and `{panel_edge_h}`.
   */
  panel?: { y: number; h: number };
  /**
   * For a frame with no panel, where the text sits straight under the art: a
   * name's second line is made room for by ending the art window that much
   * higher. The template draws the window from `{art_h}` and `{art_edge_h}`.
   */
  artYieldsToName?: boolean;
  /**
   * The most characters of an artist's credit the footer has room for beside
   * the card's own line, on the frames that set the footer in a fixed-width
   * face. Without it the credit is fitted by estimated width instead.
   */
  artistChars?: number;
  /** Widest the series label in the header may be. */
  factionMaxWidth: number;
  /** The header label's type, for measuring it. Defaults to the first set's. */
  factionFont?: { size: number; letterSpacing: number };
  tags: TagsSpec;
  ability: AbilitySpec;
  flavour?: FlavourSpec;
  statBar: StatBarSpec;
};

/* -------------------------------------------------------------------------- */

/**
 * The stat line the dark common and uncommon share: two quiet stats, a
 * divider, and the card's type stat set large.
 */
const darkStatLine = (options: {
  x: number;
  /** Baselines: the values share one, the lead's label sits higher. */
  valueY: number;
  labelY: number;
  leadLabelY: number;
  advance: number;
  leadOffset: number;
  labelSize: number;
  valueSize: number;
  leadValueSize: number;
  divider: { y: number; h: number };
}): InlineStatBar => ({
  style: "inline",
  x: options.x,
  labelY: options.labelY,
  valueY: options.valueY,
  leadLabelY: options.leadLabelY,
  leadValueY: options.valueY,
  advance: options.advance,
  // Room for a two-digit lead value before the next stat starts.
  leadAdvance: options.leadValueSize * 2.1,
  leadOffset: options.leadOffset,
  divider: {
    dx: 0,
    y: options.divider.y,
    h: options.divider.h,
    fill: "#ffffff",
    opacity: 0.18,
  },
  label: {
    fill: "#ffffff",
    opacity: 0.52,
    size: options.labelSize,
    letterSpacing: options.labelSize * 0.08,
  },
  value: { fill: "#e6e8ee", opacity: 1, size: options.valueSize },
  lead: {
    labelFill: "{t_soft}",
    labelSize: options.labelSize,
    labelLetterSpacing: options.labelSize * 0.08,
    valueFill: "#ffffff",
    valueSize: options.leadValueSize,
    italic: true,
  },
});

const COMMON: TemplateLayout = {
  file: "card-common.svg",
  width: 606,
  rarityCode: "C",
  face: "dark",
  art: { x: 32, y: 32, w: 542, h: 430 },
  artAnchor: "top",
  artYieldsToName: true,
  artistChars: 18,
  artCaption: { x: 303, y: 252, fill: "#5d6072", size: 13 },
  // Bold italic DejaVu measured against the estimator over every name in the
  // pool: 5% wider on average, 16% at worst.
  name: { size: 48, maxWidth: 542, bold: true, x: 32, wrapSize: 40, minSize: 34, widen: 1.16 },
  factionMaxWidth: 430,
  factionFont: { size: 15, letterSpacing: 3.3 },
  tags: {
    style: "inline",
    x: 32,
    y: 555,
    size: 15,
    letterSpacing: 2.4,
    separator: "  ·  ",
    first: { fill: "#ffffff" },
    second: { fill: "#ffffff" },
    separatorFill: "#ffffff",
    opacity: 0.58,
    maxWidth: 542,
  },
  ability: {
    x: 32,
    y: 608,
    lineHeight: 25,
    size: 18,
    maxWidth: 542,
    maxLines: 3,
    fill: "#ffffff",
    opacity: 0.86,
    keywordFill: "{t_soft}",
    emptyFill: "#ffffff",
  },
  statBar: darkStatLine({
    x: 32,
    valueY: 783,
    labelY: 732,
    leadLabelY: 718,
    advance: 61.4,
    leadOffset: 33,
    labelSize: 14,
    valueSize: 42,
    leadValueSize: 58,
    divider: { y: 723, h: 62 },
  }),
};

const UNCOMMON: TemplateLayout = {
  file: "card-uncommon.svg",
  width: 606,
  rarityCode: "U",
  face: "dark",
  art: { x: 10, y: 10, w: 586, h: 622 },
  artAnchor: "top",
  // Centred on the part of the art the panel leaves showing, not on the window.
  artCaption: { x: 303, y: 270, fill: "#5d6072", size: 13 },
  name: { size: 44, maxWidth: 494, bold: true, x: 56, wrapSize: 38, minSize: 30, widen: 1.16 },
  panel: { y: 520, h: 271 },
  artistChars: 16,
  factionMaxWidth: 440,
  factionFont: { size: 15, letterSpacing: 3.3 },
  tags: {
    style: "inline",
    x: 56,
    y: 613,
    size: 14,
    letterSpacing: 2.24,
    separator: "  ·  ",
    first: { fill: "#ffffff" },
    second: { fill: "#ffffff" },
    separatorFill: "#ffffff",
    opacity: 0.6,
    maxWidth: 494,
  },
  ability: {
    x: 56,
    y: 664,
    lineHeight: 22,
    size: 18,
    maxWidth: 494,
    // The panel only has room for two before the stat labels start.
    maxLines: 2,
    fill: "#ffffff",
    opacity: 0.86,
    keywordFill: "{t_soft}",
    emptyFill: "#ffffff",
  },
  statBar: darkStatLine({
    x: 56,
    valueY: 765,
    labelY: 719,
    leadLabelY: 705,
    advance: 56.6,
    leadOffset: 31,
    labelSize: 13,
    valueSize: 38,
    leadValueSize: 54,
    divider: { y: 711, h: 56 },
  }),
};

/* The foils are their plain cards with a foil border and a sheen: same
   geometry, so the artwork crops identically whether or not a copy is foil. */

const RARE: TemplateLayout = {
  ...COMMON,
  file: "card-common-foil.svg",
  // A foil is a finish on a rarity, not a rarity: a foil common is still a common.
  rarityCode: "FC",
};

const DOUBLE_RARE: TemplateLayout = {
  ...UNCOMMON,
  file: "card-uncommon-foil.svg",
  rarityCode: "FU",
};

const SPECIAL: TemplateLayout = {
  file: "card-special.svg",
  width: 320,
  rarityCode: "FA",
  face: "dark",
  art: { x: 4, y: 4, w: 312, h: 440 },
  artCaption: { x: 160, y: 227, fill: "#7b83b5" },
  // The art runs the full height of this frame, so a second line has room.
  name: { size: 31, maxWidth: 280, bold: true, x: 20, wrapSize: 29, minSize: 24 },
  factionMaxWidth: 215,
  tags: {
    style: "inline",
    x: 20,
    y: 296,
    size: 9,
    letterSpacing: 1.3,
    separator: "  ·  ",
    first: { fill: "#ffffff" },
    second: { fill: "#ffffff" },
    separatorFill: "#ffffff",
    opacity: 0.66,
    maxWidth: 280,
  },
  ability: {
    x: 20,
    y: 326,
    lineHeight: 14,
    size: 10,
    maxWidth: 230,
    maxLines: 3,
    fill: "#ffffff",
    opacity: 0.86,
    keywordFill: "#ffffff",
    emptyFill: "#ffffff",
  },
  statBar: {
    style: "inline",
    x: 20,
    labelY: 387,
    valueY: 410,
    leadLabelY: 385,
    leadValueY: 412,
    advance: 50,
    leadAdvance: 74,
    leadOffset: 6,
    divider: { dx: -8, y: 386, h: 26, fill: "#ffffff", opacity: 0.2 },
    label: { fill: "#ffffff", opacity: 0.45, size: 8, letterSpacing: 1.1 },
    value: { fill: "#ffffff", opacity: 0.85, size: 22 },
    lead: {
      labelFill: "{t_bright}",
      labelSize: 8,
      labelLetterSpacing: 1.3,
      valueFill: "#ffffff",
      valueSize: 30,
      italic: true,
    },
  },
};

export const LAYOUTS = {
  common: COMMON,
  uncommon: UNCOMMON,
  rare: RARE,
  double_rare: DOUBLE_RARE,
  special: SPECIAL,
} as const;

export type LayoutName = keyof typeof LAYOUTS;

/**
 * Which template a card gets.
 *
 * v2 has three rarities and a separate cosmetic `foil` flag. Foil is what
 * promotes a card to the fancier frame of its tier: a foil common prints with
 * a gold border ("rare"), a foil uncommon with a holo one ("double rare").
 * That gives the cosmetic axis something visible to do without ever touching a
 * stat, which is exactly what the doc wants foil to be.
 *
 * Full-arts already use the top frame, so foil changes nothing for them.
 */
export const layoutFor = (
  rarity: CardRarity,
  foil: boolean,
): TemplateLayout => {
  if (rarity === "full_art") return LAYOUTS.special;
  if (rarity === "uncommon") return foil ? LAYOUTS.double_rare : LAYOUTS.uncommon;
  return foil ? LAYOUTS.rare : LAYOUTS.common;
};
