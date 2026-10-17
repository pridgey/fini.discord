import sharp from "sharp";
import type { BattleCard } from "../types";
import { renderCardImage } from "./generateCardImage";

/**
 * A page of a card binder: a grid of pockets with a card in each.
 *
 * This is the collection as something to look at rather than a list to read -
 * six cards to a page, three across. A Legendary sits in its pocket as a still;
 * it moves when the card itself is opened, so its pocket is lit gold and
 * tagged to say there is more to see. A foil's pocket is edged and tagged too:
 * at this size its border alone is easy to miss. A page that is not full shows its empty
 * pockets, the way a real binder does.
 */

export const BINDER_COLUMNS = 3;
export const BINDER_ROWS = 2;
/** Cards to a binder page. */
export const BINDER_PAGE_SIZE = BINDER_COLUMNS * BINDER_ROWS;

/** Cards share one shape on every frame: 606 x 849. */
const CARD = { w: 340, h: Math.round((340 * 849) / 606) };
const POCKET_PAD = 12;
const GAP = 18;
const MARGIN = 30;

const LEGENDARY_GOLD = "#f5c451";
/** The tag that sits on the top edge of a Legendary's pocket. */
const TAG = { w: 262, h: 24 };
const FOIL_TAG = { w: 112, h: 24 };
/** The cards' own foil prism, for the tag and edge of a foil's pocket. */
const FOIL_GRADIENT = `<linearGradient id="foilTag" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="0.25" stop-color="#F28BA6"/><stop offset="0.5" stop-color="#b7f0e2"/><stop offset="0.75" stop-color="#8B95FF"/><stop offset="1" stop-color="#ffffff"/></linearGradient>`;

const pocket = { w: CARD.w + POCKET_PAD * 2, h: CARD.h + POCKET_PAD * 2 };

/** The page's size in pixels for a grid of `columns` by `rows`. */
export const binderPageSize = (
  columns = BINDER_COLUMNS,
  rows = BINDER_ROWS,
) => ({
  width: MARGIN * 2 + columns * pocket.w + (columns - 1) * GAP,
  height: MARGIN * 2 + rows * pocket.h + (rows - 1) * GAP,
});

/** Where pocket `index` sits on the page, reading across then down. */
const pocketAt = (index: number, columns: number) => ({
  x: MARGIN + (index % columns) * (pocket.w + GAP),
  y: MARGIN + Math.floor(index / columns) * (pocket.h + GAP),
});

/**
 * Renders up to a page of cards into their pockets. Cards beyond the page's
 * pockets are left off; one that fails to draw leaves its pocket empty rather
 * than failing the page.
 */
export const renderBinderPage = async (
  cards: BattleCard[],
  options: { columns?: number; rows?: number } = {},
): Promise<Buffer> => {
  const columns = options.columns ?? BINDER_COLUMNS;
  const rows = options.rows ?? BINDER_ROWS;
  const { width, height } = binderPageSize(columns, rows);
  const shown = cards.slice(0, columns * rows);

  const pockets = Array.from({ length: columns * rows }, (_, index) => {
    const at = pocketAt(index, columns);
    const filled = index < shown.length;
    const legendary = filled && !!shown[index].legendary;
    return [
      // A Legendary's pocket glows: the page is a still, and this is the sign
      // that the card in it is not.
      legendary
        ? `<rect x="${at.x - 5}" y="${at.y - 5}" width="${pocket.w + 10}" height="${pocket.h + 10}" rx="23" fill="${LEGENDARY_GOLD}" fill-opacity="0.55" filter="url(#glow)"/>`
        : "",
      `<rect x="${at.x}" y="${at.y}" width="${pocket.w}" height="${pocket.h}" rx="18" fill="#0d0e13" fill-opacity="${legendary ? 0.9 : filled ? 0.55 : 0.35}"/>`,
      legendary
        ? `<rect x="${at.x + 1}" y="${at.y + 1}" width="${pocket.w - 2}" height="${pocket.h - 2}" rx="17" fill="none" stroke="${LEGENDARY_GOLD}" stroke-opacity="0.9" stroke-width="2"/>`
        : "",
      // A foil's pocket is edged in its prism: quieter than a Legendary's.
      filled && shown[index].foil && !legendary
        ? `<rect x="${at.x + 1}" y="${at.y + 1}" width="${pocket.w - 2}" height="${pocket.h - 2}" rx="17" fill="none" stroke="url(#foilTag)" stroke-opacity="0.9" stroke-width="2"/>`
        : "",
      `<rect x="${at.x + 0.75}" y="${at.y + 0.75}" width="${pocket.w - 1.5}" height="${pocket.h - 1.5}" rx="17.25" fill="none" stroke="#ffffff" stroke-opacity="${filled ? 0.1 : 0.07}" stroke-width="1.5"${filled ? "" : ' stroke-dasharray="7 7"'}/>`,
    ].join("");
  }).join("");

  const page = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
<defs>
<linearGradient id="leaf" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#23252f"/><stop offset="1" stop-color="#17181f"/></linearGradient>
${FOIL_GRADIENT}
<filter id="glow" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="9"/></filter>
<linearGradient id="spine" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#000000" stop-opacity="0.38"/><stop offset="1" stop-color="#000000" stop-opacity="0"/></linearGradient>
</defs>
<rect width="${width}" height="${height}" rx="22" fill="url(#leaf)"/>
<rect width="${MARGIN * 1.6}" height="${height}" fill="url(#spine)"/>
${pockets}
</svg>`;

  const rendered = await Promise.all(
    shown.map(async (card, index) => {
      const image = await renderCardImage(card, { width: CARD.w });
      if (!image) return null;
      const at = pocketAt(index, columns);
      return {
        input: await sharp(image)
          .resize({ width: CARD.w, height: CARD.h, fit: "fill" })
          .toBuffer(),
        left: at.x + POCKET_PAD,
        top: at.y + POCKET_PAD,
      };
    }),
  );

  // Drawn over the cards: a tag on the top edge of the pocket of any card
  // that is more than it looks at this size - a Legendary, or a foil.
  const tags = shown
    .map((card, index) => {
      if (!card.legendary && !card.foil) return "";
      const at = pocketAt(index, columns);
      const centre = at.x + pocket.w / 2;
      const tag = card.legendary
        ? {
            ...TAG,
            fill: LEGENDARY_GOLD,
            text: card.foil
              ? "LEGENDARY FOIL · VIEW TO PLAY"
              : "LEGENDARY · VIEW TO PLAY",
          }
        : { ...FOIL_TAG, fill: "url(#foilTag)", text: "✦ FOIL ✦" };
      return [
        `<rect x="${centre - tag.w / 2}" y="${at.y - tag.h / 2}" width="${tag.w}" height="${tag.h}" rx="${tag.h / 2}" fill="${tag.fill}" stroke="#0d0e13" stroke-opacity="0.5"/>`,
        `<text x="${centre}" y="${at.y + 5}" text-anchor="middle" font-family="Archivo, sans-serif" font-size="13" font-weight="800" letter-spacing="1.4" fill="#1d1503">${tag.text}</text>`,
      ].join("");
    })
    .join("");
  const overlay = tags
    ? [
        {
          input: Buffer.from(
            `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><defs>${FOIL_GRADIENT}</defs>${tags}</svg>`,
          ),
          left: 0,
          top: 0,
        },
      ]
    : [];

  return sharp(Buffer.from(page))
    .composite([
      ...rendered.filter(
        (layer): layer is NonNullable<typeof layer> => layer !== null,
      ),
      ...overlay,
    ])
    .jpeg({ quality: 90 })
    .toBuffer();
};
