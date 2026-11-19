import sharp from "sharp";
import type { DungeonState, PathNode, RoomTag } from "../dungeon";
import { EVENT_PURPLE, GOLD, crown, n, swords, text } from "./dungeonScene";
import type { BattleCard } from "../types";
import { panelArt } from "./battleBoard";
import { TYPE_PALETTES } from "./palettes";
import { escapeXml, truncateToWidth } from "./svgText";

/**
 * The end-of-run summary: the run's numbers, and the path it took.
 *
 * The path is one node per room, left to right and wrapping, coloured the way
 * the doors were. Hanging off each step is a small dot for the door that was
 * not taken, which is what turns a list of rooms into a record of choices.
 *
 * The card that won the most fights stands beside the numbers as the run's
 * MVP, its art framed in gold, cropped the way the battle board crops it.
 */

const WIDTH = 380;
const PER_ROW = 12;
const MAX_ROWS = 4;
const STEP = 29.5;
const ROW = { top: 176, height: 44 };
/** The MVP's card, beside the numbers. */
const MVP = { width: 112, height: 120, y: 32 };
const MVP_X = WIDTH - 12 - MVP.width;
const TILES = { top: 34, height: 37, gap: 5, rowGap: 5 };
const FIRST_X = 27;
const RED = "#ff6b5e";
const INK = "#0b0c16";

export const DUNGEON_SUMMARY_FILE = "dungeon-summary.png";
export const DUNGEON_SUMMARY_WIDTH = 1140;

const colourOf = (tag: RoomTag): string =>
  tag.kind === "shop"
    ? GOLD
    : tag.kind === "event"
      ? EVENT_PURPLE
      : TYPE_PALETTES[tag.type].bright;

const node = (entry: PathNode, x: number, y: number, room: number): string => {
  const { room: tag, result } = entry;
  const colour = colourOf(tag);
  const boss = tag.kind === "fight" && tag.tier === "boss";
  const radius = boss ? 10.5 : 8.5;
  const fell = result === "fell";
  const faded = result === "failed" || result === "warded";

  const icon =
    tag.kind === "shop"
      ? `<circle cx="${n(x)}" cy="${n(y)}" r="3.6" fill="none" stroke="${INK}" stroke-width="1.4"></circle>`
      : tag.kind === "event"
        ? text(x, y + 3.6, "?", {
            size: 10,
            weight: 800,
            anchor: "middle",
            fill: faded ? colour : INK,
          })
        : swords(x, y, 3.6, fell ? RED : faded ? colour : INK);

  return [
    tag.kind === "fight" && tag.tier === "elite"
      ? `<circle cx="${n(x)}" cy="${n(y)}" r="${radius + 3}" fill="none" stroke="${colour}" stroke-width="1.4" stroke-dasharray="1.4 3.2"></circle>`
      : "",
    `<circle cx="${n(x)}" cy="${n(y)}" r="${radius}" fill="${fell || faded ? INK : colour}" stroke="${fell ? RED : colour}" stroke-width="1.6"></circle>`,
    icon,
    boss ? crown(x, y - radius - 1.5, 13) : "",
    text(x, y + radius + 9, String(room), {
      size: 5.6,
      mono: true,
      anchor: "middle",
      opacity: 0.5,
    }),
  ].join("");
};

const tile = (
  x: number,
  y: number,
  width: number,
  label: string,
  value: string,
  fill = "#ffffff",
): string =>
  [
    `<rect x="${n(x)}" y="${n(y)}" width="${n(width)}" height="${TILES.height}" rx="5" fill="#ffffff" fill-opacity="0.06" stroke="#ffffff" stroke-opacity="0.1"></rect>`,
    text(x + 7, y + 12, label, {
      size: 6,
      mono: true,
      spacing: 0.8,
      opacity: 0.55,
    }),
    text(x + 7, y + 30, value, {
      size: value.length > 5 ? 11 : 14,
      weight: 800,
      fill,
    }),
  ].join("");

export type DungeonSummaryInput = {
  progress: DungeonState;
  fell: boolean;
  /** Finicoin the run paid. */
  coin: number;
  /** The hand, to find the MVP's card - and its art - by name. */
  hand?: BattleCard[];
};

/** The card that won the most fights, and how many. Null before any win. */
export const mvpOf = (
  progress: DungeonState,
): { name: string; wins: number } | null => {
  const [top] = Object.entries(progress.stats.cardWins).sort(
    (a, b) => b[1] - a[1],
  );
  return top && top[1] > 0 ? { name: top[0], wins: top[1] } : null;
};

/** The MVP's card: its art, framed in gold, its name and wins over a fade. */
const mvpPanel = (
  mvp: { name: string; wins: number },
  card: BattleCard | undefined,
  art: string | null,
): string => {
  const { width, height, y } = MVP;
  const x = MVP_X;
  const palette = card ? TYPE_PALETTES[card.type] : null;
  const name = truncateToWidth(mvp.name, width - 16, {
    fontSize: 10,
    bold: true,
  });
  return [
    `<defs><clipPath id="mvp"><rect x="${x}" y="${y}" width="${width}" height="${height}" rx="7"></rect></clipPath>`,
    `<linearGradient id="mvpfade" x1="0" y1="0" x2="0" y2="1"><stop offset="0.5" stop-color="${INK}" stop-opacity="0"></stop><stop offset="1" stop-color="${INK}" stop-opacity="0.92"></stop></linearGradient></defs>`,
    `<g clip-path="url(#mvp)">`,
    `<rect x="${x}" y="${y}" width="${width}" height="${height}" fill="${palette?.deep ?? "#252a44"}"></rect>`,
    art
      ? `<image x="${x}" y="${y}" width="${width}" height="${height}" preserveAspectRatio="xMidYMid slice" xlink:href="${art}"></image>`
      : "",
    `<rect x="${x}" y="${y}" width="${width}" height="${height}" fill="url(#mvpfade)"></rect>`,
    `</g>`,
    `<rect x="${x + 0.8}" y="${y + 0.8}" width="${width - 1.6}" height="${height - 1.6}" rx="6.5" fill="none" stroke="${GOLD}" stroke-width="1.6"></rect>`,
    `<rect x="${x + 6}" y="${y + 6}" width="27" height="11" rx="5.5" fill="${GOLD}"></rect>`,
    text(x + 19.5, y + 14.2, "MVP", {
      size: 6.5,
      weight: 800,
      spacing: 0.8,
      mono: true,
      anchor: "middle",
      fill: INK,
    }),
    `<text x="${x + 8}" y="${y + height - 17}" font-size="10" font-weight="800" fill="#ffffff">${escapeXml(name)}</text>`,
    text(
      x + 8,
      y + height - 7,
      `${mvp.wins} ${mvp.wins === 1 ? "FIGHT" : "FIGHTS"} WON`,
      { size: 6, weight: 700, spacing: 0.8, mono: true, fill: GOLD },
    ),
  ].join("");
};

export const buildDungeonSummarySvg = ({
  progress,
  fell,
  coin: paid,
  hand,
  mvpArt = null,
}: DungeonSummaryInput & { mvpArt?: string | null }): string => {
  const { path, stats } = progress;
  const shown = path.slice(-PER_ROW * MAX_ROWS);
  const offset = path.length - shown.length;
  const rows = Math.max(1, Math.ceil(shown.length / PER_ROW));
  const height = ROW.top + rows * ROW.height + 14;

  const mvp = mvpOf(progress);
  const mvpCard = mvp ? hand?.find((card) => card.name === mvp.name) : undefined;

  const tiles: [string, string, string?][] = [
    ["ROOMS", String(progress.depth)],
    ["FIGHTS WON", String(progress.fightsWon)],
    ["BOSSES", String(progress.bossesWon)],
    ["EVENTS WON", String(stats.eventsPassed)],
    ["GELD MADE", String(stats.geldEarned), GOLD],
    ["PAID OUT", `${paid} fc`, GOLD],
  ];
  // Three across, two down, beside the MVP's card when there is one.
  const tilesRight = mvp ? MVP_X - 8 : WIDTH - 12;
  const tileWidth = (tilesRight - 12 - TILES.gap * 2) / 3;
  const tileAt = (index: number) => ({
    x: 12 + (index % 3) * (tileWidth + TILES.gap),
    y: TILES.top + Math.floor(index / 3) * (TILES.height + TILES.rowGap),
  });
  const legendY = TILES.top + 2 * TILES.height + TILES.rowGap + 16;

  const position = (index: number) => ({
    x: FIRST_X + (index % PER_ROW) * STEP,
    y: ROW.top + Math.floor(index / PER_ROW) * ROW.height + 20,
  });

  const steps = shown.map((entry, index) => {
    const { x, y } = position(index);
    const lead = x - STEP / 2;
    return [
      // The step into this room, and the door left behind on the way.
      index === 0 && offset === 0
        ? ""
        : `<path d="M${n(index % PER_ROW === 0 ? lead : x - STEP)} ${n(y)} H${n(x)}" stroke="#ffffff" stroke-opacity="0.28" stroke-width="1.4" stroke-linecap="round"></path>`,
      entry.skipped
        ? `<path d="M${n(lead)} ${n(y)} V${n(y - 13)}" stroke="#ffffff" stroke-opacity="0.2" stroke-width="1"></path><circle cx="${n(lead)}" cy="${n(y - 15)}" r="3.2" fill="${colourOf(entry.skipped)}" fill-opacity="0.55"></circle>`
        : "",
    ].join("");
  });

  const legend: [string, string][] = [
    [TYPE_PALETTES.power.bright, "POWER"],
    [TYPE_PALETTES.wit.bright, "WIT"],
    [TYPE_PALETTES.heart.bright, "HEART"],
    [GOLD, "SHOP"],
    [EVENT_PURPLE, "EVENT"],
  ];

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${WIDTH}" height="${height}" viewBox="0 0 ${WIDTH} ${height}" font-family="Archivo, sans-serif">`,
    `<defs><linearGradient id="sheet" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1a1d33"></stop><stop offset="1" stop-color="#0d0f1c"></stop></linearGradient></defs>`,
    `<rect width="${WIDTH}" height="${height}" rx="10" fill="url(#sheet)"></rect>`,
    text(
      12,
      22,
      fell
        ? `FELL IN ROOM ${progress.depth}`
        : `WALKED OUT OF ROOM ${progress.depth}`,
      {
        size: 9,
        weight: 800,
        spacing: 1.6,
        mono: true,
        fill: fell ? RED : "#ffffff",
      },
    ),
    text(WIDTH - 12, 22, `${progress.geld} GELD IN HAND`, {
      size: 8,
      weight: 700,
      spacing: 1,
      mono: true,
      anchor: "end",
      fill: GOLD,
    }),
    ...tiles.map(([label, value, fill], index) => {
      const { x, y } = tileAt(index);
      return tile(x, y, tileWidth, label, value, fill);
    }),
    mvp ? mvpPanel(mvp, mvpCard, mvpArt) : "",
    ...legend.map(([colour, label], index) => {
      const x = 15 + index * 40;
      return `<circle cx="${n(x)}" cy="${legendY - 2.5}" r="2.6" fill="${colour}"></circle>${text(x + 5, legendY, label, { size: 5.6, mono: true, spacing: 0.5, opacity: 0.6 })}`;
    }),
    `<path d="M12 ${ROW.top - 15.5} H${WIDTH - 12}" stroke="#ffffff" stroke-opacity="0.1"></path>`,
    text(
      12,
      ROW.top - 4,
      offset > 0
        ? `THE LAST ${shown.length} ROOMS · SMALL DOTS ARE THE DOORS NOT TAKEN`
        : "THE PATH · SMALL DOTS ARE THE DOORS NOT TAKEN",
      {
        size: 5.6,
        mono: true,
        spacing: 0.8,
        opacity: 0.45,
      },
    ),
    ...steps,
    ...shown.map((entry, index) => {
      const { x, y } = position(index);
      return node(entry, x, y, offset + index + 1);
    }),
    `</svg>`,
  ].join("");
};

/** Null if it cannot be drawn; the message's text already has the numbers. */
export const renderDungeonSummary = async (
  input: DungeonSummaryInput,
): Promise<Buffer | null> => {
  if (input.progress.path.length === 0) return null;

  try {
    // The MVP's art at the size it's drawn, from its own hand card.
    const mvp = mvpOf(input.progress);
    const card = mvp
      ? input.hand?.find((entry) => entry.name === mvp.name)
      : undefined;
    const scale = DUNGEON_SUMMARY_WIDTH / WIDTH;
    const mvpArt = card
      ? await panelArt(
          card,
          Math.round(MVP.width * scale),
          Math.round(MVP.height * scale),
          false,
        )
      : null;
    return await sharp(Buffer.from(buildDungeonSummarySvg({ ...input, mvpArt })), {
      density: 300,
    })
      .resize({ width: DUNGEON_SUMMARY_WIDTH })
      .png()
      .toBuffer();
  } catch (error) {
    console.error("Couldn't render a v2 dungeon summary:", error);
    return null;
  }
};
