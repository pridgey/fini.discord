import sharp from "sharp";
import type { DungeonState, PathNode, RoomTag } from "../dungeon";
import { EVENT_PURPLE, GOLD, crown, n, swords, text } from "./dungeonScene";
import { TYPE_PALETTES } from "./palettes";
import { truncateToWidth } from "./svgText";

/**
 * The end-of-run summary: the run's numbers, and the path it took.
 *
 * The path is one node per room, left to right and wrapping, coloured the way
 * the doors were. Hanging off each step is a small dot for the door that was
 * not taken, which is what turns a list of rooms into a record of choices.
 */

const WIDTH = 380;
const PER_ROW = 12;
const MAX_ROWS = 4;
const STEP = 29.5;
const ROW = { top: 112, height: 44 };
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
  width: number,
  label: string,
  value: string,
  fill = "#ffffff",
): string =>
  [
    `<rect x="${n(x)}" y="34" width="${n(width)}" height="36" rx="5" fill="#ffffff" fill-opacity="0.06" stroke="#ffffff" stroke-opacity="0.1"></rect>`,
    text(x + 7, 46, label, {
      size: 6,
      mono: true,
      spacing: 0.8,
      opacity: 0.55,
    }),
    text(x + 7, 63.5, value, {
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
};

export const buildDungeonSummarySvg = ({
  progress,
  fell,
  coin: paid,
}: DungeonSummaryInput): string => {
  const { path, stats } = progress;
  const shown = path.slice(-PER_ROW * MAX_ROWS);
  const offset = path.length - shown.length;
  const rows = Math.max(1, Math.ceil(shown.length / PER_ROW));
  const height = ROW.top + rows * ROW.height + 14;

  const [mvp, mvpWins] = Object.entries(stats.cardWins).sort(
    (a, b) => b[1] - a[1],
  )[0] ?? ["", 0];

  const tiles: [string, string, string?][] = [
    ["ROOMS", String(progress.depth)],
    ["FIGHTS WON", String(progress.fightsWon)],
    ["BOSSES", String(progress.bossesWon)],
    ["EVENTS WON", String(stats.eventsPassed)],
    ["GELD MADE", String(stats.geldEarned), GOLD],
    ["PAID OUT", `${paid} fc`, GOLD],
  ];
  const gap = 5;
  const tileWidth = (WIDTH - 24 - gap * (tiles.length - 1)) / tiles.length;

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
    ...tiles.map(([label, value, fill], index) =>
      tile(12 + index * (tileWidth + gap), tileWidth, label, value, fill),
    ),
    mvp
      ? text(
          12,
          87,
          `MVP · ${truncateToWidth(mvp, 190, { fontSize: 8, bold: true })} · ${mvpWins} ${mvpWins === 1 ? "WIN" : "WINS"}`.toUpperCase(),
          { size: 7.5, weight: 700, spacing: 0.8, mono: true, opacity: 0.85 },
        )
      : "",
    ...legend.map(([colour, label], index) => {
      const x = WIDTH - 12 - (legend.length - index) * 40 + 6;
      return `<circle cx="${n(x)}" cy="84.5" r="2.6" fill="${colour}"></circle>${text(x + 5, 87, label, { size: 5.6, mono: true, spacing: 0.5, opacity: 0.6 })}`;
    }),
    `<path d="M12 97.5 H${WIDTH - 12}" stroke="#ffffff" stroke-opacity="0.1"></path>`,
    text(
      12,
      108,
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
    return await sharp(Buffer.from(buildDungeonSummarySvg(input)), {
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
