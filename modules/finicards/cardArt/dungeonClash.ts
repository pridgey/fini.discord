import sharp from "sharp";
import type { FightResult, FightTier } from "../dungeon";
import type { RoundResult, Side } from "../types";
import { STAT_LABELS, TYPE_PALETTES } from "./palettes";
import {
  BOARD_FILL,
  BOARD_PADDING,
  BOARD_UNITS,
  PANEL,
  PANEL_FILL,
  attackSum,
  cardPanel,
  centreColumn,
  defenceSum,
  outcomeFor,
  panelArt,
} from "./battleBoard";
import { EVENT_PURPLE, GOLD } from "./dungeonScene";
import { escapeXml, truncateToWidth } from "./svgText";

/**
 * One dungeon fight as an image: the card played against the room's enemy,
 * art and all, under a header that says how it went.
 *
 * It's the battle board's round row at a bigger size - a dungeon fight is one
 * round, so the art can take more room - with the scoreboard swapped for the
 * room and the result: cleared, a stalemate, a ward broken in the player's
 * place, or the fall that ends the run.
 *
 * Under the cards is the round's working as a small table - each side's
 * attack and what built it, the defence it hit, and the damage - the same
 * table the text version of a fight shows, so the image replaces it whole.
 */

const HEADER = { height: 48, gap: 6 };
const ROW_HEIGHT = 168;
const TABLE = { gap: 6, height: 62 };
/** Column starts in the breakdown; damage is right-aligned to the edge. */
const COLUMNS = { name: 14, attack: 176, defence: 300 };
const INNER = BOARD_UNITS - BOARD_PADDING * 2;
const RED = "#ff6b5e";

export const DUNGEON_CLASH_FILE = "dungeon-fight.png";
export const DUNGEON_CLASH_WIDTH = 1380;

const RESULT: Record<FightResult, { label: string; note: string; fill: string }> =
  {
    won: { label: "CLEARED", note: "THE DOORS ARE OPEN", fill: GOLD },
    stalemate: {
      label: "STALEMATE",
      note: "IT STILL STANDS",
      fill: "#ffffff",
    },
    warded: { label: "WARDED", note: "A WARD BROKE INSTEAD", fill: EVENT_PURPLE },
    fell: { label: "FELL", note: "THE RUN IS OVER", fill: RED },
  };

export type DungeonClashInput = {
  round: RoundResult;
  result: FightResult;
  /** The room the fight was in. */
  depth: number;
  tier: FightTier;
  playerName: string;
  /** Which side of the round is the player's: `PLAYER_SIDE`. */
  playerSide: Side;
  /** Geld the win paid, shown when it's above 0. */
  geld?: number;
};

const header = (input: DungeonClashInput): string => {
  const cx = INNER / 2;
  const { label, note, fill } = RESULT[input.result];
  const enemySide: Side = input.playerSide === "challenger" ? "defender" : "challenger";
  const sideX = (side: Side) => (side === "challenger" ? 14 : INNER - 14);
  const anchor = (side: Side) => (side === "challenger" ? "start" : "end");
  const name = truncateToWidth(input.playerName, cx - 70, {
    fontSize: 14,
    bold: true,
  });
  const tier =
    input.tier === "boss" ? "BOSS" : input.tier === "elite" ? "ELITE" : "FIGHT";

  return [
    `<rect x="0" y="0" width="${INNER}" height="${HEADER.height}" rx="8" fill="${PANEL_FILL}"></rect>`,
    // The player's side: who played.
    `<text x="${sideX(input.playerSide)}" y="22" text-anchor="${anchor(input.playerSide)}" font-size="14" font-weight="800" fill="#ffffff">${escapeXml(name)}</text>`,
    `<text x="${sideX(input.playerSide)}" y="35" text-anchor="${anchor(input.playerSide)}" font-family="JetBrains Mono, monospace" font-size="7" font-weight="700" letter-spacing="1.2" fill="#ffffff" fill-opacity="0.45">YOUR CARD</text>`,
    // The dungeon's side: where.
    `<text x="${sideX(enemySide)}" y="22" text-anchor="${anchor(enemySide)}" font-size="14" font-weight="800" fill="${input.tier === "boss" ? GOLD : "#ffffff"}">Room ${input.depth}</text>`,
    `<text x="${sideX(enemySide)}" y="35" text-anchor="${anchor(enemySide)}" font-family="JetBrains Mono, monospace" font-size="7" font-weight="700" letter-spacing="1.2" fill="${input.tier === "boss" ? GOLD : "#ffffff"}" fill-opacity="${input.tier === "normal" ? 0.45 : 0.9}">${tier}</text>`,
    // How it went, in the middle.
    `<text x="${cx}" y="25" text-anchor="middle" font-size="19" font-weight="800" letter-spacing="1.5" fill="${fill}">${label}</text>`,
    `<text x="${cx}" y="38" text-anchor="middle" font-family="JetBrains Mono, monospace" font-size="6.5" font-weight="700" letter-spacing="1.2" fill="${input.result === "won" && input.geld ? GOLD : "#ffffff"}" fill-opacity="${input.result === "won" && input.geld ? 0.95 : 0.5}">${
      input.result === "won" && input.geld ? `+${input.geld} GELD` : note
    }</text>`,
  ].join("");
};

/** The round's working, a row per side, the player's first. */
const breakdown = (input: DungeonClashInput, top: number): string => {
  const { round, playerSide } = input;
  const sides: Side[] =
    playerSide === "challenger"
      ? ["challenger", "defender"]
      : ["defender", "challenger"];
  const mono = `font-family="JetBrains Mono, monospace"`;
  const heading = (x: number, label: string, anchor = "start") =>
    `<text x="${x}" y="${top + 15}" text-anchor="${anchor}" ${mono} font-size="6" font-weight="700" letter-spacing="1.1" fill="#ffffff" fill-opacity="0.45">${label}</text>`;

  const rows = sides.map((side, i) => {
    const combat = round[side];
    const y = top + 33 + i * 17;
    const palette = TYPE_PALETTES[combat.printedType];
    const won = round.winner === side;
    const name = truncateToWidth(combat.card.name, COLUMNS.attack - COLUMNS.name - 22, {
      fontSize: 9.5,
      bold: true,
    });
    return [
      `<rect x="${COLUMNS.name}" y="${y - 7}" width="7" height="7" rx="1.5" fill="${palette.bright}"></rect>`,
      `<text x="${COLUMNS.name + 12}" y="${y}" font-size="9.5" font-weight="800" fill="#ffffff">${escapeXml(name)}</text>`,
      `<text x="${COLUMNS.attack}" y="${y}" ${mono} font-size="8.5" font-weight="600" fill="#ffffff" fill-opacity="0.85"><tspan fill="${palette.bright}" font-weight="700">${STAT_LABELS[combat.printedType].short}</tspan> ${escapeXml(attackSum(combat))}</text>`,
      `<text x="${COLUMNS.defence}" y="${y}" ${mono} font-size="8.5" font-weight="600" fill="#ffffff" fill-opacity="0.85">${escapeXml(defenceSum(combat))}</text>`,
      `<text x="${INNER - 14}" y="${y + 0.5}" text-anchor="end" font-size="11" font-weight="800" fill="${won ? GOLD : "#ffffff"}" fill-opacity="${won || round.winner === "draw" ? 1 : 0.6}">${combat.damage}</text>`,
    ].join("");
  });

  return [
    `<rect x="0" y="${top}" width="${INNER}" height="${TABLE.height}" rx="8" fill="${PANEL_FILL}"></rect>`,
    heading(COLUMNS.name, "CARD"),
    heading(COLUMNS.attack, "ATTACK"),
    heading(COLUMNS.defence, "DEFENCE IT HIT"),
    heading(INNER - 14, "DAMAGE", "end"),
    `<path d="M${COLUMNS.name} ${top + 21} H${INNER - 14}" stroke="#ffffff" stroke-opacity="0.08"></path>`,
    ...rows,
  ].join("");
};

/**
 * Renders a dungeon fight, or null if it can't be drawn - the message falls
 * back to the text round. Missing art degrades to a flat panel.
 */
export const renderDungeonClash = async (
  input: DungeonClashInput,
  options: { width?: number } = {},
): Promise<Buffer | null> => {
  try {
    const width = options.width ?? DUNGEON_CLASH_WIDTH;
    const scale = width / BOARD_UNITS;
    const artFor = (side: Side) =>
      panelArt(
        input.round[side].card,
        Math.round(PANEL.width * scale),
        Math.round(ROW_HEIGHT * scale),
        outcomeFor(input.round, side) === "lost",
      );
    const [challenger, defender] = await Promise.all([
      artFor("challenger"),
      artFor("defender"),
    ]);

    const tableTop = HEADER.height + HEADER.gap + ROW_HEIGHT + TABLE.gap;
    const height = tableTop + TABLE.height + BOARD_PADDING * 2;
    const svg = [
      `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${BOARD_UNITS}" height="${height}" viewBox="0 0 ${BOARD_UNITS} ${height}" font-family="Archivo, sans-serif">`,
      `<rect x="0" y="0" width="${BOARD_UNITS}" height="${height}" rx="12" fill="${BOARD_FILL}"></rect>`,
      `<g transform="translate(${BOARD_PADDING} ${BOARD_PADDING})">`,
      header(input),
      `<g transform="translate(0 ${HEADER.height + HEADER.gap})">`,
      cardPanel(input.round, "challenger", challenger, ROW_HEIGHT, "clash", false),
      centreColumn(input.round, ROW_HEIGHT, null),
      cardPanel(input.round, "defender", defender, ROW_HEIGHT, "clash", false),
      `</g>`,
      breakdown(input, tableTop),
      `</g>`,
      `</svg>`,
    ].join("");

    return await sharp(Buffer.from(svg), { density: 300 })
      .resize({ width })
      .png()
      .toBuffer();
  } catch (error) {
    console.error("Couldn't render a dungeon fight:", error);
    return null;
  }
};
