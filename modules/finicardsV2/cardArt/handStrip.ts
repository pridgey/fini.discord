import sharp from "sharp";
import { findKeyword } from "../keywords";
import { TYPE_PRIORITY } from "../rules";
import type { BattleCard } from "../types";
import { resolveArtSource, type CardArtSource } from "./generateCardImage";
import { STAT_LABELS, TYPE_PALETTES } from "./palettes";
import { escapeXml, truncateToWidth } from "./svgText";

/**
 * The hand strip: one wide image containing every card in a hand.
 *
 * Why this exists. A hand rendered as five portrait cards in a Discord gallery
 * gives each card roughly a fifth of the message width, at which point the stat
 * numbers are unreadable and the whole point of showing the cards is lost - you
 * have to click each one. The constraint is Discord's, not the card's: a gallery
 * splits its width between items, but a *single* item gets the full width.
 *
 * So a hand is one image, and the cards inside it are landscape strips stacked
 * vertically. Every strip then gets the full message width, which is enough room
 * to read a name, a type and three stats without clicking anything.
 *
 * Portrait cards are still the real card - `/finicard-v2 card` and pack pulls use
 * them. This layout exists purely for the "read a whole hand at a glance" job.
 */

/** One strip, in user units. */
const STRIP = { width: 380, height: 68, gap: 6 };
const PADDING = 8;

/** Art thumbnail, square so it crops predictably from any source image. */
const ART = { x: 12, y: 4, size: 60 };

/** Where the text column starts and ends. */
const TEXT = { x: 80, width: 152 };

/** The stat boxes. */
const STATS = { x: 236, right: 372, gap: 3, leadRatio: 1.7, y: 18, height: 32 };

/** Rendered width in pixels. Discord scales it down, so oversample for sharpness. */
export const HAND_STRIP_WIDTH = 1140;

const round = (value: number): string =>
  Number.isInteger(value) ? String(value) : value.toFixed(2);

/** Crops artwork to a square data URI, or null if it can't be fetched. */
const squareArt = async (
  source: CardArtSource | null,
  pixels: number,
): Promise<string | null> => {
  if (!source) return null;

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
        width: pixels,
        height: pixels,
        fit: "cover",
        position: "attention",
      })
      .png()
      .toBuffer();

    return `data:image/png;base64,${png.toString("base64")}`;
  } catch {
    return null;
  }
};

/** The three stat boxes, emphasis on the card's own type. */
const statBoxes = (card: BattleCard, top: number, index: number): string => {
  const total = STATS.right - STATS.x;
  const narrow = (total - STATS.gap * 2) / (2 + STATS.leadRatio);
  const wide = narrow * STATS.leadRatio;
  const palette = TYPE_PALETTES[card.type];

  const parts: string[] = [];
  let cursor = STATS.x;

  for (const type of TYPE_PRIORITY) {
    const isLead = type === card.type;
    const width = isLead ? wide : narrow;
    const y = top + STATS.y;
    const labels = STAT_LABELS[type];

    parts.push(
      isLead
        ? `<rect x="${round(cursor)}" y="${round(y)}" width="${round(width)}" height="${STATS.height}" rx="4" fill="url(#lead${index})"></rect>`
        : `<rect x="${round(cursor)}" y="${round(y)}" width="${round(width)}" height="${STATS.height}" rx="4" fill="#ffffff" fill-opacity="0.06" stroke="#ffffff" stroke-opacity="0.10"></rect>`,
      `<text x="${round(cursor + 7)}" y="${round(y + 13)}" font-family="JetBrains Mono, monospace" font-size="${isLead ? 7.5 : 7}" letter-spacing="0.9" fill="${isLead ? "#ffffff" : "#ffffff"}" fill-opacity="${isLead ? 0.92 : 0.45}">${isLead ? labels.full : labels.short}</text>`,
      `<text x="${round(cursor + width - 7)}" y="${round(y + 27)}" text-anchor="end" font-weight="800" font-size="${isLead ? 19 : 14}" fill="#ffffff" fill-opacity="${isLead ? 1 : 0.7}">${card.stats[type]}</text>`,
    );

    cursor += width + STATS.gap;
  }

  /* SVG ids are document-global - nesting an <svg> does not scope them - so every
     gradient and clip path is suffixed with the strip index. Without this the
     first card's gradient silently paints every other card's lead box. */
  return `<defs><linearGradient id="lead${index}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${palette.bright}"></stop><stop offset="1" stop-color="${palette.deep}"></stop></linearGradient></defs>${parts.join("")}`;
};

/** One card as a landscape strip. */
const strip = (
  card: BattleCard,
  index: number,
  artDataUri: string | null,
): string => {
  const palette = TYPE_PALETTES[card.type];
  const keyword = findKeyword(card.keyword);
  const top = 0;

  const name = truncateToWidth(card.name, TEXT.width - 14, {
    fontSize: 15,
    bold: true,
  });
  const subtitle = truncateToWidth(
    [card.series, keyword?.name].filter(Boolean).join(" · ").toUpperCase(),
    TEXT.width,
    { fontSize: 8, letterSpacing: 0.7, bold: true },
  );

  return [
    // A nested svg gives each strip its own coordinate space and its own `lead`
    // gradient id, so gradients can't collide between cards.
    `<svg x="0" y="${round(index * (STRIP.height + STRIP.gap))}" width="${STRIP.width}" height="${STRIP.height}" viewBox="0 0 ${STRIP.width} ${STRIP.height}">`,
    `<rect x="0" y="${top}" width="${STRIP.width}" height="${STRIP.height}" rx="8" fill="#141728"></rect>`,
    `<rect x="0" y="${top}" width="${STRIP.width}" height="${STRIP.height}" rx="8" fill="${palette.deep}" fill-opacity="0.14"></rect>`,
    // Type spine: the fastest possible read of what this card is.
    `<rect x="0" y="${top}" width="4" height="${STRIP.height}" fill="${palette.bright}"></rect>`,
    `<clipPath id="thumb${index}"><rect x="${ART.x}" y="${top + ART.y}" width="${ART.size}" height="${ART.size}" rx="6"></rect></clipPath>`,
    artDataUri
      ? `<image x="${ART.x}" y="${top + ART.y}" width="${ART.size}" height="${ART.size}" clip-path="url(#thumb${index})" preserveAspectRatio="xMidYMid slice" xlink:href="${artDataUri}"></image>`
      : `<rect x="${ART.x}" y="${top + ART.y}" width="${ART.size}" height="${ART.size}" rx="6" fill="#252a44"></rect>`,
    /* Index, matching the picker's button order so the two can be cross-read.
       Needs its own backing: a bare digit over artwork is unreadable against
       anything busy. */
    `<circle cx="${ART.x + 9}" cy="${top + ART.y + 9}" r="7.5" fill="#0b0c16" fill-opacity="0.72"></circle>`,
    `<text x="${ART.x + 9}" y="${top + ART.y + 12}" text-anchor="middle" font-family="JetBrains Mono, monospace" font-size="8.5" font-weight="700" fill="#ffffff" fill-opacity="0.9">${index + 1}</text>`,
    `<text x="${TEXT.x}" y="${top + 28}" font-size="15" font-weight="800" fill="#ffffff">${escapeXml(name)}</text>`,
    card.foil
      ? `<text x="${TEXT.x + TEXT.width - 22}" y="${top + 28}" font-size="11" fill="${palette.bright}">✦</text>`
      : "",
    `<text x="${TEXT.x}" y="${top + 44}" font-size="8" font-weight="700" letter-spacing="0.7" fill="${palette.bright}" fill-opacity="0.85">${escapeXml(subtitle)}</text>`,
    statBoxes(card, top, index),
    `</svg>`,
  ].join("");
};

/**
 * Renders a whole hand as one image.
 *
 * Art is fetched for every card concurrently; a card whose art can't be loaded
 * simply shows a flat panel rather than failing the hand.
 */
export const renderHandStrip = async (
  cards: BattleCard[],
  options: { width?: number } = {},
): Promise<Buffer | null> => {
  if (cards.length === 0) return null;

  try {
    const width = options.width ?? HAND_STRIP_WIDTH;
    const scale = width / (STRIP.width + PADDING * 2);
    const artPixels = Math.round(ART.size * scale);

    const artUris = await Promise.all(
      cards.map(async (card) =>
        squareArt(
          await resolveArtSource({
            art_url: card.artUrl,
            legacy_card: card.legacyCard,
          }),
          artPixels,
        ),
      ),
    );

    const innerHeight =
      cards.length * STRIP.height + (cards.length - 1) * STRIP.gap;

    const svg = [
      `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${STRIP.width + PADDING * 2}" height="${innerHeight + PADDING * 2}" viewBox="0 0 ${STRIP.width + PADDING * 2} ${innerHeight + PADDING * 2}" font-family="Archivo, sans-serif">`,
      `<g transform="translate(${PADDING} ${PADDING})">`,
      ...cards.map((card, index) => strip(card, index, artUris[index])),
      `</g>`,
      `</svg>`,
    ].join("");

    return await sharp(Buffer.from(svg), { density: 300 })
      .resize({ width })
      .png()
      .toBuffer();
  } catch (error) {
    console.error("Couldn't render a v2 hand strip:", error);
    return null;
  }
};

/**
 * Attachment filename for a hand strip.
 *
 * Trims the separators it introduces before testing for emptiness: a label of
 * "!!!" collapses to "-", which is truthy, so without the trim the fallback
 * never fired and two such labels produced the same filename - and a colliding
 * name breaks the `attachment://` reference in the gallery.
 */
export const handStripName = (label: string): string => {
  const slug = (label ?? "")
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()
    .slice(0, 24)
    .replace(/-+$/, "");

  return `hand-${slug || "player"}.png`;
};
