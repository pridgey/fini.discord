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
 * Every number here was read off the supplied mockups.
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
  /** Letter shown in the header and footer. */
  rarityCode: string;
  /** Whether the card face is dark - decides the art placeholder pattern. */
  face: "light" | "dark";
  art: Box;
  /** Placeholder caption position, when there is no artwork. */
  artCaption: { x: number; y: number; fill: string };
  /** Widest the name may be before it is ellipsised. */
  name: { size: number; maxWidth: number; bold: boolean };
  /** Widest the series label in the header may be. */
  factionMaxWidth: number;
  tags: TagsSpec;
  ability: AbilitySpec;
  flavour?: FlavourSpec;
  statBar: StatBarSpec;
};

/* -------------------------------------------------------------------------- */

const COMMON: TemplateLayout = {
  file: "card-common.svg",
  rarityCode: "C",
  face: "light",
  art: { x: 22, y: 56, w: 279, h: 158 },
  artCaption: { x: 161.5, y: 138, fill: "#9aa1c4" },
  name: { size: 19, maxWidth: 279, bold: true },
  factionMaxWidth: 205,
  tags: {
    style: "inline",
    x: 22,
    y: 256,
    size: 8,
    letterSpacing: 0.6,
    separator: "  •  ",
    first: { fill: "{t_deep}" },
    second: { fill: "{t_pale_ink}" },
    separatorFill: "{t_hairline}",
    maxWidth: 279,
  },
  ability: {
    x: 22,
    y: 283,
    lineHeight: 15,
    size: 10.5,
    maxWidth: 272,
    maxLines: 4,
    fill: "#2b2e4a",
    keywordFill: "{t_deep}",
    emptyFill: "{t_pale_ink}",
  },
  flavour: { x: 22, y: 352, size: 9.5, fill: "{t_pale_ink}", maxWidth: 279 },
  statBar: {
    style: "boxed",
    x0: 22,
    x1: 301,
    y: 371,
    h: 34,
    rx: 4,
    gap: 4.05,
    leadRatio: 1.7,
    box: { fill: "none", stroke: "#e8e9f1" },
    label: { fill: "#9aa1c4", size: 8, letterSpacing: 1.1 },
    value: { fill: "#3f4262", size: 18 },
    lead: {
      labelFill: "#ffffff",
      labelOpacity: 0.9,
      labelSize: 8.5,
      labelLetterSpacing: 1.4,
      valueFill: "#ffffff",
      valueSize: 24,
    },
    padX: 9,
    labelDy: 20,
    valueDy: 24,
  },
};

const UNCOMMON: TemplateLayout = {
  file: "card-uncommon.svg",
  rarityCode: "U",
  face: "light",
  art: { x: 20, y: 56, w: 280, h: 186 },
  artCaption: { x: 160, y: 152, fill: "#9aa1c4" },
  name: { size: 21, maxWidth: 256, bold: true },
  factionMaxWidth: 200,
  tags: {
    style: "chips",
    x: 44,
    y: 272,
    h: 15,
    size: 8,
    letterSpacing: 0.6,
    padX: 6,
    gap: 4,
    rx: 2,
    first: { fill: "{t_bright}", textFill: "#ffffff" },
    second: { fill: "{t_pale_fill}", textFill: "{t_pale_ink}" },
    textDy: 10.5,
    maxWidth: 256,
  },
  ability: {
    x: 32,
    y: 315,
    lineHeight: 15,
    size: 10.5,
    maxWidth: 250,
    maxLines: 3,
    fill: "#2b2e4a",
    keywordFill: "{t_pale_ink}",
    emptyFill: "{t_pale_ink}",
  },
  statBar: {
    style: "boxed",
    x0: 21,
    x1: 299,
    y: 368,
    h: 34,
    rx: 4,
    gap: 3.97,
    leadRatio: 1.7,
    box: { fill: "{t_pale_fill}", stroke: "{t_hairline}" },
    label: { fill: "#9aa1c4", size: 8, letterSpacing: 1.1 },
    value: { fill: "#3f4262", size: 18 },
    lead: {
      labelFill: "#ffffff",
      labelOpacity: 0.9,
      labelSize: 8.5,
      labelLetterSpacing: 1.4,
      valueFill: "#ffffff",
      valueSize: 24,
    },
    padX: 9,
    labelDy: 20,
    valueDy: 24,
  },
};

const RARE: TemplateLayout = {
  file: "card-rare.svg",
  rarityCode: "R",
  face: "light",
  art: { x: 7, y: 7, w: 306, h: 268 },
  artCaption: { x: 160, y: 144, fill: "#9aa1c4" },
  name: { size: 24, maxWidth: 277, bold: true },
  factionMaxWidth: 70,
  tags: {
    style: "chips",
    x: 22,
    y: 292,
    h: 15,
    size: 8,
    letterSpacing: 0.6,
    padX: 6,
    gap: 4,
    rx: 2,
    first: { fill: "{t_deep}", textFill: "#ffffff" },
    second: { fill: "{t_pale_fill}", textFill: "{t_pale_ink}" },
    textDy: 10.5,
    maxWidth: 277,
  },
  ability: {
    x: 33,
    y: 335,
    lineHeight: 15,
    size: 10.5,
    maxWidth: 248,
    maxLines: 3,
    fill: "#2b2e4a",
    keywordFill: "{t_deeper}",
    emptyFill: "{t_pale_ink}",
  },
  statBar: {
    style: "boxed",
    x0: 22,
    x1: 299,
    y: 380,
    h: 32,
    rx: 4,
    gap: 4.0,
    leadRatio: 1.7,
    box: { fill: "#14162a", stroke: "none" },
    label: { fill: "#e4cf9a", size: 8, letterSpacing: 1.1 },
    value: { fill: "#ffffff", size: 18 },
    lead: {
      labelFill: "#ffffff",
      labelOpacity: 0.9,
      labelSize: 8.5,
      labelLetterSpacing: 1.4,
      valueFill: "#ffffff",
      valueSize: 24,
    },
    padX: 9,
    labelDy: 19,
    valueDy: 23,
  },
};

const DOUBLE_RARE: TemplateLayout = {
  file: "card-double-rare.svg",
  rarityCode: "RR",
  face: "dark",
  art: { x: 6, y: 6, w: 308, h: 436 },
  artCaption: { x: 160, y: 227, fill: "#7b83b5" },
  name: { size: 27, maxWidth: 276, bold: true },
  factionMaxWidth: 70,
  tags: {
    style: "chips",
    x: 22,
    y: 305,
    h: 15,
    size: 8,
    letterSpacing: 0.6,
    padX: 6,
    gap: 4,
    rx: 2,
    first: { fill: "{t_bright}", textFill: "{t_ink}" },
    second: { fill: "#ffffff", fillOpacity: 0.13, textFill: "{t_glow}" },
    textDy: 10.5,
    maxWidth: 276,
  },
  ability: {
    x: 33,
    y: 348,
    lineHeight: 15,
    size: 10.5,
    maxWidth: 246,
    maxLines: 3,
    fill: "#f2e6ea",
    keywordFill: "#ffffff",
    emptyFill: "{t_glow}",
  },
  statBar: {
    style: "boxed",
    x0: 22,
    x1: 298,
    y: 394,
    h: 34,
    rx: 4,
    gap: 4.0,
    leadRatio: 1.7,
    box: { fill: "#ffffff", stroke: "#ffffff" },
    label: { fill: "#ffffff", size: 8, letterSpacing: 1.1 },
    value: { fill: "#ffffff", size: 18 },
    lead: {
      labelFill: "{t_ink}",
      labelOpacity: 0.75,
      labelSize: 8.5,
      labelLetterSpacing: 1.4,
      valueFill: "#ffffff",
      valueSize: 24,
    },
    padX: 9,
    labelDy: 20,
    valueDy: 24,
  },
};

const SPECIAL: TemplateLayout = {
  file: "card-special.svg",
  rarityCode: "SP",
  face: "dark",
  art: { x: 4, y: 4, w: 312, h: 440 },
  artCaption: { x: 160, y: 227, fill: "#7b83b5" },
  name: { size: 31, maxWidth: 280, bold: true },
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
 * v2 has three rarities and a separate cosmetic `foil` flag, and the mockups
 * supplied five escalating designs (silver → light → gold → holo → prism). So
 * foil is what promotes a card to the fancier frame of its tier: a foil common
 * prints on the gold "rare" frame, a foil uncommon on the holo. That gives the
 * cosmetic axis something visible to do without ever touching a stat, which is
 * exactly what the doc wants foil to be.
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
