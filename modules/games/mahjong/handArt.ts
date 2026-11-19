import sharp from "sharp";
import type { Grouping, HandGroup } from "./grouping";
import { FONT, GOLD, MUTED, RED, TEXT, esc, tileSvg } from "./render";
import {
  kindOf,
  numberOf,
  parseTiles,
  tileOf,
  type Kind,
  type Tile,
} from "./tiles";

/**
 * Teaching pictures: a hand laid out as its sets, pair, half-built sets and
 * loose tiles, each labelled, under a tracker that fills toward the goal of
 * four sets and a pair. The same layout draws a winning hand, and the
 * examples in How to play.
 */

const W = 920;
const PANEL = "#1d2333";
const PANEL_EDGE = "#2c3550";
const AMBER = "#e8a33d";
const GREY = "#7d8599";
const SET_GREEN = "#4cc27e";
const PAIR_BLUE = "#5b9cf0";

const SUIT_WORD: Record<string, string> = { m: "Char", p: "Circ", s: "Bam" };

/** "3 or 6 Circ", "the 5 Bam", "a White" - what a half-built set is waiting for. */
export const needsText = (needs: Kind[]): string => {
  if (!needs.length) return "";
  const tile = tileOf(needs[0]);
  if (tile[1] === "z")
    return `needs ${["East", "South", "West", "North", "White", "Green", "Red"][needs[0] - 27]}`;
  return `needs ${needs.map((k) => numberOf(k)).join(" or ")} ${SUIT_WORD[tile[1]]}`;
};

const groupStyle = (g: HandGroup): { colour: string; label: string } => {
  switch (g.type) {
    case "set":
      return {
        colour: SET_GREEN,
        label: g.shape === "run" ? "run ✓" : "triplet ✓",
      };
    case "pair":
      return { colour: PAIR_BLUE, label: "pair ✓" };
    case "partial":
      return { colour: AMBER, label: needsText(g.needs) };
    case "loose":
      return {
        colour: GREY,
        label: g.tiles.length > 1 ? "loose tiles" : "loose",
      };
    case "called":
      return { colour: SET_GREEN, label: `called ${g.meld.type} ✓` };
  }
};

const groupTiles = (g: HandGroup): Tile[] =>
  g.type === "called" ? g.meld.tiles : g.tiles;

export type StripOptions = {
  grouping: Grouping;
  /** Big text at the top right: "2 tiles from ready". */
  headline: string;
  headlineColour?: string;
  /** The tile just drawn (outlined gold, tagged "new"). */
  drawn?: Tile | null;
  /** A tile to suggest discarding (tagged "discard?"). */
  suggest?: Tile | null;
  /** Winning tiles, with how many are still out there. */
  waits?: { tile: Tile; left: number }[];
  /** Hide the goal tracker (example pictures that have their own title). */
  title?: string;
  /** Tag over the drawn tile ("new", or "winning tile"). */
  drawnLabel?: string;
};

/** The goal tracker: four set boxes and a pair circle (or seven pair circles). */
const trackerSvg = (g: Grouping, x: number, y: number): string => {
  const parts: string[] = [
    `<text x="${x}" y="${y + 24}" font-family="${FONT}" font-size="17" font-weight="700" fill="${MUTED}" letter-spacing="2">GOAL</text>`,
  ];
  let cx = x + 66;
  if (g.mode === "pairs") {
    for (let i = 0; i < 7; i++) {
      const done = i < g.done;
      parts.push(
        `<circle cx="${cx + 14}" cy="${y + 17}" r="13" fill="${done ? PAIR_BLUE : "none"}" stroke="${done ? PAIR_BLUE : GREY}" stroke-width="2.5"/>`,
        done
          ? `<text x="${cx + 14}" y="${y + 23}" font-family="${FONT}" font-size="16" font-weight="700" text-anchor="middle" fill="${PANEL}">✓</text>`
          : "",
      );
      cx += 34;
    }
    parts.push(
      `<text x="${cx + 6}" y="${y + 24}" font-family="${FONT}" font-size="16" fill="${MUTED}">7 pairs</text>`,
    );
    return parts.join("");
  }
  for (let i = 0; i < 4; i++) {
    const done = i < g.done;
    parts.push(
      `<rect x="${cx}" y="${y + 3}" width="28" height="28" rx="6" fill="${done ? SET_GREEN : "none"}" stroke="${done ? SET_GREEN : GREY}" stroke-width="2.5"/>`,
      done
        ? `<text x="${cx + 14}" y="${y + 24}" font-family="${FONT}" font-size="17" font-weight="700" text-anchor="middle" fill="${PANEL}">✓</text>`
        : "",
    );
    cx += 36;
  }
  parts.push(
    `<text x="${cx + 4}" y="${y + 25}" font-family="${FONT}" font-size="22" font-weight="700" fill="${MUTED}">+</text>`,
  );
  cx += 26;
  parts.push(
    `<circle cx="${cx + 14}" cy="${y + 17}" r="14" fill="${g.hasPair ? PAIR_BLUE : "none"}" stroke="${g.hasPair ? PAIR_BLUE : GREY}" stroke-width="2.5"/>`,
    g.hasPair
      ? `<text x="${cx + 14}" y="${y + 23}" font-family="${FONT}" font-size="17" font-weight="700" text-anchor="middle" fill="${PANEL}">✓</text>`
      : "",
    `<text x="${cx + 40}" y="${y + 24}" font-family="${FONT}" font-size="16" fill="${MUTED}">4 sets + 1 pair</text>`,
  );
  return parts.join("");
};

/** Lays groups out in a row and returns the SVG and the height it used. */
const groupRow = (
  groups: HandGroup[],
  y: number,
  opts: {
    drawn?: Tile | null;
    suggest?: Tile | null;
    maxTile?: number;
    drawnLabel?: string;
  },
): { svg: string; height: number } => {
  // Mark the copy of the suggested tile that's least useful: a loose one
  // before one in a half-set, before one in a pair or set.
  const preference = ["loose", "partial", "pair", "set"];
  let suggestGroup = -1;
  for (const type of preference) {
    suggestGroup = groups.findIndex(
      (g) => g.type === type && groupTiles(g).includes(opts.suggest ?? ""),
    );
    if (suggestGroup >= 0) break;
  }
  const gap = 3;
  const groupGap = 20;
  const count = groups.reduce((n, g) => n + groupTiles(g).length, 0);
  const avail = W - 48 - (groups.length - 1) * groupGap - count * gap;
  const tw = Math.min(
    opts.maxTile ?? 54,
    Math.floor(avail / Math.max(count, 1)),
  );
  const th = Math.round(tw * 1.36);
  const parts: string[] = [];
  let x = 24;
  let drawnMarked = false;
  let suggestMarked = false;
  const tagY = y;
  const tileY = y + 26;
  groups.forEach((g, gi) => {
    const { colour, label } = groupStyle(g);
    const tiles = groupTiles(g);
    const start = x;
    tiles.forEach((t, i) => {
      const concealedKan =
        g.type === "called" &&
        g.meld.type === "kan" &&
        !g.meld.open &&
        (i === 0 || i === 3);
      const isDrawn = !drawnMarked && opts.drawn === t && g.type !== "called";
      const isSuggest =
        !suggestMarked && gi === suggestGroup && opts.suggest === t;
      if (isDrawn) drawnMarked = true;
      if (isSuggest) suggestMarked = true;
      parts.push(
        tileSvg(t, x, tileY, tw, th, { back: concealedKan, glow: isDrawn }),
      );
      if (isSuggest) {
        parts.push(
          `<rect x="${x - 3}" y="${tileY - 3}" width="${tw + 6}" height="${th + 6}" rx="8" fill="none" stroke="${RED}" stroke-width="3.5"/>`,
          `<text x="${x + tw / 2}" y="${tagY + 18}" font-family="${FONT}" font-size="15" font-weight="700" text-anchor="middle" fill="${RED}">discard?</text>`,
        );
      } else if (isDrawn) {
        parts.push(
          `<text x="${x + tw / 2}" y="${tagY + 18}" font-family="${FONT}" font-size="15" font-weight="700" text-anchor="middle" fill="${GOLD}">${esc(opts.drawnLabel ?? "new")}</text>`,
        );
      }
      x += tw + gap;
    });
    const end = x - gap;
    const barY = tileY + th + 10;
    parts.push(
      `<rect x="${start}" y="${barY}" width="${end - start}" height="5" rx="2.5" fill="${colour}"/>`,
      `<text x="${(start + end) / 2}" y="${barY + 24}" font-family="${FONT}" font-size="${tw < 44 ? 13 : 15}" font-weight="600" text-anchor="middle" fill="${colour}">${esc(label)}</text>`,
    );
    x += groupGap;
  });
  return { svg: parts.join(""), height: 26 + th + 44 };
};

export const handStripSvg = (o: StripOptions): string => {
  const parts: string[] = [];
  let y = 18;
  if (o.title) {
    parts.push(
      `<text x="24" y="${y + 24}" font-family="${FONT}" font-size="22" font-weight="700" fill="${TEXT}">${esc(o.title)}</text>`,
    );
  } else {
    parts.push(trackerSvg(o.grouping, 24, y));
  }
  parts.push(
    `<text x="${W - 24}" y="${y + 25}" font-family="${FONT}" font-size="22" font-weight="700" text-anchor="end" fill="${o.headlineColour ?? TEXT}">${esc(o.headline)}</text>`,
  );
  y += 50;
  const row = groupRow(o.grouping.groups, y, {
    drawn: o.drawn,
    suggest: o.suggest,
    drawnLabel: o.drawnLabel,
  });
  parts.push(row.svg);
  y += row.height;

  if (o.waits?.length) {
    y += 6;
    parts.push(
      `<line x1="24" y1="${y}" x2="${W - 24}" y2="${y}" stroke="${PANEL_EDGE}" stroke-width="2"/>`,
      `<text x="24" y="${y + 40}" font-family="${FONT}" font-size="16" font-weight="700" fill="${SET_GREEN}" letter-spacing="1">WINS ON</text>`,
    );
    let x = 120;
    for (const w of o.waits.slice(0, 13)) {
      parts.push(
        tileSvg(w.tile, x, y + 12, 34, 46),
        `<text x="${x + 17}" y="${y + 74}" font-family="${FONT}" font-size="13" text-anchor="middle" fill="${w.left ? MUTED : RED}">${w.left ? `${w.left} left` : "none left"}</text>`,
      );
      x += 44;
    }
    y += 84;
  }
  const height = y + 10;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${height}" viewBox="0 0 ${W} ${height}"><rect width="${W}" height="${height}" rx="0" fill="${PANEL}"/>${parts.join("")}</svg>`;
};

export const renderSvg = async (svg: string): Promise<Buffer> =>
  sharp(Buffer.from(svg)).png({ compressionLevel: 7 }).toBuffer();

// ---------------------------------------------------------------------------
// Pictures for How to play

const page = (height: number, body: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${height}" viewBox="0 0 ${W} ${height}"><rect width="${W}" height="${height}" fill="${PANEL}"/>${body}</svg>`;

const label = (
  x: number,
  y: number,
  text: string,
  colour = TEXT,
  size = 18,
  anchor = "start",
  weight = 600,
) =>
  `<text x="${x}" y="${y}" font-family="${FONT}" font-size="${size}" font-weight="${weight}" text-anchor="${anchor}" fill="${colour}">${esc(text)}</text>`;

/** A finished hand, labelled run / triplet / pair. */
export const goalPictureSvg = (): string => {
  const groups: HandGroup[] = [
    { type: "set", shape: "run", tiles: parseTiles("234m") },
    { type: "set", shape: "run", tiles: parseTiles("678p") },
    { type: "set", shape: "triplet", tiles: parseTiles("555s") },
    { type: "set", shape: "triplet", tiles: parseTiles("777z") },
    { type: "pair", tiles: parseTiles("99p") },
  ];
  const row = groupRow(groups, 64, { maxTile: 54 });
  return page(
    64 + row.height + 20,
    label(
      24,
      42,
      "A winning hand: 4 sets + 1 pair (14 tiles)",
      TEXT,
      22,
      "start",
      700,
    ) + row.svg,
  );
};

/** Every tile, by suit. */
export const tileChartSvg = (bonus: boolean): string => {
  const rowsDef: [string, Tile[], string][] = [
    ["Characters", parseTiles("123456789m"), "numbers 1–9 (萬 = ten thousand)"],
    ["Circles", parseTiles("123456789p"), "numbers 1–9, count the circles"],
    ["Bamboo", parseTiles("123456789s"), "numbers 1–9, count the sticks"],
    ["Winds", parseTiles("1234z"), "East · South · West · North"],
    ["Dragons", parseTiles("567z"), "White · Green · Red"],
  ];
  if (bonus)
    rowsDef.push([
      "Flowers",
      parseTiles("12345678f"),
      "bonus tiles: set aside when drawn",
    ]);
  const tw = 46;
  const th = 62;
  let y = 24;
  const parts: string[] = [];
  for (const [name, tiles, note] of rowsDef) {
    parts.push(
      label(24, y + 26, name, TEXT, 19, "start", 700),
      label(24, y + 50, note, MUTED, 13, "start", 400),
    );
    tiles.forEach((t, i) =>
      parts.push(tileSvg(t, 270 + i * (tw + 4), y, tw, th)),
    );
    y += th + 18;
  }
  parts.push(
    label(
      24,
      y + 14,
      "Each tile has 4 copies. Runs use one suit; winds and dragons (honors) only make triplets.",
      MUTED,
      15,
      "start",
      400,
    ),
  );
  return page(y + 34, parts.join(""));
};

/** Pon, chi and kan, each with the taken tile shown sideways. */
export const callsPictureSvg = (): string => {
  const parts: string[] = [];
  const examples: [string, Tile[], number, string, string][] = [
    ["Pon", parseTiles("555p"), 2, "two in hand + one discard", "from anyone"],
    [
      "Chi",
      parseTiles("456p"),
      0,
      "a run, finished by a discard",
      "only from the player on your left",
    ],
    [
      "Kan",
      parseTiles("7777z"),
      3,
      "four of a kind",
      "draw a bonus replacement tile",
    ],
  ];
  let x = 24;
  for (const [name, tiles, called, what, from] of examples) {
    parts.push(label(x, 40, name, GOLD, 24, "start", 700));
    let tx = x;
    tiles.forEach((t, i) => {
      if (i === called) {
        parts.push(tileSvg(t, tx, 70 + (60 - 44), 44, 60, { sideways: true }));
        tx += 62;
      } else {
        parts.push(tileSvg(t, tx, 70, 44, 60));
        tx += 47;
      }
    });
    parts.push(
      label(x, 160, what, TEXT, 15, "start", 500),
      label(x, 182, from, MUTED, 14, "start", 400),
    );
    x += 300;
  }
  parts.push(
    label(
      24,
      222,
      'The sideways tile is the one you took. Called sets sit face up — your hand is now "open".',
      MUTED,
      15,
      "start",
      400,
    ),
  );
  return page(244, parts.join(""));
};

/** A turn: draw one, discard one. */
export const turnPictureSvg = (): string => {
  const groups: HandGroup[] = [
    { type: "set", shape: "run", tiles: parseTiles("234m") },
    { type: "pair", tiles: parseTiles("55p") },
    {
      type: "partial",
      tiles: parseTiles("67s"),
      needs: [kindOf("5s"), kindOf("8s")],
    },
    { type: "set", shape: "triplet", tiles: parseTiles("222z") },
    { type: "partial", tiles: parseTiles("24p"), needs: [kindOf("3p")] },
    { type: "loose", tiles: parseTiles("9m1z") },
  ];
  const row = groupRow(groups, 60, { drawn: "1z", suggest: "1z", maxTile: 50 });
  return page(
    60 + row.height + 16,
    label(
      24,
      40,
      "Draw a tile, then discard one you don't need — usually a loose one.",
      TEXT,
      20,
      "start",
      700,
    ) + row.svg,
  );
};
