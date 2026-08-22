import { readFile } from "fs/promises";
import { join } from "path";
import sharp from "sharp";
import { pb } from "../../../utilities/pocketbase";
import { findKeyword } from "../keywords";
import type { BattleCard } from "../types";
import {
  abilityBlock,
  artBlock,
  flavourBlock,
  statBarBlock,
  tagsBlock,
} from "./blocks";
import { layoutFor, type TemplateLayout } from "./layouts";
import { paletteTokens } from "./palettes";
import { escapeXml, truncateToWidth } from "./svgText";

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

/** Output width in pixels. The templates are 320x448 user units. */
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
};

/**
 * Where a card's artwork comes from.
 *
 * Converted cards have an empty `art_url` but carry `legacy_card`, so their v1
 * artwork can be pulled straight out of Pocketbase - which means the whole
 * converted pool has art on day one without anyone uploading anything.
 */
export const resolveArtSource = async (
  definition: { art_url?: string; legacy_card?: string },
): Promise<CardArtSource | null> => {
  if (definition.art_url) return { url: definition.art_url };

  if (definition.legacy_card) {
    try {
      const legacy = await pb
        .collection("card_definition")
        .getOne(definition.legacy_card);
      if (legacy?.image) {
        return { url: pb.files.getURL(legacy, legacy.image as string) };
      }
    } catch {
      // No legacy row, or it lost its image - fall through to no art.
    }
  }

  return null;
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
): Promise<string | null> => {
  try {
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

    const png = await sharp(input)
      .resize({
        width: Math.round(window.w * scale),
        height: Math.round(window.h * scale),
        fit: "cover",
        position: "attention",
      })
      .png()
      .toBuffer();

    return `data:image/png;base64,${png.toString("base64")}`;
  } catch (error) {
    console.error("Couldn't prepare v2 card art:", error);
    return null;
  }
};

/** A short, stable card number for the footer, e.g. `FC-7Q4K2M · U`. */
const cardNumber = (card: BattleCard, rarityCode: string): string => {
  const stem = (card.definitionId || card.instanceId || "000000")
    .replace(/[^a-z0-9]/gi, "")
    .slice(0, 6)
    .toUpperCase();
  return `FC-${stem} · ${rarityCode}`;
};

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

/**
 * Builds the finished SVG for a card. Exported separately from the PNG render so
 * tests can assert on the markup without paying for rasterisation.
 */
export const buildCardSvg = async (
  card: BattleCard,
  options: RenderCardOptions = {},
): Promise<string> => {
  const layout = layoutFor(card.rarity, card.foil);
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
      })));

  const artDataUri = source
    ? await prepareArt(source, layout.art, width / 320)
    : null;

  const keyword = findKeyword(card.keyword);
  const faction = options.faction ?? card.series ?? "";

  const substitutions: Record<string, string> = {
    ...paletteTokens(card.type),

    card_name: escapeXml(
      truncateToWidth(card.name, layout.name.maxWidth, {
        fontSize: layout.name.size,
        bold: layout.name.bold,
      }),
    ),
    faction: escapeXml(
      truncateToWidth(faction.toUpperCase(), layout.factionMaxWidth, {
        fontSize: 10.5,
        letterSpacing: 1.9,
        bold: true,
      }),
    ),
    watermark: escapeXml((faction.trim()[0] ?? "F").toUpperCase()),
    rarity_code: layout.rarityCode,
    card_number: cardNumber(card, layout.rarityCode),
    artist: escapeXml(
      truncateToWidth(options.artist ?? card.artist ?? "ART / —", 110, {
        fontSize: 8,
        letterSpacing: 0.7,
      }),
    ),

    art_window: artBlock(layout, artDataUri),
    professions: tagsBlock(layout.tags, card.tags ?? []),
    ability: abilityBlock(layout.ability, {
      keyword: keyword?.name ?? "",
      description: keyword?.description ?? "",
    }),
    flavour: flavourBlock(layout.flavour, options.flavour ?? card.flavour ?? ""),
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

/** A Discord-friendly attachment filename for a card. */
export const cardImageName = (card: BattleCard): string =>
  `${card.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-${(card.instanceId || "card").slice(0, 6)}.png`;

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
