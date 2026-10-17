import { readFile } from "fs/promises";
import { join } from "path";
import sharp from "sharp";
import { pb } from "../../../utilities/pocketbase";
import { findKeyword } from "../keywords";
import type { ArtAdjust } from "../../../types/PocketbaseTablesV2";
import type { BattleCard } from "../types";
import {
  abilityBlock,
  artBlock,
  flavourBlock,
  statBarBlock,
  tagsBlock,
} from "./blocks";
import { legendaryCode } from "../legendary";
import { setNumberLabel } from "../setNumbers";
import { layoutFor, type TemplateLayout } from "./layouts";
import { paletteTokens } from "./palettes";
import { escapeXml, estimateWidth, truncateToWidth } from "./svgText";

/**
 * Renders a v2 card to a PNG.
 *
 * Same pipeline v1 proved out - fill a template, render through `sharp` at a
 * high density, resize - but the templates are themeable by type and the
 * variable-shape pieces (art, tags, ability, stat bar) are generated rather
 * than string-substituted, because their geometry depends on the card.
 *
 * Fully independent of v1: different template directory, different tokens.
 */

const TEMPLATE_DIR = join(import.meta.dir, "..", "templates");

/** Output width in pixels. Each layout says how wide its own template is. */
export const CARD_WIDTH = 606;

/** Rendering density. 300 keeps the small mono labels crisp. */
const DENSITY = 300;

/** Templates are small and immutable at runtime, so read each one once. */
const templateCache = new Map<string, string>();

const loadTemplate = async (file: string): Promise<string> => {
  const cached = templateCache.get(file);
  if (cached) return cached;

  const contents = (await readFile(join(TEMPLATE_DIR, file))).toString();
  templateCache.set(file, contents);
  return contents;
};

/** Clears the template cache. Useful while iterating on a design. */
export const clearTemplateCache = (): void => templateCache.clear();

export type CardArtSource = {
  /** A URL to fetch the artwork from. */
  url?: string;
  /** Raw image bytes, if already in hand. */
  buffer?: Buffer;
  /** The card's crop corrections, if it has any. */
  adjust?: ArtAdjust | null;
};

/**
 * Where a card's artwork comes from.
 *
 * Converted cards have an empty `art_url` but carry `legacy_card`, so their v1
 * artwork can be pulled straight out of Pocketbase - which means the whole
 * converted pool has art on day one without anyone uploading anything.
 */
export const resolveArtSource = async (definition: {
  art_url?: string;
  legacy_card?: string;
  art_adjust?: ArtAdjust | null;
}): Promise<CardArtSource | null> => {
  const adjust = definition.art_adjust ?? null;
  if (definition.art_url) return { url: definition.art_url, adjust };

  if (definition.legacy_card) {
    try {
      // Never auto-cancelled: several renders ask for the same card at once
      // (its reveal and its loop, or two copies in one pack), and the client
      // would otherwise drop all but the last, leaving the rest without art.
      const legacy = await pb
        .collection("card_definition")
        .getOne(definition.legacy_card, { requestKey: null });
      if (legacy?.image) {
        return { url: pb.files.getURL(legacy, legacy.image as string), adjust };
      }
    } catch {
      // No legacy row, or it lost its image - fall through to no art.
    }
  }

  return null;
};

/** Alpha at or below this counts as empty when looking for padding. */
const PADDING_ALPHA = 8;

/**
 * Cuts transparent padding off artwork.
 *
 * A number of v1 images were saved as the picture sitting in a larger
 * transparent canvas. Cropped as they are, the padding counts as picture: the
 * art window comes out part empty and the crop centres on the wrong thing.
 *
 * Only transparency is trimmed. Solid bars baked into an image are left alone,
 * because nothing tells a black bar from the dark edge of a picture.
 */
export const trimPadding = async (input: Buffer): Promise<Buffer> => {
  const box = await paddingBox(input);
  return box ? sharp(input).extract(box).toBuffer() : input;
};

/**
 * Where the picture sits inside its transparent padding, in pixels, or null
 * when there is no padding to speak of.
 */
export const paddingBox = async (
  input: Buffer,
): Promise<{
  left: number;
  top: number;
  width: number;
  height: number;
} | null> => {
  const meta = await sharp(input).metadata();
  if (!meta.hasAlpha || !meta.width || !meta.height) return null;

  const { width, height } = meta;
  const alpha = await sharp(input).extractChannel("alpha").raw().toBuffer();

  let left = width;
  let right = -1;
  let top = height;
  let bottom = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (alpha[y * width + x] <= PADDING_ALPHA) continue;
      if (x < left) left = x;
      if (x > right) right = x;
      if (y < top) top = y;
      if (y > bottom) bottom = y;
    }
  }

  // Fully transparent, or nothing worth cutting.
  if (right < left || bottom < top) return null;
  const kept = ((right - left + 1) * (bottom - top + 1)) / (width * height);
  if (kept > 0.99) return null;

  return { left, top, width: right - left + 1, height: bottom - top + 1 };
};

/** Cuts a card's recorded bars off its artwork. */
const trimBars = async (
  input: Buffer,
  trim: NonNullable<ArtAdjust["trim"]>,
): Promise<Buffer> => {
  const meta = await sharp(input).metadata();
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  const left = Math.round(width * trim.left);
  const top = Math.round(height * trim.top);
  const box = {
    left,
    top,
    width: width - left - Math.round(width * trim.right),
    height: height - top - Math.round(height * trim.bottom),
  };
  // A trim that would leave nothing is a bad record, not an instruction.
  if (box.width < 8 || box.height < 8) return input;

  return sharp(input).extract(box).toBuffer();
};

/**
 * Crops artwork to exactly `width` x `height`.
 *
 * With a `focus` the crop is centred on it as nearly as the edges of the
 * picture allow. Without one it goes wherever the picture is busiest, unless
 * `anchor` says to hold on to the top when height is what gets cut.
 */
export const coverCrop = async (
  input: Buffer,
  width: number,
  height: number,
  options: {
    focus?: ArtAdjust["focus"];
    anchor?: TemplateLayout["artAnchor"];
  } = {},
): Promise<Buffer> => {
  const meta = await sharp(input).metadata();
  const full = { w: meta.width ?? 1, h: meta.height ?? 1 };
  const tooTall = full.w / full.h < width / height;

  if (options.focus) {
    // The largest box of the target's shape, slid to sit on the focus.
    const box = tooTall
      ? { w: full.w, h: Math.round((full.w * height) / width) }
      : { w: Math.round((full.h * width) / height), h: full.h };
    const slide = (centre: number, size: number, limit: number) =>
      Math.round(Math.min(Math.max(centre - size / 2, 0), limit - size));

    return sharp(input)
      .extract({
        left: slide(options.focus.x * full.w, box.w, full.w),
        top: slide(options.focus.y * full.h, box.h, full.h),
        width: Math.min(box.w, full.w),
        height: Math.min(box.h, full.h),
      })
      .resize({ width, height, fit: "fill" })
      .png()
      .toBuffer();
  }

  return sharp(input)
    .resize({
      width,
      height,
      fit: "cover",
      position: options.anchor === "top" && tooTall ? "north" : "attention",
    })
    .png()
    .toBuffer();
};

/** Fetches a card's artwork, ready to crop. Null if it cannot be had. */
export const loadArt = async (
  source: CardArtSource | null,
): Promise<Buffer | null> => {
  if (!source) return null;

  let input: Buffer;
  if (source.buffer) {
    input = source.buffer;
  } else if (source.url) {
    const response = await fetch(source.url);
    if (!response.ok) return null;
    input = Buffer.from(await response.arrayBuffer());
  } else {
    return null;
  }

  const picture = await trimPadding(input);
  return source.adjust?.trim ? trimBars(picture, source.adjust.trim) : picture;
};

/**
 * Crops artwork to the art window and returns it as a data URI.
 *
 * `fit: "cover"` here rather than in SVG so the crop is done by libvips, which
 * is both better at it and cheaper than making the renderer scale a large image.
 */
const prepareArt = async (
  source: CardArtSource,
  window: TemplateLayout["art"],
  scale: number,
  anchor?: TemplateLayout["artAnchor"],
): Promise<string | null> => {
  try {
    const input = await loadArt(source);
    if (!input) return null;

    const png = await coverCrop(
      input,
      Math.round(window.w * scale),
      Math.round(window.h * scale),
      { focus: source.adjust?.focus, anchor },
    );

    return `data:image/png;base64,${png.toString("base64")}`;
  } catch (error) {
    console.error("Couldn't prepare v2 card art:", error);
    return null;
  }
};

/**
 * Fits a card's name to its frame: on one line if it will go, otherwise on two
 * with the extra line added above, so the name grows upward and nothing below
 * it is pushed. Returns the size to set it at, the markup for inside the
 * template's name element, and how far up the extra line reaches (`lift`, 0
 * for a name on one line).
 */
export const fitName = (
  name: string,
  spec: TemplateLayout["name"],
): { size: number; markup: string; lift: number } => {
  const width = spec.maxWidth / (spec.widen ?? 1);
  const measure = (text: string, size: number) =>
    estimateWidth(text, size, 0, spec.bold);

  if (measure(name, spec.size) <= width) {
    return { size: spec.size, markup: escapeXml(name), lift: 0 };
  }

  const words = name.trim().split(/\s+/);
  const wrapSize = spec.wrapSize;
  if (wrapSize && spec.x !== undefined && words.length > 1) {
    // Every way of splitting the words in two, keeping the one whose longer
    // line is shortest - the most even break.
    let best: { first: string; second: string; widest: number } | null = null;
    for (let cut = 1; cut < words.length; cut++) {
      const first = words.slice(0, cut).join(" ");
      const second = words.slice(cut).join(" ");
      const widest = Math.max(
        measure(first, wrapSize),
        measure(second, wrapSize),
      );
      if (!best || widest < best.widest) best = { first, second, widest };
    }

    if (best) {
      const fit = (text: string) =>
        escapeXml(
          truncateToWidth(text, width, { fontSize: wrapSize, bold: spec.bold }),
        );
      const lineHeight = Math.round(wrapSize * 1.06);
      return {
        size: wrapSize,
        lift: lineHeight,
        markup: `<tspan x="${spec.x}" dy="-${lineHeight}">${fit(best.first)}</tspan><tspan x="${spec.x}" dy="${lineHeight}">${fit(best.second)}</tspan>`,
      };
    }
  }

  // One long word: nothing to break on, so it is set smaller, then cut.
  let size = spec.size;
  const smallest = spec.minSize ?? size;
  while (size > smallest && measure(name, size) > width) size -= 1;
  return {
    size,
    lift: 0,
    markup: escapeXml(
      truncateToWidth(name, width, { fontSize: size, bold: spec.bold }),
    ),
  };
};

/**
 * The tags a card prints. Its series is already the header, and `legacy` is a
 * marker for filtering, so neither is spent on one of the two places.
 */
export const printedTags = (card: BattleCard): string[] => {
  const series = (card.series ?? "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return (card.tags ?? []).filter((tag) => tag !== "legacy" && tag !== series);
};

/**
 * The footer line, e.g. `FINICARD V1 · S3 12/217 · 7q4k2m9xw1c0ab3`.
 *
 * - the version is where the card comes from: V1 for one converted from the
 *   first game, V2 for one made for this one
 * - the set is left out when the card has none recorded, and its number with
 *   it; a Secret Art's number runs past the set's size ("218/217")
 * - the id is the owned copy's, which is the one a player types into a
 *   command; a card that is nobody's copy (a preview) shows its definition's
 *
 * The rarity is not repeated here: it is the large code in the corner.
 */
export const cardFooter = (card: BattleCard): string =>
  [
    `FINICARD ${card.legacyCard ? "V1" : "V2"}`,
    card.set
      ? [`S${card.set}`, setNumberLabel(card.number, card.setSize)]
          .filter(Boolean)
          .join(" ")
      : "",
    card.instanceId || card.definitionId,
  ]
    .filter(Boolean)
    .join(" · ");

export type RenderCardOptions = {
  /** Skip fetching artwork - renders the hatched placeholder instead. */
  withoutArt?: boolean;
  /** Supply artwork directly, bypassing `art_url` / `legacy_card` lookup. */
  art?: CardArtSource;
  /** Output width in pixels. */
  width?: number;
  /** Flavour text, if the card has any. */
  flavour?: string;
  /** Artist credit for the footer. */
  artist?: string;
  /** Series shown in the header. Defaults to the card's own series. */
  faction?: string;
};

/** What a Secret Art prints where a full-art prints `FA`. */
export const SECRET_ART_CODE = "SA";

/** A card held to fewer copies than this says which copy it is. */
export const LIMITED_BELOW = 5;

/**
 * "2 OF 3" for a copy of a card limited to a handful per server, else "".
 * A card shown without a copy behind it - a preview - stands in as the first.
 */
export const limitedLabel = (card: BattleCard): string => {
  const population = card.population ?? 0;
  if (population < 1 || population >= LIMITED_BELOW) return "";
  const serial =
    card.serial && card.serial > 0 ? Math.min(card.serial, population) : 1;
  return `${serial} OF ${population}`;
};

/**
 * Builds the finished SVG for a card. Exported separately from the PNG render so
 * tests can assert on the markup without paying for rasterisation.
 */
export const buildCardSvg = async (
  card: BattleCard,
  options: RenderCardOptions = {},
): Promise<string> => {
  const frame = layoutFor(card.rarity, card.foil);
  const name = fitName(card.name, frame.name);
  // Where the text sits straight under the art, a second line of name takes
  // its room from the bottom of the art window.
  const layout: TemplateLayout =
    frame.artYieldsToName && name.lift
      ? { ...frame, art: { ...frame.art, h: frame.art.h - name.lift } }
      : frame;
  const template = await loadTemplate(layout.file);
  const width = options.width ?? CARD_WIDTH;

  /* Art comes from the explicit override, else from the card's own art_url or
     the v1 row it was converted from. */
  const source = options.withoutArt
    ? null
    : (options.art ??
      (await resolveArtSource({
        art_url: card.artUrl,
        legacy_card: card.legacyCard,
        art_adjust: card.artAdjust,
      })));

  const artDataUri = source
    ? await prepareArt(
        source,
        layout.art,
        width / layout.width,
        layout.artAnchor,
      )
    : null;

  const keyword = findKeyword(card.keyword);
  const faction = options.faction ?? card.series ?? "";

  const credit = (options.artist ?? card.artist ?? "ART / —").trim();
  const rarityCode =
    legendaryCode(card.legendary) ??
    (card.secretArt ? SECRET_ART_CODE : layout.rarityCode);
  const factionFont = layout.factionFont ?? { size: 10.5, letterSpacing: 1.9 };

  const substitutions: Record<string, string> = {
    ...paletteTokens(card.type),

    card_name: name.markup,
    name_size: String(name.size),
    art_h: String(layout.art.h),
    art_edge_h: String(layout.art.h - 1),
    // The text panel reaches up to take in a name's second line.
    ...(layout.panel
      ? {
          panel_y: String(layout.panel.y - name.lift),
          panel_h: String(layout.panel.h + name.lift),
          panel_edge_y: String(layout.panel.y - name.lift + 0.5),
          panel_edge_h: String(layout.panel.h + name.lift - 1),
        }
      : {}),
    faction: escapeXml(
      truncateToWidth(faction.toUpperCase(), layout.factionMaxWidth, {
        fontSize: factionFont.size,
        letterSpacing: factionFont.letterSpacing,
        bold: true,
      }),
    ),
    watermark: escapeXml((faction.trim()[0] ?? "F").toUpperCase()),
    rarity_code: rarityCode,
    limited: limitedLabel(card),
    card_number: escapeXml(cardFooter(card)),
    artist: escapeXml(
      // The footer line takes most of the row; the credit gets the rest.
      layout.artistChars
        ? credit.length > layout.artistChars
          ? `${credit.slice(0, layout.artistChars - 1).trimEnd()}…`
          : credit
        : truncateToWidth(credit, 70, { fontSize: 8, letterSpacing: 0.7 }),
    ),

    art_window: artBlock(layout, artDataUri),
    professions: tagsBlock(layout.tags, printedTags(card)),
    ability: abilityBlock(layout.ability, {
      keyword: keyword?.name ?? "",
      description: keyword?.description ?? "",
    }),
    flavour: flavourBlock(
      layout.flavour,
      options.flavour ?? card.flavour ?? "",
    ),
    stat_bar: statBarBlock(layout.statBar, card),
  };

  // Palette tokens can appear inside generated blocks too (a chip fill, say), so
  // substitute until nothing is left rather than in a single pass.
  let svg = template;
  for (let pass = 0; pass < 3; pass++) {
    const before = svg;
    svg = svg.replace(/\{([a-z_]+)\}/g, (match, token: string) =>
      token in substitutions ? substitutions[token] : match,
    );
    if (svg === before) break;
  }

  return svg;
};

/**
 * Renders a card to a PNG buffer.
 *
 * Never throws: a card that cannot be rendered returns null so the caller can
 * fall back to the text face rather than failing a whole pack reveal.
 */
export const renderCardImage = async (
  card: BattleCard,
  options: RenderCardOptions = {},
): Promise<Buffer | null> => {
  try {
    const svg = await buildCardSvg(card, options);
    return await sharp(Buffer.from(svg), { density: DENSITY })
      .resize({ width: options.width ?? CARD_WIDTH })
      .png()
      .toBuffer();
  } catch (error) {
    console.error(`Couldn't render v2 card "${card.name}":`, error);
    return null;
  }
};

/** A Discord-friendly attachment filename for a card: a GIF for a Legendary. */
export const cardImageName = (card: BattleCard): string =>
  `${card.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-${(card.instanceId || "card").slice(0, 6)}.${legendaryCode(card.legendary) ? "gif" : "png"}`;

/**
 * Renders several cards concurrently and returns Discord attachments.
 *
 * A card that fails to render is dropped rather than failing the batch, so one
 * bad artwork URL cannot take down a whole pack reveal. Callers keep the text
 * rendering as the fallback, which is why this returns whatever succeeded rather
 * than throwing.
 */
export const renderCardAttachments = async (
  cards: BattleCard[],
  options: RenderCardOptions = {},
): Promise<{ name: string; buffer: Buffer }[]> => {
  const rendered = await Promise.all(
    cards.map(async (card) => {
      const buffer = await renderCardImage(card, options);
      return buffer ? { name: cardImageName(card), buffer } : null;
    }),
  );

  return rendered.filter(
    (entry): entry is { name: string; buffer: Buffer } => entry !== null,
  );
};
