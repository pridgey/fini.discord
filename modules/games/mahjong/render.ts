import sharp from "sharp";
import { roundLabel, seatWind, type GameState } from "./game";
import { kindOf, numberOf, isBonus, windName, type Tile } from "./tiles";
import type { Meld } from "./hand";

/**
 * The table as an image, drawn as SVG and rasterised with sharp.
 *
 * Seats sit around the table the way they would at a real one: the viewer
 * (or seat 1 on the public message) at the bottom, and play passing
 * counter-clockwise - bottom, right, top, left. Each seat's discards form a
 * river in front of it, six to a row; a riichi tile lies sideways, and a
 * tile someone called is dimmed.
 *
 * Tile faces are drawn, not loaded: numerals and honors in Noto CJK,
 * circles and bamboo as shapes.
 */

export const FONT =
  "Noto Sans CJK TC, Noto Sans CJK JP, DejaVu Sans, sans-serif";
export const FELT = "#1f5a43";
export const FELT_EDGE = "#174634";
export const FACE = "#f7f3e8";
const FACE_EDGE = "#c9c1ad";
const BACK = "#d48a2c";
export const INK = "#1b2236";
export const RED = "#c8322b";
export const GREEN = "#1d7a45";
export const BLUE = "#2456a6";
export const TEXT = "#f0efe6";
export const MUTED = "#a9c3b6";
export const GOLD = "#f2c14e";

const NUMERALS = ["一", "二", "三", "四", "五", "六", "七", "八", "九"];
const HONORS = ["東", "南", "西", "北", "", "發", "中"];
const FLOWERS = ["梅", "蘭", "菊", "竹", "春", "夏", "秋", "冬"];

export const esc = (t: string) =>
  t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Mark positions on a unit square for circles and bamboo. */
const LAYOUT: number[][][] = [
  [],
  [[0.5, 0.5]],
  [
    [0.5, 0.27],
    [0.5, 0.73],
  ],
  [
    [0.25, 0.2],
    [0.5, 0.5],
    [0.75, 0.8],
  ],
  [
    [0.3, 0.27],
    [0.7, 0.27],
    [0.3, 0.73],
    [0.7, 0.73],
  ],
  [
    [0.27, 0.22],
    [0.73, 0.22],
    [0.5, 0.5],
    [0.27, 0.78],
    [0.73, 0.78],
  ],
  [
    [0.3, 0.2],
    [0.7, 0.2],
    [0.3, 0.52],
    [0.7, 0.52],
    [0.3, 0.84],
    [0.7, 0.84],
  ],
  [
    [0.22, 0.14],
    [0.5, 0.26],
    [0.78, 0.38],
    [0.3, 0.62],
    [0.7, 0.62],
    [0.3, 0.86],
    [0.7, 0.86],
  ],
  [
    [0.3, 0.13],
    [0.7, 0.13],
    [0.3, 0.38],
    [0.7, 0.38],
    [0.3, 0.63],
    [0.7, 0.63],
    [0.3, 0.88],
    [0.7, 0.88],
  ],
  [
    [0.2, 0.18],
    [0.5, 0.18],
    [0.8, 0.18],
    [0.2, 0.5],
    [0.5, 0.5],
    [0.8, 0.5],
    [0.2, 0.82],
    [0.5, 0.82],
    [0.8, 0.82],
  ],
];

type TileOpts = {
  sideways?: boolean;
  dim?: boolean;
  back?: boolean;
  glow?: boolean;
};

/** One tile with its top-left at (x, y), `w` wide and `h` tall (before turning sideways). */
export const tileSvg = (
  tile: Tile,
  x: number,
  y: number,
  w: number,
  h: number,
  o: TileOpts = {},
): string => {
  const [tw, th] = o.sideways ? [h, w] : [w, h];
  const r = Math.max(2, w * 0.12);
  const parts: string[] = [];
  parts.push(
    `<rect x="${x}" y="${y + th * 0.06}" width="${tw}" height="${th}" rx="${r}" fill="${o.back ? "#9c5f17" : FACE_EDGE}"/>`,
    `<rect x="${x}" y="${y}" width="${tw}" height="${th * 0.96}" rx="${r}" fill="${o.back ? BACK : FACE}" stroke="${o.glow ? GOLD : "#00000033"}" stroke-width="${o.glow ? 3 : 1}"/>`,
  );
  if (!o.back) {
    // Draw the face upright in a w×h box, rotated into place if sideways.
    const face = faceSvg(tile, w, h * 0.96);
    const transform = o.sideways
      ? `translate(${x + tw} ${y}) rotate(90)`
      : `translate(${x} ${y})`;
    parts.push(`<g transform="${transform}">${face}</g>`);
  }
  if (o.dim)
    parts.push(
      `<rect x="${x}" y="${y}" width="${tw}" height="${th}" rx="${r}" fill="#00000055"/>`,
    );
  return parts.join("");
};

const faceSvg = (tile: Tile, w: number, h: number): string => {
  const pad = w * 0.12;
  const iw = w - pad * 2;
  const ih = h - pad * 2;
  if (isBonus(tile)) {
    const n = Number(tile[0]);
    const colour = n <= 4 ? RED : BLUE;
    return (
      `<text x="${w / 2}" y="${h * 0.62}" font-family="${FONT}" font-size="${w * 0.62}" font-weight="700" text-anchor="middle" fill="${colour}">${FLOWERS[n - 1]}</text>` +
      `<text x="${w * 0.82}" y="${h * 0.22}" font-family="${FONT}" font-size="${w * 0.26}" text-anchor="middle" fill="${INK}">${((n - 1) % 4) + 1}</text>`
    );
  }
  const k = kindOf(tile);
  const suit = tile[1];
  const red = tile[0] === "0";
  if (suit === "z") {
    const n = k - 27;
    if (n === 4)
      return `<rect x="${pad * 1.4}" y="${pad * 1.4}" width="${w - pad * 2.8}" height="${h - pad * 2.8}" rx="${w * 0.06}" fill="none" stroke="${BLUE}" stroke-width="${w * 0.07}"/>`;
    const colour = n === 5 ? GREEN : n === 6 ? RED : INK;
    return `<text x="${w / 2}" y="${h * 0.66}" font-family="${FONT}" font-size="${w * 0.7}" font-weight="700" text-anchor="middle" fill="${colour}">${HONORS[n]}</text>`;
  }
  const n = numberOf(k);
  if (suit === "m") {
    return (
      `<text x="${w / 2}" y="${h * 0.44}" font-family="${FONT}" font-size="${w * 0.5}" font-weight="700" text-anchor="middle" fill="${red ? RED : INK}">${NUMERALS[n - 1]}</text>` +
      `<text x="${w / 2}" y="${h * 0.88}" font-family="${FONT}" font-size="${w * 0.48}" font-weight="700" text-anchor="middle" fill="${RED}">萬</text>`
    );
  }
  const marks = LAYOUT[n];
  if (suit === "p") {
    const rad =
      n === 1 ? iw * 0.42 : n <= 4 ? iw * 0.2 : n <= 6 ? iw * 0.17 : iw * 0.14;
    return marks
      .map(([mx, my], i) => {
        const cx = pad + mx * iw;
        const cy = pad + my * ih;
        const colour = red
          ? RED
          : n === 1
            ? RED
            : (n === 5 || n === 9) && i === Math.floor(marks.length / 2)
              ? RED
              : i % 2
                ? GREEN
                : BLUE;
        return `<circle cx="${cx}" cy="${cy}" r="${rad}" fill="none" stroke="${colour}" stroke-width="${rad * 0.38}"/><circle cx="${cx}" cy="${cy}" r="${rad * 0.32}" fill="${colour}"/>`;
      })
      .join("");
  }
  // Bamboo.
  const sw = n === 1 ? iw * 0.3 : iw * 0.15;
  const sh = n === 1 ? ih * 0.8 : n <= 6 ? ih * 0.28 : ih * 0.22;
  return marks
    .map(([mx, my], i) => {
      const cx = pad + mx * iw;
      const cy = pad + my * ih;
      const colour =
        red ||
        n === 1 ||
        ((n === 5 || n === 7 || n === 9) &&
          i === (n === 7 ? 0 : Math.floor(marks.length / 2)))
          ? RED
          : GREEN;
      return (
        `<rect x="${cx - sw / 2}" y="${cy - sh / 2}" width="${sw}" height="${sh}" rx="${sw / 2}" fill="${colour}"/>` +
        `<rect x="${cx - sw / 2}" y="${cy - sw * 0.15}" width="${sw}" height="${sw * 0.3}" fill="${FACE}"/>`
      );
    })
    .join("");
};

// ---------------------------------------------------------------------------
// The table

const SIZE = 920;
const C = SIZE / 2;
const DT = { w: 30, h: 40 }; // discard tile
const MT = { w: 30, h: 40 }; // meld tile

const meldSvg = (
  meld: Meld,
  owner: number,
  x: number,
  y: number,
  w: number,
  h: number,
): { svg: string; width: number } => {
  let out = "";
  let cx = x;
  // The called tile lies sideways, on the side of the seat it came from.
  const rel = meld.from === undefined ? -1 : (meld.from - owner + 4) % 4; // 1 right, 2 across, 3 left
  const tiles = [...meld.tiles];
  let calledAt = -1;
  if (meld.called && meld.open) {
    const i = tiles.indexOf(meld.called);
    if (i >= 0) {
      tiles.splice(i, 1);
      calledAt = rel === 3 ? 0 : rel === 2 ? 1 : tiles.length;
      tiles.splice(calledAt, 0, meld.called);
    }
  }
  tiles.forEach((t, i) => {
    const concealedKanEnd =
      meld.type === "kan" && !meld.open && (i === 0 || i === 3);
    if (i === calledAt) {
      out += tileSvg(t, cx, y + (h - w), w, h, { sideways: true });
      cx += h + 2;
    } else {
      out += tileSvg(t, cx, y, w, h, { back: concealedKanEnd });
      cx += w + 2;
    }
  });
  return { svg: out, width: cx - x };
};

/** A seat's side of the table drawn as if it were the bottom; rotated into place by the caller. */
const seatSide = (
  s: GameState,
  seatIndex: number,
  opts: { showHand: boolean; active: boolean },
): string => {
  const seat = s.seats[seatIndex];
  const parts: string[] = [];
  // River: starts just below the centre box.
  const riverX = C - 3 * (DT.w + 2);
  let rx = riverX;
  let ry = C + 178;
  seat.discards.forEach((d, i) => {
    if (i > 0 && i % 6 === 0 && i < 18) {
      rx = riverX;
      ry += DT.h + 4;
    }
    if (d.riichi) {
      parts.push(
        tileSvg(d.tile, rx, ry + (DT.h - DT.w), DT.w, DT.h, {
          sideways: true,
          dim: d.calledBy !== undefined,
        }),
      );
      rx += DT.h + 2;
    } else {
      parts.push(
        tileSvg(d.tile, rx, ry, DT.w, DT.h, { dim: d.calledBy !== undefined }),
      );
      rx += DT.w + 2;
    }
  });

  // Edge: hand (backs) on the left, melds on the right, flowers above melds.
  const edgeY = SIZE - 70;
  if (!opts.showHand) {
    const backs = seat.hand.length;
    for (let i = 0; i < backs; i++)
      parts.push(
        tileSvg("1z", 150 + i * 22, edgeY + 8, 20, 28, { back: true }),
      );
  }
  let mx = SIZE - 40;
  for (const meld of [...seat.melds].reverse()) {
    const { svg, width } = meldSvg(meld, seatIndex, 0, 0, MT.w, MT.h);
    mx -= width + 8;
    parts.push(`<g transform="translate(${mx} ${edgeY})">${svg}</g>`);
  }
  seat.flowers.forEach((f, i) =>
    parts.push(tileSvg(f, SIZE - 40 - (i + 1) * 26, edgeY - 40, 24, 32)),
  );
  return parts.join("");
};

/** Name, wind and points in the centre box, along the seat's edge. */
const seatPlate = (
  s: GameState,
  seatIndex: number,
  active: boolean,
): string => {
  const seat = s.seats[seatIndex];
  const wind = windName(seatWind(s, seatIndex) - 27);
  const dealer = seatIndex === s.dealer;
  const y = C + 140;
  const stick = seat.riichi
    ? `<rect x="${C - 50}" y="${C + 92}" width="100" height="10" rx="5" fill="${FACE}"/><circle cx="${C}" cy="${C + 97}" r="3" fill="${RED}"/>`
    : "";
  const name = seat.name.length > 14 ? seat.name.slice(0, 13) + "…" : seat.name;
  return (
    stick +
    `<text x="${C}" y="${y - 18}" font-family="${FONT}" font-size="20" font-weight="700" text-anchor="middle" fill="${active ? GOLD : TEXT}">${dealer ? "● " : ""}${esc(wind)} · ${seat.points.toLocaleString()}</text>` +
    `<text x="${C}" y="${y + 6}" font-family="${FONT}" font-size="18" text-anchor="middle" fill="${active ? GOLD : MUTED}">${esc(name)}</text>`
  );
};

export type RenderOptions = {
  /** Seat drawn at the bottom; its hand is shown face up below the table. */
  viewer?: number;
  /** Tiles to outline in gold in the viewer's hand (e.g. the drawn tile). */
  highlight?: Tile | null;
  /** Show every hand face up (the end of a hand). */
  reveal?: boolean;
  /** Leave the viewer's big hand off (it's drawn separately, labelled). */
  noHand?: boolean;
};

export const tableSvg = (s: GameState, o: RenderOptions = {}): string => {
  const bottom = o.viewer ?? 0;
  const active =
    s.phase.kind === "turn"
      ? s.phase.seat
      : s.phase.kind === "claims"
        ? -1
        : -1;
  const handStrip = o.viewer !== undefined && !o.noHand ? 130 : 0;
  const height = SIZE + handStrip;
  const parts: string[] = [
    `<rect width="${SIZE}" height="${height}" fill="${FELT_EDGE}"/>`,
    `<rect x="10" y="10" width="${SIZE - 20}" height="${SIZE - 20}" rx="24" fill="${FELT}"/>`,
    `<rect x="${C - 168}" y="${C - 168}" width="336" height="336" rx="18" fill="#163d2e" stroke="#2b7558" stroke-width="2"/>`,
  ];

  for (let i = 0; i < 4; i++) {
    const seatIndex = (bottom + i) % 4;
    const angle = -90 * i; // counter-clockwise: bottom, right, top, left
    const side = seatSide(s, seatIndex, {
      showHand: seatIndex === o.viewer || !!o.reveal,
      active: seatIndex === active,
    });
    const plate = seatPlate(s, seatIndex, seatIndex === active);
    parts.push(`<g transform="rotate(${angle} ${C} ${C})">${side}${plate}</g>`);
  }

  // Centre: round, wall, sticks, dora.
  const wallLeft = s.wall.length;
  parts.push(
    `<text x="${C}" y="${C - 44}" font-family="${FONT}" font-size="26" font-weight="700" text-anchor="middle" fill="${TEXT}">${esc(roundLabel(s))}</text>`,
    `<text x="${C}" y="${C - 18}" font-family="${FONT}" font-size="17" text-anchor="middle" fill="${MUTED}">${wallLeft} tiles left${s.sticks ? ` · ${s.sticks} riichi stick${s.sticks > 1 ? "s" : ""}` : ""}</text>`,
  );
  if (s.rules === "riichi") {
    const dw = 28;
    const dh = 38;
    const startX = C - (5 * (dw + 3)) / 2;
    for (let i = 0; i < 5; i++) {
      const shown = i < s.doraShown;
      parts.push(
        tileSvg(
          s.doraIndicators[i] ?? "1z",
          startX + i * (dw + 3),
          C + 2,
          dw,
          dh,
          { back: !shown },
        ),
      );
    }
    parts.push(
      `<text x="${C}" y="${C + 60}" font-family="${FONT}" font-size="14" text-anchor="middle" fill="${MUTED}">bonus tiles (dora)</text>`,
    );
  } else {
    parts.push(
      `<text x="${C}" y="${C + 10}" font-family="${FONT}" font-size="18" text-anchor="middle" fill="${MUTED}">Hong Kong rules</text>`,
    );
  }

  // The viewer's hand, big, under the table.
  if (o.viewer !== undefined && !o.noHand) {
    const seat = s.seats[o.viewer];
    const w = 50;
    const h = 68;
    const y = SIZE + 30;
    const drawn =
      s.phase.kind === "turn" && s.phase.seat === o.viewer
        ? s.phase.drawn
        : null;
    const hand = [...seat.hand];
    if (drawn) hand.splice(hand.lastIndexOf(drawn), 1);
    let x = 24;
    hand.forEach((t) => {
      parts.push(tileSvg(t, x, y, w, h, { glow: o.highlight === t && !drawn }));
      x += w + 3;
    });
    if (drawn) {
      x += 16;
      parts.push(tileSvg(drawn, x, y, w, h, { glow: true }));
      parts.push(
        `<text x="${x + w / 2}" y="${y - 8}" font-family="${FONT}" font-size="15" text-anchor="middle" fill="${GOLD}">drawn</text>`,
      );
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${height}" viewBox="0 0 ${SIZE} ${height}">${parts.join("")}</svg>`;
};

export const renderTable = async (
  s: GameState,
  o: RenderOptions = {},
): Promise<Buffer> =>
  sharp(Buffer.from(tableSvg(s, o)))
    .png({ compressionLevel: 7 })
    .toBuffer();
