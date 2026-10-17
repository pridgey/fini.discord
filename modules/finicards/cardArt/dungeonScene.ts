import sharp from "sharp";
import type { CardType } from "../../../types/PocketbaseTablesV2";
import {
  describeEffect,
  doorHint,
  doorSight,
  type Buff,
  type Effect,
  type EventRoom,
  type FightRoom,
  type Room,
  type ShopRoom,
} from "../dungeon";
import { findKeyword } from "../keywords";
import { TYPE_PRIORITY } from "../rules";
import { resolveArtSource } from "./generateCardImage";
import { squareArt } from "./handStrip";
import { STAT_LABELS, TYPE_PALETTES } from "./palettes";
import { escapeXml, estimateWidth, wrapToWidth } from "./svgText";

/**
 * The dungeon scene: one picture of wherever the player is standing.
 *
 * A run only ever shows one room, so the room can be a place rather than a row
 * in a list - a torchlit archway with the enemy standing in it, a shop with its
 * shelf, an event's rune circle, or the doors out. The scene carries everything
 * the player has to read to decide (an enemy's three stats, a price, a target),
 * so the text under it only has to explain.
 */

const SCENE = { width: 380, height: 184 };

/** Rendered width in pixels, oversampled like the hand strip. */
export const DUNGEON_SCENE_WIDTH = 1140;
export const DUNGEON_SCENE_FILE = "dungeon-room.png";

export const GOLD = "#FFD166";
export const EVENT_PURPLE = "#B18CFF";
const MONO = "JetBrains Mono, monospace";

type Theme = { top: string; bottom: string; glow: string };

export const n = (value: number): string =>
  Number.isInteger(value) ? String(value) : value.toFixed(2);

export type TextOptions = {
  size: number;
  weight?: number;
  fill?: string;
  opacity?: number;
  anchor?: "start" | "middle" | "end";
  spacing?: number;
  mono?: boolean;
};

export const text = (
  x: number,
  y: number,
  value: string,
  options: TextOptions,
): string =>
  `<text x="${n(x)}" y="${n(y)}" font-size="${options.size}" font-weight="${options.weight ?? 400}" fill="${options.fill ?? "#ffffff"}" fill-opacity="${options.opacity ?? 1}" text-anchor="${options.anchor ?? "start"}"${options.spacing ? ` letter-spacing="${options.spacing}"` : ""}${options.mono ? ` font-family="${MONO}"` : ""}>${escapeXml(value)}</text>`;

/** A wall torch and the light it throws. */
const torch = (x: number, y: number): string =>
  [
    `<circle cx="${x}" cy="${y}" r="46" fill="url(#torchlight)"></circle>`,
    `<rect x="${x - 2}" y="${y + 6}" width="4" height="16" rx="1.5" fill="#3a2a1c"></rect>`,
    `<path d="M${x - 6} ${y + 7} h12 l-2 5 h-8 z" fill="#5a4630"></path>`,
    `<path d="M${x} ${y - 13} c7 8 7 14 0 20 c-7 -6 -7 -12 0 -20 z" fill="#ff9d3c"></path>`,
    `<path d="M${x} ${y - 5} c3.5 4 3.5 8 0 11 c-3.5 -3 -3.5 -7 0 -11 z" fill="#ffe7a3"></path>`,
  ].join("");

/** Stone wall, flagstone floor, two torches, and a pool of themed light. */
const backdrop = (theme: Theme, focusX: number): string =>
  [
    `<defs>`,
    `<linearGradient id="wall" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${theme.top}"></stop><stop offset="1" stop-color="${theme.bottom}"></stop></linearGradient>`,
    `<pattern id="bricks" width="44" height="26" patternUnits="userSpaceOnUse"><path d="M0 0.5 H44 M0 13.5 H44 M11 0 V13 M33 13 V26" stroke="#ffffff" stroke-opacity="0.055" stroke-width="1" fill="none"></path></pattern>`,
    `<radialGradient id="torchlight"><stop offset="0" stop-color="#ffb155" stop-opacity="0.38"></stop><stop offset="1" stop-color="#ffb155" stop-opacity="0"></stop></radialGradient>`,
    `<radialGradient id="focus"><stop offset="0" stop-color="${theme.glow}" stop-opacity="0.34"></stop><stop offset="1" stop-color="${theme.glow}" stop-opacity="0"></stop></radialGradient>`,
    `<radialGradient id="vignette" cx="0.5" cy="0.5" r="0.75"><stop offset="0.55" stop-color="#000000" stop-opacity="0"></stop><stop offset="1" stop-color="#000000" stop-opacity="0.6"></stop></radialGradient>`,
    `<clipPath id="frame"><rect width="${SCENE.width}" height="${SCENE.height}" rx="10"></rect></clipPath>`,
    `</defs>`,
    `<g clip-path="url(#frame)">`,
    `<rect width="${SCENE.width}" height="${SCENE.height}" fill="url(#wall)"></rect>`,
    `<rect width="${SCENE.width}" height="150" fill="url(#bricks)"></rect>`,
    `<ellipse cx="${focusX}" cy="92" rx="120" ry="100" fill="url(#focus)"></ellipse>`,
    // Floor, with flagstone joints drawn towards a vanishing point.
    `<rect y="150" width="${SCENE.width}" height="${SCENE.height - 150}" fill="#07080f" fill-opacity="0.72"></rect>`,
    `<path d="M0 150.5 H${SCENE.width}" stroke="#ffffff" stroke-opacity="0.14"></path>`,
    ...[-260, -150, -60, 60, 150, 260].map(
      (offset) =>
        `<path d="M${focusX + offset * 0.35} 150 L${focusX + offset * 1.5} ${SCENE.height}" stroke="#ffffff" stroke-opacity="0.06"></path>`,
    ),
    `<path d="M0 164.5 H${SCENE.width}" stroke="#ffffff" stroke-opacity="0.05"></path>`,
  ].join("");

/** Closes what `backdrop` opened, with the vignette over everything. */
const finish = (): string =>
  `<rect width="${SCENE.width}" height="${SCENE.height}" fill="url(#vignette)"></rect></g>`;

/** An arch-topped opening, as a path. */
const arch = (
  x: number,
  top: number,
  width: number,
  bottom: number,
): string => {
  const radius = width / 2;
  return `M${n(x)} ${n(bottom)} V${n(top + radius)} A${n(radius)} ${n(radius)} 0 0 1 ${n(x + width)} ${n(top + radius)} V${n(bottom)} Z`;
};

export const coin = (x: number, y: number, radius = 4): string =>
  `<circle cx="${n(x)}" cy="${n(y)}" r="${radius}" fill="${GOLD}"></circle><circle cx="${n(x)}" cy="${n(y)}" r="${n(radius * 0.55)}" fill="none" stroke="#8a6a1a" stroke-width="0.8"></circle>`;

export const crown = (x: number, y: number, width: number): string => {
  const half = width / 2;
  return `<path d="M${n(x - half)} ${n(y)} l${n(half * 0.1)} ${n(-half * 0.8)} l${n(half * 0.4)} ${n(half * 0.4)} l${n(half * 0.5)} ${n(-half * 0.7)} l${n(half * 0.5)} ${n(half * 0.7)} l${n(half * 0.4)} ${n(-half * 0.4)} l${n(half * 0.1)} ${n(half * 0.8)} z" fill="${GOLD}" stroke="#8a6a1a" stroke-width="0.8" stroke-linejoin="round"></path>`;
};

export const swords = (
  x: number,
  y: number,
  size: number,
  colour: string,
): string =>
  [
    [-1, 1],
    [1, -1],
  ]
    .map(
      ([from, to]) =>
        `<path d="M${n(x + from * size)} ${n(y + size)} L${n(x + to * size)} ${n(y - size)}" stroke="${colour}" stroke-width="2.4" stroke-linecap="round"></path><path d="M${n(x + from * size * 0.95 - 2.5)} ${n(y + size * 0.45)} l5 ${n(from * to * -5 * -1)}" stroke="${colour}" stroke-width="1.6" stroke-linecap="round"></path>`,
    )
    .join("");

/* ------------------------------------------------------------------ fight -- */

const TIER_LABEL: Record<FightRoom["tier"], string> = {
  normal: "FIGHT",
  elite: "ELITE FIGHT",
  boss: "BOSS",
};

const fightScene = (
  room: FightRoom,
  depth: number,
  art: string | null,
): string => {
  const { enemy } = room;
  const palette = TYPE_PALETTES[enemy.type];
  const keyword = findKeyword(enemy.keyword);
  const rim = room.tier === "boss" ? GOLD : palette.bright;

  const ARCH = { x: 34, top: 20, width: 112, bottom: 150 };
  const COLUMN = { x: 166, width: 200 };

  const name = wrapToWidth(enemy.name, COLUMN.width, 2, {
    fontSize: 16,
    bold: true,
  });
  const nameBottom = 52 + (name.length - 1) * 18;

  const statBoxes = () => {
    const gap = 4;
    const narrow = (COLUMN.width - gap * 2) / 3.7;
    const wide = narrow * 1.7;
    let cursor = COLUMN.x;
    const y = 106;

    return TYPE_PRIORITY.map((type) => {
      const lead = type === enemy.type;
      const width = lead ? wide : narrow;
      const box = [
        lead
          ? `<rect x="${n(cursor)}" y="${y}" width="${n(width)}" height="34" rx="4" fill="url(#lead)"></rect>`
          : `<rect x="${n(cursor)}" y="${y}" width="${n(width)}" height="34" rx="4" fill="#0b0c16" fill-opacity="0.55" stroke="#ffffff" stroke-opacity="0.14"></rect>`,
        text(
          cursor + 7,
          y + 13,
          lead ? STAT_LABELS[type].full : STAT_LABELS[type].short,
          {
            size: lead ? 7.5 : 7,
            spacing: 0.9,
            mono: true,
            opacity: lead ? 0.92 : 0.5,
          },
        ),
        text(cursor + width - 7, y + 28, String(enemy.stats[type]), {
          size: lead ? 20 : 15,
          weight: 800,
          anchor: "end",
          opacity: lead ? 1 : 0.78,
        }),
      ].join("");
      cursor += width + gap;
      return box;
    }).join("");
  };

  const keywordLabel = keyword?.name.toUpperCase() ?? "";
  const chipWidth = estimateWidth(keywordLabel, 7.5, 0.8, true) + 12;

  return [
    backdrop(
      { top: "#1a1d33", bottom: "#0d0f1c", glow: palette.main },
      ARCH.x + ARCH.width / 2,
    ),
    `<defs><linearGradient id="lead" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${palette.bright}"></stop><stop offset="1" stop-color="${palette.deep}"></stop></linearGradient><clipPath id="doorway"><path d="${arch(ARCH.x, ARCH.top, ARCH.width, ARCH.bottom)}"></path></clipPath></defs>`,
    torch(16, 62),
    torch(SCENE.width - 12, 40),
    // The stone surround, then the opening with the enemy standing in it.
    `<path d="${arch(ARCH.x - 7, ARCH.top - 7, ARCH.width + 14, ARCH.bottom)}" fill="#2b3050"></path>`,
    `<path d="${arch(ARCH.x, ARCH.top, ARCH.width, ARCH.bottom)}" fill="#07080f"></path>`,
    art
      ? `<image x="${ARCH.x}" y="${ARCH.top}" width="${ARCH.width}" height="${ARCH.bottom - ARCH.top}" clip-path="url(#doorway)" preserveAspectRatio="xMidYMid slice" xlink:href="${art}"></image>`
      : `<g clip-path="url(#doorway)"><ellipse cx="${ARCH.x + ARCH.width / 2}" cy="${ARCH.bottom}" rx="46" ry="74" fill="${palette.deep}" fill-opacity="0.55"></ellipse><circle cx="${ARCH.x + ARCH.width / 2}" cy="74" r="22" fill="${palette.deep}" fill-opacity="0.75"></circle></g>`,
    `<path d="${arch(ARCH.x, ARCH.top, ARCH.width, ARCH.bottom)}" fill="none" stroke="${rim}" stroke-width="2.4"></path>`,
    room.tier === "boss"
      ? crown(ARCH.x + ARCH.width / 2, ARCH.top + 3, 34)
      : "",
    text(COLUMN.x, 32, `ROOM ${depth} · ${TIER_LABEL[room.tier]}`, {
      size: 8,
      weight: 700,
      spacing: 1.4,
      mono: true,
      fill: rim,
    }),
    ...name.map((line, index) =>
      text(COLUMN.x, 52 + index * 18, line, { size: 16, weight: 800 }),
    ),
    keyword
      ? [
          `<rect x="${COLUMN.x}" y="${nameBottom + 8}" width="${n(chipWidth)}" height="14" rx="7" fill="${GOLD}" fill-opacity="0.16" stroke="${GOLD}" stroke-opacity="0.5" stroke-width="0.6"></rect>`,
          text(COLUMN.x + 6, nameBottom + 17.6, keywordLabel, {
            size: 7.5,
            weight: 800,
            spacing: 0.8,
            mono: true,
            fill: GOLD,
          }),
        ].join("")
      : "",
    statBoxes(),
    coin(COLUMN.x + 5, 163),
    text(COLUMN.x + 14, 166, `${room.geld} GELD FOR THE WIN`, {
      size: 8,
      weight: 700,
      spacing: 1,
      mono: true,
      fill: GOLD,
    }),
    finish(),
  ].join("");
};

/* ------------------------------------------------------------------- shop -- */

const effectColour = (effect: Effect): string => {
  if (effect.kind !== "buff") return GOLD;
  const stat = TYPE_PRIORITY.find((type) => (effect.buff.mods[type] ?? 0) > 0);
  const single =
    TYPE_PRIORITY.filter((type) => (effect.buff.mods[type] ?? 0) > 0).length ===
    1;
  return stat && single ? TYPE_PALETTES[stat].bright : GOLD;
};

/** A small picture of what an effect is: a potion, a charm, a purse. */
const effectIcon = (effect: Effect, x: number, y: number): string => {
  const colour = effectColour(effect);

  switch (effect.kind) {
    case "ward":
      return `<path d="M${x} ${y - 11} l10 4 v7 c0 6 -4 10 -10 12 c-6 -2 -10 -6 -10 -12 v-7 z" fill="${colour}" fill-opacity="0.9"></path><path d="M${x} ${y - 6} v13 M${x - 5} ${y} h10" stroke="#3a2a05" stroke-width="1.6"></path>`;
    case "geld":
      return `${coin(x - 4, y + 3, 6)}${coin(x + 5, y - 2, 6)}`;
    case "recover":
      return `<path d="M${x + 9} ${y} a9 9 0 1 1 -3.5 -7.1" fill="none" stroke="${colour}" stroke-width="2.4" stroke-linecap="round"></path><path d="M${x + 7.5} ${y - 12} v6.5 h-6.5 z" fill="${colour}"></path>`;
    case "buff":
      // A stoppered bottle, filled with the buff's colour.
      return `<path d="M${x - 3} ${y - 12} h6 v6 l6 9 a5 5 0 0 1 -4 8 h-10 a5 5 0 0 1 -4 -8 l6 -9 z" fill="#ffffff" fill-opacity="0.14" stroke="#ffffff" stroke-opacity="0.5" stroke-width="0.8"></path><path d="M${x - 6.5} ${y + 1} h13 l2.2 3.4 a4 4 0 0 1 -3.4 6 h-10.6 a4 4 0 0 1 -3.4 -6 z" fill="${colour}"></path><rect x="${x - 4}" y="${y - 14}" width="8" height="3" rx="1" fill="#8a6a45"></rect>`;
    case "redraw":
      // Two cards, fanned, mid-shuffle.
      return `<rect x="${x - 11}" y="${y - 12}" width="13" height="18" rx="2" fill="#ffffff" fill-opacity="0.18" stroke="#ffffff" stroke-opacity="0.55" stroke-width="0.8" transform="rotate(-14 ${x - 4} ${y - 3})"></rect><rect x="${x - 2}" y="${y - 9}" width="13" height="18" rx="2" fill="${colour}" transform="rotate(12 ${x + 4} ${y})"></rect>`;
    case "sleep":
      // A crescent moon.
      return `<path d="M${x + 4} ${y - 11} a11 11 0 1 0 6 18 a9 9 0 1 1 -6 -18 z" fill="${colour}"></path>`;
    case "reroll":
      // A die showing five.
      return `<rect x="${x - 10}" y="${y - 10}" width="20" height="20" rx="4" fill="${colour}" transform="rotate(-10 ${x} ${y})"></rect>${[
        [-5, -5],
        [5, -5],
        [0, 0],
        [-5, 5],
        [5, 5],
      ]
        .map(
          ([dx, dy]) =>
            `<circle cx="${x + dx}" cy="${y + dy}" r="1.9" fill="#3a2a05" transform="rotate(-10 ${x} ${y})"></circle>`,
        )
        .join("")}`;
    case "coffee":
      // A steaming cup.
      return `<path d="M${x - 9} ${y - 3} h15 v7 a7 7 0 0 1 -7 7 h-1 a7 7 0 0 1 -7 -7 z" fill="${colour}"></path><path d="M${x + 6} ${y - 1} a4 4 0 0 1 0 8" fill="none" stroke="${colour}" stroke-width="2"></path><path d="M${x - 4} ${y - 7} q-2 -3 0 -6 M${x + 1} ${y - 7} q-2 -3 0 -6" fill="none" stroke="#ffffff" stroke-opacity="0.6" stroke-width="1.4" stroke-linecap="round"></path>`;
    case "resetLeg":
      return effectIcon({ kind: "recover" }, x, y);
    case "many":
      return effect.effects[0] ? effectIcon(effect.effects[0], x, y) : "";
  }
};

const shopScene = (room: ShopRoom, depth: number): string => {
  /* A fourth ware - a shop's occasional hand-redraw - narrows every tile, and
     the name moves under the icon to keep its width. */
  const compact = room.offers.length > 3;
  const TILE = compact
    ? { width: 86, height: 98, y: 56, gap: 6 }
    : { width: 112, height: 98, y: 56, gap: 8 };
  const total =
    room.offers.length * TILE.width + (room.offers.length - 1) * TILE.gap;
  const left = (SCENE.width - total) / 2;
  const stripe = 20;

  return [
    backdrop(
      { top: "#2a2018", bottom: "#120e0b", glow: "#ffb155" },
      SCENE.width / 2,
    ),
    torch(14, 96),
    torch(SCENE.width - 14, 96),
    // Awning: stripes, then a scalloped hem.
    ...Array.from({ length: Math.ceil(SCENE.width / stripe) }, (_, index) => {
      const fill = index % 2 === 0 ? "#b5423a" : "#f1e2c4";
      return `<rect x="${index * stripe}" y="0" width="${stripe}" height="22" fill="${fill}"></rect><circle cx="${index * stripe + stripe / 2}" cy="22" r="${stripe / 2}" fill="${fill}"></circle>`;
    }),
    `<rect width="${SCENE.width}" height="34" fill="#000000" fill-opacity="0.18"></rect>`,
    text(SCENE.width / 2, 48, `ROOM ${depth} · THE SHOP`, {
      size: 8,
      weight: 700,
      spacing: 1.6,
      mono: true,
      fill: GOLD,
      anchor: "middle",
    }),
    ...room.offers.map((offer, index) => {
      const x = left + index * (TILE.width + TILE.gap);
      const centre = x + TILE.width / 2;
      const name = compact
        ? wrapToWidth(offer.name, TILE.width - 14, 2, {
            fontSize: 9,
            bold: true,
          })
        : wrapToWidth(offer.name, TILE.width - 56, 2, {
            fontSize: 10,
            bold: true,
          });
      const blurb = wrapToWidth(offer.blurb, TILE.width - 14, 3, {
        fontSize: compact ? 6 : 6.6,
      });
      const blurbTop = compact ? 36 + name.length * 10 + 2 : 56;

      return [
        `<g opacity="${offer.sold ? 0.32 : 1}">`,
        `<rect x="${n(x)}" y="${TILE.y}" width="${TILE.width}" height="${TILE.height}" rx="7" fill="#0b0c16" fill-opacity="0.78" stroke="${GOLD}" stroke-opacity="0.35"></rect>`,
        text(x + 8, TILE.y + 13, String(index + 1), {
          size: 8,
          weight: 700,
          mono: true,
          opacity: 0.55,
        }),
        compact
          ? `<g transform="translate(${n(x + TILE.width - 20)} ${TILE.y + 18}) scale(0.7)">${effectIcon(offer.effect, 0, 0)}</g>`
          : effectIcon(offer.effect, x + 24, TILE.y + 30),
        ...name.map((line, row) =>
          compact
            ? text(x + 8, TILE.y + 36 + row * 10, line, {
                size: 9,
                weight: 800,
              })
            : text(
                x + 42,
                TILE.y + (name.length > 1 ? 26 : 32) + row * 11,
                line,
                { size: 10, weight: 800 },
              ),
        ),
        ...blurb.map((line, row) =>
          text(x + 8, TILE.y + blurbTop + row * (compact ? 7.6 : 8.4), line, {
            size: compact ? 6 : 6.6,
            opacity: 0.72,
          }),
        ),
        `<rect x="${n(centre - 30)}" y="${TILE.y + TILE.height - 17}" width="60" height="13" rx="6.5" fill="${GOLD}" fill-opacity="0.18"></rect>`,
        coin(centre - 21, TILE.y + TILE.height - 10.5, 3.6),
        text(centre + 4, TILE.y + TILE.height - 7.6, `${offer.price} GELD`, {
          size: 7.5,
          weight: 800,
          spacing: 0.8,
          mono: true,
          fill: GOLD,
          anchor: "middle",
        }),
        `</g>`,
        offer.sold
          ? `<g transform="rotate(-12 ${n(centre)} ${TILE.y + TILE.height / 2})">${text(centre, TILE.y + TILE.height / 2 + 6, "SOLD", { size: 20, weight: 800, spacing: 3, fill: "#ff7b6b", anchor: "middle", opacity: 0.9 })}</g>`
          : "",
      ].join("");
    }),
    finish(),
  ].join("");
};

/* ------------------------------------------------------------------ event -- */

const eventScene = (room: EventRoom, depth: number): string => {
  const palette = TYPE_PALETTES[room.stat];
  const CIRCLE = { x: 86, y: 88 };
  const COLUMN = { x: 166, width: 200 };

  const title = wrapToWidth(room.title, COLUMN.width, 2, {
    fontSize: 16,
    bold: true,
  });
  const titleBottom = 52 + (title.length - 1) * 18;
  const story = wrapToWidth(room.text, COLUMN.width, 3, { fontSize: 8.2 });
  const reward = wrapToWidth(
    `PASS: ${describeEffect(room.reward).toUpperCase()}`,
    COLUMN.width,
    2,
    { fontSize: 7, letterSpacing: 0.8, bold: true },
  );

  return [
    backdrop(
      { top: "#211a3a", bottom: "#0e0b1c", glow: EVENT_PURPLE },
      CIRCLE.x,
    ),
    torch(14, 44),
    torch(SCENE.width - 12, 40),
    // A rune circle: rings, tick marks, and the question at its centre.
    `<circle cx="${CIRCLE.x}" cy="${CIRCLE.y}" r="56" fill="#0b0c16" fill-opacity="0.55"></circle>`,
    `<circle cx="${CIRCLE.x}" cy="${CIRCLE.y}" r="56" fill="none" stroke="${EVENT_PURPLE}" stroke-width="1.6"></circle>`,
    `<circle cx="${CIRCLE.x}" cy="${CIRCLE.y}" r="49" fill="none" stroke="${EVENT_PURPLE}" stroke-opacity="0.7" stroke-width="5" stroke-dasharray="2 9.4"></circle>`,
    `<circle cx="${CIRCLE.x}" cy="${CIRCLE.y}" r="38" fill="none" stroke="${palette.bright}" stroke-width="1.2"></circle>`,
    `<path d="M${CIRCLE.x} ${CIRCLE.y - 38} L${CIRCLE.x + 32.9} ${CIRCLE.y + 19} H${CIRCLE.x - 32.9} Z" fill="none" stroke="${palette.bright}" stroke-opacity="0.5"></path>`,
    `<path d="M${CIRCLE.x} ${CIRCLE.y + 38} L${CIRCLE.x + 32.9} ${CIRCLE.y - 19} H${CIRCLE.x - 32.9} Z" fill="none" stroke="${palette.bright}" stroke-opacity="0.5"></path>`,
    text(CIRCLE.x, CIRCLE.y + 15, "?", {
      size: 44,
      weight: 800,
      anchor: "middle",
      fill: palette.glow,
    }),
    text(COLUMN.x, 32, `ROOM ${depth} · EVENT`, {
      size: 8,
      weight: 700,
      spacing: 1.4,
      mono: true,
      fill: EVENT_PURPLE,
    }),
    ...title.map((line, index) =>
      text(COLUMN.x, 52 + index * 18, line, { size: 16, weight: 800 }),
    ),
    ...story.map((line, index) =>
      text(COLUMN.x, titleBottom + 15 + index * 10.5, line, {
        size: 8.2,
        opacity: 0.74,
      }),
    ),
    `<rect x="${COLUMN.x}" y="118" width="${COLUMN.width}" height="22" rx="5" fill="url(#check)"></rect>`,
    `<defs><linearGradient id="check" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${palette.bright}"></stop><stop offset="1" stop-color="${palette.deep}"></stop></linearGradient></defs>`,
    text(COLUMN.x + 8, 132.5, `${STAT_LABELS[room.stat].full} CHECK`, {
      size: 9,
      weight: 800,
      spacing: 1.2,
      mono: true,
    }),
    text(
      COLUMN.x + COLUMN.width - 8,
      132.5,
      `${STAT_LABELS[room.stat].short} + D6 ≥ ${room.target}`,
      {
        size: 9,
        weight: 800,
        spacing: 0.6,
        mono: true,
        anchor: "end",
      },
    ),
    ...reward.map((line, index) =>
      text(COLUMN.x, 160 + index * 9.5, line, {
        size: 7,
        weight: 700,
        spacing: 0.8,
        mono: true,
        fill: GOLD,
      }),
    ),
    finish(),
  ].join("");
};

/* ------------------------------------------------------------------ doors -- */

const doorColour = (room: Room): string =>
  room.kind === "shop"
    ? GOLD
    : room.kind === "event"
      ? EVENT_PURPLE
      : TYPE_PALETTES[room.enemy.type].bright;

const doorEmblem = (room: Room, x: number, y: number): string => {
  const colour = doorColour(room);
  const disc = `<circle cx="${n(x)}" cy="${n(y)}" r="15" fill="#0b0c16" fill-opacity="0.85" stroke="${colour}" stroke-width="1.6"></circle>`;

  if (room.kind === "shop") return `${disc}${coin(x, y, 7)}`;
  if (room.kind === "event") {
    return `${disc}${text(x, y + 7, "?", { size: 20, weight: 800, anchor: "middle", fill: colour })}`;
  }
  if (room.tier === "boss") return `${disc}${crown(x, y + 6, 20)}`;
  return [
    disc,
    room.tier === "elite"
      ? `<circle cx="${n(x)}" cy="${n(y)}" r="18.5" fill="none" stroke="${colour}" stroke-width="2" stroke-dasharray="1.5 5"></circle>`
      : "",
    swords(x, y, 7, colour),
  ].join("");
};

const FOG = "#9aa3b5";

/** The door's label: its hint, the enemy's name under a map, or nothing in fog. */
const doorLabel = (room: Room, sight: ReturnType<typeof doorSight>): string => {
  if (sight === "fogged") return "???";
  if (sight === "scouted" && room.kind === "fight") {
    const name = room.enemy.name.toUpperCase();
    return name.length > 18 ? `${name.slice(0, 17)}…` : name;
  }
  return doorHint(room).toUpperCase();
};

const doorsScene = (
  doors: Room[],
  depth: number,
  sight: ReturnType<typeof doorSight>,
): string => {
  const DOOR = { width: 84, top: 30, bottom: 150 };
  const centres =
    doors.length === 1
      ? [SCENE.width / 2]
      : doors.map(
          (_, index) =>
            SCENE.width / 2 + (index - (doors.length - 1) / 2) * 150,
        );

  return [
    backdrop(
      { top: "#1a1d33", bottom: "#0d0f1c", glow: "#6c78f0" },
      SCENE.width / 2,
    ),
    torch(SCENE.width / 2, 70),
    doors.length === 1 ? `${torch(60, 70)}${torch(SCENE.width - 60, 70)}` : "",
    text(
      SCENE.width / 2,
      18,
      `ROOM ${depth + 1} · ${doors.length === 1 ? "ONLY ONE WAY ON" : "CHOOSE A DOOR"}`,
      {
        size: 8,
        weight: 700,
        spacing: 1.6,
        mono: true,
        anchor: "middle",
        opacity: 0.8,
      },
    ),
    ...doors.map((room, index) => {
      const centre = centres[index];
      const x = centre - DOOR.width / 2;
      const colour = sight === "fogged" ? FOG : doorColour(room);
      const id = `door${index}`;
      const hint = doorLabel(room, sight);

      return [
        `<defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4a3524"></stop><stop offset="1" stop-color="#2a1d14"></stop></linearGradient><radialGradient id="${id}spill"><stop offset="0" stop-color="${colour}" stop-opacity="0.7"></stop><stop offset="1" stop-color="${colour}" stop-opacity="0"></stop></radialGradient></defs>`,
        // Light leaking from under the door, in the colour of what is behind it.
        `<ellipse cx="${n(centre)}" cy="${DOOR.bottom + 4}" rx="62" ry="16" fill="url(#${id}spill)"></ellipse>`,
        `<path d="${arch(x - 8, DOOR.top - 8, DOOR.width + 16, DOOR.bottom)}" fill="#2b3050"></path>`,
        `<path d="${arch(x, DOOR.top, DOOR.width, DOOR.bottom)}" fill="url(#${id})"></path>`,
        ...[0.25, 0.5, 0.75].map(
          (share) =>
            `<path d="M${n(x + DOOR.width * share)} ${DOOR.top + 12} V${DOOR.bottom}" stroke="#000000" stroke-opacity="0.35"></path>`,
        ),
        `<path d="M${n(x)} ${DOOR.bottom - 26} h${DOOR.width} M${n(x)} ${DOOR.top + 46} h${DOOR.width}" stroke="#15100b" stroke-width="5"></path>`,
        `<circle cx="${n(x + DOOR.width - 14)}" cy="${DOOR.bottom - 50}" r="4" fill="none" stroke="#c9a961" stroke-width="1.6"></circle>`,
        `<path d="${arch(x, DOOR.top, DOOR.width, DOOR.bottom)}" fill="none" stroke="${colour}" stroke-width="2" stroke-opacity="0.9"></path>`,
        `<rect x="${n(x + 3)}" y="${DOOR.bottom - 2}" width="${DOOR.width - 6}" height="2.5" fill="${colour}"></rect>`,
        sight === "fogged"
          ? text(centre, DOOR.top + 40, "?", {
              size: 26,
              weight: 800,
              fill: FOG,
              anchor: "middle",
              opacity: 0.85,
            })
          : doorEmblem(room, centre, DOOR.top + 30),
        `<rect x="${n(centre - 71)}" y="${DOOR.bottom + 9}" width="142" height="18" rx="9" fill="#0b0c16" fill-opacity="0.82" stroke="${colour}" stroke-opacity="0.6"></rect>`,
        text(centre, DOOR.bottom + 21.6, `${index + 1} · ${hint}`, {
          size: 8.5,
          weight: 800,
          spacing: 0.5,
          mono: true,
          anchor: "middle",
          fill: colour,
        }),
      ].join("");
    }),
    finish(),
  ].join("");
};

/* ----------------------------------------------------------------- render -- */

export type DungeonSceneInput = {
  phase: "room" | "doors";
  depth: number;
  room: Room;
  doors: Room[];
  /** The run's buffs, for whether fog hides the doors or a map shows them. */
  buffs?: Buff[];
};

/** The scene's SVG. Exported for tests; `renderDungeonScene` is the caller's. */
export const buildDungeonSceneSvg = (
  input: DungeonSceneInput,
  art: string | null = null,
): string => {
  const { room, depth } = input;
  const body =
    input.phase === "doors"
      ? doorsScene(input.doors, depth, doorSight({ buffs: input.buffs ?? [] }))
      : room.kind === "fight"
        ? fightScene(room, depth, art)
        : room.kind === "shop"
          ? shopScene(room, depth)
          : eventScene(room, depth);

  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${SCENE.width}" height="${SCENE.height}" viewBox="0 0 ${SCENE.width} ${SCENE.height}" font-family="Archivo, sans-serif">${body}</svg>`;
};

/**
 * Renders wherever the run is standing. Null if it cannot be drawn, in which
 * case the message says the same things in text.
 */
export const renderDungeonScene = async (
  input: DungeonSceneInput,
): Promise<Buffer | null> => {
  try {
    const scale = DUNGEON_SCENE_WIDTH / SCENE.width;
    const enemy =
      input.phase === "room" && input.room.kind === "fight"
        ? input.room.enemy
        : null;
    const art = enemy
      ? await squareArt(
          await resolveArtSource({
            art_url: enemy.artUrl,
            legacy_card: enemy.legacyCard,
            art_adjust: enemy.artAdjust,
          }),
          Math.round(130 * scale),
        )
      : null;

    return await sharp(Buffer.from(buildDungeonSceneSvg(input, art)), {
      density: 300,
    })
      .resize({ width: DUNGEON_SCENE_WIDTH })
      .png()
      .toBuffer();
  } catch (error) {
    console.error("Couldn't render a v2 dungeon scene:", error);
    return null;
  }
};
