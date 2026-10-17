import { createHash } from "crypto";
import { mkdir, readFile, writeFile } from "fs/promises";
import os from "os";
import path from "path";
import GifEncoder from "gif-encoder-2";
import sharp, { type Blend, type Sharp } from "sharp";
import type { ArtAdjust } from "../../../types/PocketbaseTablesV2";
import type { LegendaryTier } from "../legendary";
import type { BattleCard } from "../types";
import {
  buildCardSvg,
  cardImageName,
  loadArt,
  renderCardImage,
  resolveArtSource,
} from "./generateCardImage";
import { layoutFor } from "./layouts";

/**
 * Legendaries drawn: a full-art card as a looping, animated GIF.
 *
 * Each effect is a function of `phase` (0 to 1, and 1 is 0 again) that returns
 * layers to composite over the card's frame, so every one of them loops. A
 * layer can be confined by a mask read off the card itself (its outlines, its
 * shadows), an effect can rework the finished frame (`post`), and it can move
 * the artwork inside its window (`artMotion`).
 *
 * The pull reveal is the same card swinging in with its effect already
 * playing, ending on the loop's first frame so the loop can take over.
 *
 * Which effects exist and how rare they are is `../legendary.ts`; this file
 * only draws them.
 */

/** The full-art template's user units. */
const UNITS = { w: 320, h: 448 };

/** Rendered width. A GIF is paid for per pixel per frame, so this stays modest. */
const WIDTH = 420;
const HEIGHT = Math.round((WIDTH * UNITS.h) / UNITS.w);
const DEFAULT_FRAMES = 30;
const DEFAULT_DELAY_MS = 60;

/**
 * Frames in the loop being rendered. Set per render and read by the layers
 * that keep a beat, which is why renders are taken one at a time (`queue`).
 */
let FRAMES = DEFAULT_FRAMES;

export type LegendaryGifOptions = {
  /** Render the pull reveal, which plays once, instead of the loop. */
  reveal?: boolean;
  /** Override the effect's loop length and frame delay. For tuning only. */
  frames?: number;
  delay?: number;
};

type MaskName = "edges" | "dark";

type Layer = {
  svg: string;
  blend: Blend;
  /** Only light the card where this mask is open. */
  mask?: MaskName;
};

const TAU = Math.PI * 2;
const n = (value: number): string => value.toFixed(2);

const overlay = (body: string, defs = ""): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${UNITS.w} ${UNITS.h}"><defs><clipPath id="card"><rect width="${UNITS.w}" height="${UNITS.h}" rx="16"></rect></clipPath>${defs}</defs><g clip-path="url(#card)">${body}</g></svg>`;

const RAINBOW = [
  "#ff5f6d",
  "#ffc371",
  "#f9f871",
  "#7dffb3",
  "#6ad7ff",
  "#b08cff",
  "#ff7ad9",
];

/** Rainbow stops that end on the colour they start on, so `repeat` is seamless. */
const rainbowStops = (opacity = 1): string =>
  [...RAINBOW, RAINBOW[0]]
    .map(
      (colour, index) =>
        `<stop offset="${n(index / RAINBOW.length)}" stop-color="${colour}" stop-opacity="${opacity}"></stop>`,
    )
    .join("");

/* ---------------------------------------------------------------- layers --- */

/**
 * A band of light crossing the card corner to corner. `at` is where along the
 * crossing it sits, 0 to 1, so a caller can drive it with something other than
 * the clock.
 */
const shimmer = (at: number, width = 150): Layer => {
  const x = -width - 110 + at * (UNITS.w + UNITS.h + width + 220);

  return {
    blend: "screen",
    svg: overlay(
      `<rect width="${UNITS.w}" height="${UNITS.h}" fill="url(#band)"></rect>`,
      `<linearGradient id="band" gradientUnits="userSpaceOnUse" x1="${n(x)}" y1="0" x2="${n(x + width)}" y2="0" gradientTransform="rotate(28)"><stop offset="0" stop-color="#ff5f6d" stop-opacity="0"></stop><stop offset="0.2" stop-color="#ff5f6d" stop-opacity="0.45"></stop><stop offset="0.35" stop-color="#f9f871" stop-opacity="0.55"></stop><stop offset="0.5" stop-color="#ffffff" stop-opacity="0.9"></stop><stop offset="0.65" stop-color="#6ad7ff" stop-opacity="0.55"></stop><stop offset="0.8" stop-color="#b08cff" stop-opacity="0.45"></stop><stop offset="1" stop-color="#b08cff" stop-opacity="0"></stop></linearGradient>`,
    ),
  };
};

/** Deterministic 0..1 noise, so a particle keeps its place between frames. */
const hash = (seed: number): number => {
  const value = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return value - Math.floor(value);
};

/** Four-point stars that flare and die on their own clocks. */
const glitter = (
  phase: number,
  count = 46,
  colour = "#ffffff",
  mask?: MaskName,
): Layer => {
  const stars: string[] = [];

  for (let index = 0; index < count; index++) {
    const x = hash(index + 1) * UNITS.w;
    const y = hash(index + 101) * UNITS.h;
    const size = 2 + hash(index + 201) * 6;
    // Whole cycles per loop, or the last frame would not meet the first.
    const cycles = 1 + Math.floor(hash(index + 301) * 3);
    const flare =
      Math.max(0, Math.sin((phase * cycles + hash(index + 401)) * TAU)) ** 4;
    if (flare < 0.03) continue;

    const s = size * (0.5 + flare * 0.5);
    const t = s * 0.16;
    stars.push(
      `<path transform="translate(${n(x)} ${n(y)}) rotate(${n(flare * 40)})" d="M0 ${n(-s)} L${n(t)} ${n(-t)} L${n(s)} 0 L${n(t)} ${n(t)} L0 ${n(s)} L${n(-t)} ${n(t)} L${n(-s)} 0 L${n(-t)} ${n(-t)} Z" fill="${colour}" opacity="${n(flare)}"></path>`,
      `<circle cx="${n(x)}" cy="${n(y)}" r="${n(s * 1.6)}" fill="${colour}" opacity="${n(flare * 0.18)}"></circle>`,
    );
  }

  return { blend: "screen", mask, svg: overlay(stars.join("")) };
};

/**
 * Cracked-ice foil: the face cut into irregular shards, each catching the
 * light on its own beat as a wave of it crosses the card.
 */
const facets = (phase: number): Layer => {
  const cols = 6;
  const rows = 8;
  const cw = UNITS.w / cols;
  const ch = UNITS.h / rows;

  const vertex = (col: number, row: number): [number, number] => {
    const seed = row * (cols + 1) + col;
    const edge = col === 0 || col === cols || row === 0 || row === rows;
    return [
      col * cw + (edge ? 0 : (hash(seed + 7) - 0.5) * cw * 0.7),
      row * ch + (edge ? 0 : (hash(seed + 77) - 0.5) * ch * 0.7),
    ];
  };

  const shards: string[] = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const a = vertex(col, row);
      const b = vertex(col + 1, row);
      const c = vertex(col + 1, row + 1);
      const d = vertex(col, row + 1);
      const cell = row * cols + col;
      const split =
        hash(cell + 900) > 0.5
          ? [
              [a, b, c],
              [a, c, d],
            ]
          : [
              [a, b, d],
              [b, c, d],
            ];

      split.forEach((triangle, half) => {
        const seed = cell * 2 + half;
        const cx = (triangle[0][0] + triangle[1][0] + triangle[2][0]) / 3;
        const cy = (triangle[0][1] + triangle[1][1] + triangle[2][1]) / 3;
        const beat = hash(seed + 500) * 0.45 + (cx + cy) / (UNITS.w + UNITS.h);
        const flare = Math.max(0, Math.cos((phase - beat) * TAU)) ** 5;
        const points = triangle.map(([x, y]) => `${n(x)},${n(y)}`).join(" ");
        const colour = RAINBOW[Math.floor(hash(seed + 600) * RAINBOW.length)];
        shards.push(
          `<polygon points="${points}" fill="${colour}" fill-opacity="${n(0.05 + flare * 0.6)}" stroke="#ffffff" stroke-opacity="${n(0.12 + flare * 0.5)}" stroke-width="0.5"></polygon>`,
        );
      });
    }
  }

  // Hard light, not screen: screen adds nothing to art that is already bright.
  return { blend: "hard-light", svg: overlay(shards.join("")) };
};

/** A sheet of rainbow, for the masked effects to cut their light out of. */
const rainbowWash = (phase: number, mask: MaskName, opacity = 1): Layer => {
  const period = 300;
  const shift = phase * period;
  const stops = rainbowStops();

  return {
    blend: "screen",
    mask,
    svg: overlay(
      `<rect width="${UNITS.w}" height="${UNITS.h}" fill="url(#wash)" opacity="${opacity}"></rect>`,
      `<linearGradient id="wash" gradientUnits="userSpaceOnUse" spreadMethod="repeat" x1="${n(shift)}" y1="0" x2="${n(shift + period)}" y2="0" gradientTransform="rotate(30)">${stops}</linearGradient>`,
    ),
  };
};

/** A nebula turning slowly, meant to be seen through the card's shadows. */
const nebula = (phase: number): Layer => {
  const angle = phase * TAU;
  const blob = (id: string, colour: string, radius: number, offset: number) =>
    `<radialGradient id="${id}" gradientUnits="userSpaceOnUse" cx="${n(UNITS.w / 2 + Math.cos(angle + offset) * 90)}" cy="${n(UNITS.h / 2 + Math.sin(angle + offset) * 130)}" r="${radius}"><stop offset="0" stop-color="${colour}" stop-opacity="0.95"></stop><stop offset="1" stop-color="${colour}" stop-opacity="0"></stop></radialGradient>`;

  return {
    blend: "screen",
    mask: "dark",
    svg: overlay(
      ["a", "b", "c"]
        .map(
          (id) =>
            `<rect width="${UNITS.w}" height="${UNITS.h}" fill="url(#${id})"></rect>`,
        )
        .join(""),
      blob("a", "#b04bff", 230, 0) +
        blob("b", "#2fd9ff", 210, TAU / 3) +
        blob("c", "#ff4fa3", 200, (TAU * 2) / 3),
    ),
  };
};

/** Sparks rising off the bottom of the card. */
const embers = (phase: number, count = 60): Layer => {
  const sparks: string[] = [];

  for (let index = 0; index < count; index++) {
    const cycles = 1 + Math.floor(hash(index + 11) * 2);
    const rise = (phase * cycles + hash(index + 21)) % 1;
    const x =
      hash(index + 31) * UNITS.w +
      Math.sin((phase * 2 + hash(index + 41)) * TAU) * 9;
    const y = UNITS.h + 10 - rise * (UNITS.h * (0.55 + hash(index + 51) * 0.5));
    const life = Math.sin(rise * Math.PI);
    const r = 0.8 + hash(index + 61) * 1.9;
    sparks.push(
      `<circle cx="${n(x)}" cy="${n(y)}" r="${n(r * 3)}" fill="#ff6a1a" opacity="${n(life * 0.22)}"></circle>`,
      `<circle cx="${n(x)}" cy="${n(y)}" r="${n(r)}" fill="${rise > 0.5 ? "#ffb347" : "#fff1b8"}" opacity="${n(life)}"></circle>`,
    );
  }

  return { blend: "screen", svg: overlay(sparks.join("")) };
};

/** Manga focus lines, redrawn every other frame so they jitter like ink. */
const speedLines = (phase: number, count = 54): Layer => {
  const beat = Math.floor((phase * FRAMES) / 2);
  const cx = UNITS.w / 2;
  const cy = UNITS.h * 0.4;
  const lines: string[] = [];

  for (let index = 0; index < count; index++) {
    const seed = beat * 1000 + index;
    const angle = hash(seed + 1) * TAU;
    const inner = 0.52 + hash(seed + 2) * 0.3;
    const spread = 0.004 + hash(seed + 3) * 0.016;
    const reach = 420;
    const point = (a: number, radius: number) =>
      `${n(cx + Math.cos(a) * radius * 0.78)},${n(cy + Math.sin(a) * radius)}`;
    lines.push(
      `<polygon points="${point(angle, inner * 260)} ${point(angle - spread, reach)} ${point(angle + spread, reach)}" fill="#ffffff" opacity="${n(0.45 + hash(seed + 4) * 0.5)}"></polygon>`,
    );
  }

  return { blend: "screen", svg: overlay(lines.join("")) };
};

/** Lightning that forks across the card in short strikes. */
const lightning = (phase: number): Layer => {
  const { slot, age, live } = strikeAt(phase);
  if (!live) return { blend: "screen", svg: overlay("") };

  const bolt = (seed: number): string => {
    let points: [number, number][] = [
      [hash(seed + 1) * UNITS.w, -6],
      [hash(seed + 2) * UNITS.w, UNITS.h * (0.55 + hash(seed + 3) * 0.5)],
    ];
    for (let pass = 0; pass < 5; pass++) {
      const next: [number, number][] = [];
      for (let index = 0; index < points.length - 1; index++) {
        const [x0, y0] = points[index];
        const [x1, y1] = points[index + 1];
        const jolt =
          (hash(seed + pass * 97 + index * 13) - 0.5) * (70 / (pass + 1));
        next.push([x0, y0], [(x0 + x1) / 2 + jolt, (y0 + y1) / 2 + jolt * 0.3]);
      }
      next.push(points[points.length - 1]);
      points = next;
    }
    const path = points.map(([x, y]) => `${n(x)},${n(y)}`).join(" ");
    const fade = 1 - age * 0.7;
    return [
      `<polyline points="${path}" fill="none" stroke="#5aa8ff" stroke-width="9" stroke-opacity="${n(0.22 * fade)}" stroke-linejoin="round"></polyline>`,
      `<polyline points="${path}" fill="none" stroke="#9fd0ff" stroke-width="3.6" stroke-opacity="${n(0.6 * fade)}" stroke-linejoin="round"></polyline>`,
      `<polyline points="${path}" fill="none" stroke="#ffffff" stroke-width="1.3" stroke-opacity="${n(fade)}" stroke-linejoin="round"></polyline>`,
    ].join("");
  };

  const count = 1 + Math.floor(hash(slot + 4000) * 2);
  const bolts = Array.from({ length: count }, (_, index) =>
    bolt(slot * 50 + index * 7),
  ).join("");
  const flash = `<rect width="${UNITS.w}" height="${UNITS.h}" fill="#bfe0ff" opacity="${n(0.28 * (1 - age))}"></rect>`;

  return { blend: "screen", svg: overlay(flash + bolts) };
};

/** Whether lightning strikes in this slot of the loop, and how far through it is. */
const strikeAt = (
  phase: number,
): { slot: number; age: number; live: boolean } => {
  const slots = Math.max(1, Math.round(FRAMES / 4));
  const slot = Math.floor(phase * slots);
  return { slot, age: (phase * slots) % 1, live: hash(slot + 3000) <= 0.55 };
};

/**
 * The border taking the strike: light runs down it from the top, with the
 * bolt, and what is behind the front fades as it goes.
 */
const borderStrike = (phase: number): Layer => {
  const { age, live } = strikeAt(phase);
  if (!live) return { blend: "over", svg: overlay("") };

  // The front outruns the loop slot a little, so the border finishes lit.
  const front = Math.min(1, age * 1.7);
  const fade = 1 - age * 0.75;
  const tail = Math.max(0, front - 0.6);
  const ring = (stroke: string, width: number) =>
    `<rect x="3" y="3" width="${UNITS.w - 6}" height="${UNITS.h - 6}" rx="13.5" fill="none" stroke="${stroke}" stroke-width="${width}"></rect>`;

  return {
    blend: "over",
    svg: overlay(
      ring("url(#glow)", 11) + ring("url(#core)", 4.5),
      ["glow", "core"]
        .map(
          (id) =>
            `<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${id === "glow" ? "#5aa8ff" : "#bfe0ff"}" stop-opacity="${n((id === "glow" ? 0.35 : 0.7) * fade)}"></stop><stop offset="${n(tail)}" stop-color="${id === "glow" ? "#5aa8ff" : "#d8ecff"}" stop-opacity="${n((id === "glow" ? 0.45 : 0.85) * fade)}"></stop><stop offset="${n(Math.max(tail, front - 0.02))}" stop-color="#ffffff" stop-opacity="${id === "glow" ? n(0.7 * fade) : n(fade)}"></stop><stop offset="${n(front)}" stop-color="#ffffff" stop-opacity="0"></stop></linearGradient>`,
        )
        .join(""),
    ),
  };
};

/** Dims the whole card, so light laid over it has something to stand out from. */
const dim = (amount: number): Layer => ({
  blend: "over",
  svg: overlay(
    `<rect width="${UNITS.w}" height="${UNITS.h}" fill="#05060d" opacity="${amount}"></rect>`,
  ),
});

/** A thin border of light that turns once per loop. */
const prismBorder = (phase: number): Layer => {
  const stops = rainbowStops();

  return {
    blend: "over",
    svg: overlay(
      `<rect x="2.5" y="2.5" width="${UNITS.w - 5}" height="${UNITS.h - 5}" rx="14" fill="none" stroke="url(#ring)" stroke-width="5"></rect>`,
      `<linearGradient id="ring" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="${UNITS.w}" y2="${UNITS.h}" gradientTransform="rotate(${n(phase * 360)} ${UNITS.w / 2} ${UNITS.h / 2})">${stops}</linearGradient>`,
    ),
  };
};

/* ------------------------------------------------------------------ post --- */

/** Reads a pixel between pixels. Outside the frame is transparent. */
const sampleInto = (
  frame: Buffer,
  x: number,
  y: number,
  out: Buffer,
  at: number,
): void => {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  if (x0 < 0 || y0 < 0 || x0 >= WIDTH - 1 || y0 >= HEIGHT - 1) return;

  const fx = x - x0;
  const fy = y - y0;
  const base = (y0 * WIDTH + x0) * 4;
  for (let channel = 0; channel < 3; channel++) {
    const top =
      frame[base + channel] * (1 - fx) + frame[base + 4 + channel] * fx;
    const bottom =
      frame[base + WIDTH * 4 + channel] * (1 - fx) +
      frame[base + WIDTH * 4 + 4 + channel] * fx;
    out[at + channel] = top * (1 - fy) + bottom * fy;
  }
};

/**
 * Turns the card in space - `yaw` about its vertical axis, `pitch` about its
 * horizontal one - with real perspective, so the far edge is the short one.
 * At `scale` 1 and no turn it returns the frame as it came.
 *
 * Done by hand because sharp only has affine transforms, and a squeeze with a
 * shear reads as a wobble rather than as a card with depth. Each output pixel
 * is traced back through the camera onto the turned card.
 */
const turn = (
  frame: Buffer,
  yaw: number,
  pitch: number,
  scale: number,
): Buffer => {
  const out = Buffer.alloc(frame.length);
  for (let index = 3; index < out.length; index += 4) out[index] = 255;

  const camera = WIDTH * 2.6;
  const [cy, sy, cp, sp] = [
    Math.cos(yaw),
    Math.sin(yaw),
    Math.cos(pitch),
    Math.sin(pitch),
  ];

  // The card's own axes and normal after turning, in camera space.
  const u = [cy, 0, -sy];
  const v = [sy * sp, cp, cy * sp];
  const normal = [sy * cp, -sp, cy * cp];

  for (let py = 0; py < HEIGHT; py++) {
    for (let px = 0; px < WIDTH; px++) {
      // A ray from the eye through this pixel, met with the card's plane.
      const ray = [px - WIDTH / 2, py - HEIGHT / 2, camera];
      const along =
        (camera * normal[2]) /
        (ray[0] * normal[0] + ray[1] * normal[1] + ray[2] * normal[2]);
      const hit = [ray[0] * along, ray[1] * along, ray[2] * along - camera];
      const x =
        (hit[0] * u[0] + hit[1] * u[1] + hit[2] * u[2]) / scale + WIDTH / 2;
      const y =
        (hit[0] * v[0] + hit[1] * v[1] + hit[2] * v[2]) / scale + HEIGHT / 2;
      sampleInto(frame, x, y, out, (py * WIDTH + px) * 4);
    }
  }

  return out;
};

/** Maps each pixel's brightness through `colour`, which returns r, g, b. */
const gradientMap = (
  frame: Buffer,
  colour: (light: number, x: number, y: number) => [number, number, number],
): Buffer => {
  const out = Buffer.from(frame);
  for (let y = 0; y < HEIGHT; y++) {
    for (let x = 0; x < WIDTH; x++) {
      const at = (y * WIDTH + x) * 4;
      const light =
        (frame[at] * 0.299 + frame[at + 1] * 0.587 + frame[at + 2] * 0.114) /
        255;
      const [r, g, b] = colour(light, x, y);
      out[at] = r;
      out[at + 1] = g;
      out[at + 2] = b;
    }
  }
  return out;
};

const mix = (
  from: number[],
  to: number[],
  amount: number,
): [number, number, number] => [
  from[0] + (to[0] - from[0]) * amount,
  from[1] + (to[1] - from[1]) * amount,
  from[2] + (to[2] - from[2]) * amount,
];

/**
 * Ghost: the card drained to a cold spectral blue, with a faint second image
 * of itself drifting loose and the whole thing breathing in and out.
 */
const ghost = (frame: Buffer, phase: number): Buffer => {
  const drift = Math.round(Math.sin(phase * TAU) * 9);
  const lift = Math.round(Math.cos(phase * TAU) * 5);
  const breath = 0.86 + 0.14 * Math.sin(phase * TAU * 2);

  const spectral = gradientMap(frame, (light) => {
    const tone =
      light < 0.5
        ? mix([4, 10, 28], [40, 150, 190], light * 2)
        : mix([40, 150, 190], [225, 255, 250], light * 2 - 1);
    return [tone[0] * breath, tone[1] * breath, tone[2] * breath];
  });

  const out = Buffer.from(spectral);
  for (let y = 0; y < HEIGHT; y++) {
    for (let x = 0; x < WIDTH; x++) {
      const sx = x - drift;
      const sy = y - lift;
      if (sx < 0 || sy < 0 || sx >= WIDTH || sy >= HEIGHT) continue;
      const at = (y * WIDTH + x) * 4;
      const echo = (sy * WIDTH + sx) * 4;
      // Screened, so the echo only ever adds light - a double exposure.
      for (let channel = 0; channel < 3; channel++) {
        const under = spectral[at + channel];
        out[at + channel] =
          under + ((255 - under) * spectral[echo + channel] * 0.42) / 255;
      }
    }
  }
  return out;
};

/** How much of the x-ray loop the scan takes. The rest is the held negative. */
const XRAY_SCAN_SHARE = 2 / 3;

/**
 * X-ray: the card as a violet negative, with a band of its true colours
 * scanning down it, then a rest before it scans again.
 */
const xray = (frame: Buffer, phase: number): Buffer => {
  const band = HEIGHT * 0.22;
  // The scan takes the first part of the loop; for the rest the band is off
  // the bottom of the card and the negative just sits there.
  const scan = Math.min(1, phase / XRAY_SCAN_SHARE);
  const centre = -band + scan * (HEIGHT + band * 2);

  return gradientMap(frame, (light, x, y) => {
    const negative = mix([236, 225, 255], [28, 6, 58], light);
    const distance = Math.abs(y - centre) / band;
    if (distance >= 1) return negative;

    const at = (y * WIDTH + x) * 4;
    const reveal = Math.min(1, (1 - distance) * 2.2);
    return mix(negative, [frame[at], frame[at + 1], frame[at + 2]], reveal);
  });
};

/**
 * Thermal: brightness read as heat, and the palette itself slowly turning, so
 * colour crawls through the picture while nothing in it moves.
 */
const THERMAL = [
  [8, 6, 40],
  [70, 20, 140],
  [200, 40, 130],
  [255, 120, 50],
  [255, 225, 90],
  [255, 255, 240],
  [120, 230, 255],
  [30, 90, 200],
  [8, 6, 40],
];

const thermal = (frame: Buffer, phase: number): Buffer =>
  gradientMap(frame, (light) => {
    const at = ((light * 0.75 + phase) % 1) * (THERMAL.length - 1);
    const index = Math.floor(at);
    return mix(
      THERMAL[index],
      THERMAL[Math.min(THERMAL.length - 1, index + 1)],
      at - index,
    );
  });

/** Tears rows sideways and pulls the colour channels apart, in bursts. */
const glitch = (frame: Buffer, phase: number): Buffer => {
  const out = Buffer.from(frame);
  const slot = Math.floor(phase * FRAMES);
  // Two bursts a loop, three frames each; the rest of the time only a whisper.
  const burst = slot % Math.round(FRAMES / 2) < 3;
  const split = burst ? 5 + Math.floor(hash(slot + 1) * 6) : 1;

  for (let y = 0; y < HEIGHT; y++) {
    const band = Math.floor(y / (10 + hash(slot + 9) * 26));
    const tear =
      burst && hash(slot * 31 + band) > 0.72
        ? Math.round((hash(slot * 17 + band) - 0.5) * 60)
        : 0;
    const dim = y % 3 === 0 ? 0.82 : 1;

    for (let x = 0; x < WIDTH; x++) {
      const at = (y * WIDTH + x) * 4;
      const sample = (dx: number) =>
        (y * WIDTH + Math.min(WIDTH - 1, Math.max(0, x + tear + dx))) * 4;
      out[at] = frame[sample(split)] * dim;
      out[at + 1] = frame[sample(0) + 1] * dim;
      out[at + 2] = frame[sample(-split) + 2] * dim;
    }
  }

  return out;
};

/* ---------------------------------------------------------------- reveal --- */

/** The pull reveal: how long it runs, and how fast. Plays once, not a loop. */
const REVEAL = { frames: 44, delay: 50 };

/**
 * One frame of the pull reveal, `t` from 0 to 1.
 *
 * The card arrives small and almost edge-on, swings through face-on with a
 * flash, rocks back and forth a little less each time, and comes to rest
 * filling the frame - so its last frame is exactly a frame of the card's own
 * looping effect, and the loop can take over from it without a jump.
 */
const revealFrame = (frame: Buffer, t: number): Buffer => {
  const settle = (1 - t) ** 2;
  const yaw = 1.45 * settle * Math.cos(t * 10.5);
  const pitch = 0.2 * settle * Math.sin(t * 8);
  const grow = t * t * (3 - 2 * t);
  const out = turn(frame, yaw, pitch, 0.62 + 0.38 * grow);

  // Face-on for the first time at t = 0.15: that is where the flash goes.
  const flash = 0.85 * Math.exp(-(((t - 0.15) / 0.07) ** 2));
  if (flash > 0.01) {
    for (let at = 0; at < out.length; at += 4) {
      // Only the card flashes, not the black around it.
      if (out[at] + out[at + 1] + out[at + 2] === 0) continue;
      for (let channel = 0; channel < 3; channel++) {
        out[at + channel] += (255 - out[at + channel]) * flash;
      }
    }
  }

  return out;
};

/* --------------------------------------------------------------- effects --- */

type Effect = {
  blurb: string;
  /** Its Legendary tier. Checked against `LEGENDARY_EFFECTS` by the tests. */
  tier: LegendaryTier;
  layers: (phase: number) => Layer[];
  /** Reworks the finished frame (raw RGBA, card-sized). */
  post?: (frame: Buffer, phase: number) => Buffer | Promise<Buffer>;
  /** Moves the artwork inside the frame. Costs a card render per frame. */
  artMotion?: (phase: number) => ArtMotion;
  /** Loop length. More frames at the same delay is a slower animation. */
  frames?: number;
  delay?: number;
};

/** Where the art window sits over the artwork: 1 is as dealt, offsets are -1..1. */
type ArtMotion = { zoom: number; x: number; y: number };

const EFFECTS: Record<string, Effect> = {
  /* Tier 1 - the least rare of the secrets. */
  breathe: {
    tier: 1,
    blurb: "the art pushes in and eases back, like a held breath",
    frames: 60,
    delay: 120,
    artMotion: (phase) => ({
      zoom: 1.02 + 0.07 * (0.5 - 0.5 * Math.cos(phase * TAU)),
      x: 0,
      y: -0.4,
    }),
    layers: () => [],
  },
  drift: {
    tier: 1,
    blurb: "the art floats slowly in its window while the frame holds still",
    // A long loop at a low frame rate: the art barely moves per frame, so it
    // can afford the rate, and doubling the frames instead doubles the file.
    frames: 60,
    delay: 120,
    artMotion: (phase) => ({
      zoom: 1.07,
      x: Math.sin(phase * TAU) * 0.9,
      y: Math.sin(phase * TAU * 2) * 0.6,
    }),
    layers: () => [],
  },

  /* Tier 2. */
  embers: {
    tier: 2,
    blurb: "sparks rising off the bottom edge",
    layers: (phase) => [embers(phase)],
  },
  glitter: {
    tier: 2,
    blurb: "twinkling stars",
    layers: (phase) => [glitter(phase), prismBorder(phase)],
  },
  shimmer: {
    tier: 2,
    blurb: "a rainbow band crossing the card",
    layers: (phase) => [shimmer(phase), prismBorder(phase)],
  },
  speedlines: {
    tier: 2,
    blurb: "manga focus lines, jittering",
    layers: (phase) => [speedLines(phase)],
  },

  /* Tier 3. */
  cosmos: {
    tier: 3,
    blurb: "the card's shadows are windows onto a turning nebula",
    frames: 44,
    delay: 80,
    layers: (phase) => [nebula(phase), glitter(phase, 90, "#ffffff", "dark")],
  },
  glitch: {
    tier: 3,
    blurb: "signal tearing: scanlines, channel split, torn rows",
    layers: () => [],
    post: glitch,
  },
  storm: {
    tier: 3,
    blurb: "lightning strikes, and the border lights top to bottom with it",
    frames: 32,
    layers: (phase) => [lightning(phase), borderStrike(phase)],
  },

  /* Tier 4 - the rarest. */
  etched: {
    tier: 4,
    blurb: "the card dims and its linework burns in rainbow as a light passes",
    layers: (phase) => [
      dim(0.5),
      rainbowWash(phase, "edges"),
      { ...shimmer(phase, 300), mask: "edges" },
      { ...shimmer(phase, 300), mask: "edges" },
    ],
  },
  facets: {
    tier: 4,
    blurb: "cracked-ice foil: shards catching the light in a wave",
    layers: (phase) => [facets(phase), prismBorder(phase)],
  },
  ghost: {
    tier: 4,
    blurb: "drained to spectral blue, with a second image drifting loose",
    frames: 40,
    delay: 70,
    layers: () => [],
    post: ghost,
  },
  thermal: {
    tier: 4,
    blurb: "brightness read as heat, the palette slowly turning",
    frames: 40,
    delay: 70,
    layers: () => [],
    post: thermal,
  },
  xray: {
    tier: 4,
    blurb:
      "a violet negative, a band of true colour scanning down, then a rest",
    // 60 frames of scan as before, plus 30 held.
    frames: 90,
    delay: 100,
    layers: () => [],
    post: xray,
  },
};

/* ---------------------------------------------------------------- render --- */

const rasterise = (svg: string): Promise<Buffer> =>
  sharp(Buffer.from(svg), { density: 300 })
    .resize({ width: WIDTH, height: HEIGHT, fit: "fill" })
    .ensureAlpha()
    .png()
    .toBuffer();

/** How much spare artwork surrounds the window, for `artMotion` to move into. */
const ART_MARGIN = 1.12;

/**
 * The artwork cropped once to the art window's shape, oversized and with a
 * margin, so moving it is a matter of sliding a smaller window around inside.
 */
const prepareMovingArt = (art: Buffer): Promise<Buffer> => {
  const window = layoutFor("full_art", true).art;
  const scale = (WIDTH / UNITS.w) * 2 * ART_MARGIN;
  return sharp(art)
    .resize({
      width: Math.round(window.w * scale),
      height: Math.round(window.h * scale),
      fit: "cover",
      position: "attention",
    })
    .png()
    .toBuffer();
};

const moveArt = async (
  prepared: Buffer,
  motion: ArtMotion,
): Promise<Buffer> => {
  const meta = await sharp(prepared).metadata();
  const full = { w: meta.width ?? 1, h: meta.height ?? 1 };
  const zoom = Math.min(Math.max(motion.zoom, 1), ART_MARGIN);
  const width = Math.round(full.w / zoom);
  const height = Math.round(full.h / zoom);
  const slack = { x: (full.w - width) / 2, y: (full.h - height) / 2 };

  return sharp(prepared)
    .extract({
      left: Math.round(slack.x + slack.x * Math.max(-1, Math.min(1, motion.x))),
      top: Math.round(slack.y + slack.y * Math.max(-1, Math.min(1, motion.y))),
      width,
      height,
    })
    .toBuffer();
};

/** The card the effects play over. Its `legendary` effect sets the code it prints. */
const cardFrame = async (
  card: BattleCard,
  art: Buffer | null,
  /** Crop corrections apply to the artwork as dealt, not to a frame of it in motion. */
  adjust: ArtAdjust | null,
): Promise<Buffer> =>
  rasterise(
    await buildCardSvg(card, {
      width: WIDTH,
      ...(art ? { art: { buffer: art, adjust } } : { withoutArt: true }),
    }),
  );

/**
 * Greyscale masks read off the rendered card: `edges` is its linework, `dark`
 * its shadows. White is where a masked layer is allowed to show.
 */
const buildMasks = async (card: Buffer): Promise<Record<MaskName, Buffer>> => {
  const grey = sharp(card).flatten({ background: "#000000" }).greyscale();
  const finish = (image: Sharp) => image.toColourspace("srgb").png().toBuffer();

  return {
    edges: await finish(
      grey
        .clone()
        .convolve({
          width: 3,
          height: 3,
          kernel: [-1, -1, -1, -1, 8, -1, -1, -1, -1],
        })
        .linear(6, -30)
        .blur(1.1),
    ),
    dark: await finish(grey.clone().negate().linear(2.4, -330).blur(1.2)),
  };
};

const renderGif = async (
  card: BattleCard,
  art: Buffer | null,
  effect: Effect,
  options: LegendaryGifOptions = {},
): Promise<Buffer> => {
  const reveal = !!options.reveal;
  FRAMES = options.frames ?? effect.frames ?? DEFAULT_FRAMES;
  const delay = reveal
    ? REVEAL.delay
    : (options.delay ?? effect.delay ?? DEFAULT_DELAY_MS);
  // The effect keeps playing under the reveal, at the speed it loops at.
  const count = reveal ? REVEAL.frames : FRAMES;
  const step = reveal
    ? REVEAL.delay / ((effect.delay ?? DEFAULT_DELAY_MS) * FRAMES)
    : 1 / FRAMES;

  let still = await cardFrame(card, art, card.artAdjust ?? null);
  const masks = await buildMasks(still);
  const moving = effect.artMotion && art ? await prepareMovingArt(art) : null;
  const frames: Buffer[] = [];

  for (let index = 0; index < count; index++) {
    // Counted back from the end, so a reveal's last frame is the loop's first.
    const phase = reveal
      ? (1 - (((count - 1 - index) * step) % 1)) % 1
      : index * step;
    if (moving && effect.artMotion) {
      still = await cardFrame(
        card,
        await moveArt(moving, effect.artMotion(phase)),
        null,
      );
    }

    const layers = await Promise.all(
      effect.layers(phase).map(async (layer) => {
        const light = await rasterise(layer.svg);
        if (!layer.mask) return { input: light, blend: layer.blend };

        // Screened onto the card, black adds nothing - so a masked layer is its
        // light on black, multiplied down to nothing where the mask is shut.
        const masked = await sharp(light)
          .flatten({ background: "#000000" })
          .composite([{ input: masks[layer.mask], blend: "multiply" }])
          .png()
          .toBuffer();
        return { input: masked, blend: layer.blend };
      }),
    );

    const frame = await sharp(still).composite(layers).raw().toBuffer();
    const finished = effect.post ? await effect.post(frame, phase) : frame;
    frames.push(reveal ? revealFrame(finished, index / (count - 1)) : finished);
  }

  // gif-encoder-2 assembles the frames; a pass back through sharp then
  // re-quantises them and drops the pixels that did not change between frames.
  const encoder = new GifEncoder(WIDTH, HEIGHT, "neuquant", false, count);
  encoder.setDelay(delay);
  encoder.setRepeat(reveal ? -1 : 0);
  encoder.setQuality(8);
  encoder.start();
  for (const frame of frames) encoder.addFrame(frame);
  encoder.finish();

  return sharp(encoder.out.getData(), { animated: true })
    .gif({
      effort: 8,
      dither: 0.6,
      interFrameMaxError: 4,
      loop: reveal ? 1 : 0,
    })
    .toBuffer();
};

/* ------------------------------------------------------------------- api --- */

/** Every effect that can be drawn, by slug, with its tier and a description. */
export const LEGENDARY_GIF_EFFECTS: Record<
  string,
  { tier: LegendaryTier; blurb: string }
> = Object.fromEntries(
  Object.entries(EFFECTS).map(([slug, effect]) => [
    slug,
    { tier: effect.tier, blurb: effect.blurb },
  ]),
);

let queue: Promise<unknown> = Promise.resolve();

/**
 * No effect at all: the card as it is. What a Secret Art's pull reveal is drawn
 * under - it gets the entrance, and then it is a still. Not one of `EFFECTS`,
 * because no copy can carry it.
 */
const STILL: Effect = {
  tier: 1,
  blurb: "the card, unmoving",
  layers: () => [],
};

/**
 * Renders `card` under `effect` as a GIF. `art` is the card's artwork, already
 * in hand, or null for none. Throws for an effect that does not exist.
 */
export const renderLegendaryGif = (
  card: BattleCard,
  art: Buffer | null,
  effect: string,
  options: LegendaryGifOptions = {},
): Promise<Buffer> => {
  const found = EFFECTS[effect];
  if (!found)
    return Promise.reject(new Error(`No Legendary effect "${effect}"`));

  return queued(() =>
    renderGif({ ...card, legendary: effect }, art, found, options),
  );
};

/** One at a time: a render is heavy, and the beat it keeps is module state. */
const queued = (render: () => Promise<Buffer>): Promise<Buffer> => {
  const next = queue.then(render);
  queue = next.catch(() => undefined);
  return next;
};

const CACHE_DIR = path.join(os.tmpdir(), "finicards-v2-legendary");

/**
 * A Legendary copy's GIF, from the cache when this exact card has been drawn
 * before. Keyed on everything printed, so an edit to the card - new art, new
 * stats, a different crop - is simply a different file. Null when the card is
 * not a Legendary or could not be drawn.
 */
export const legendaryGif = async (
  card: BattleCard,
  options: { reveal?: boolean } = {},
): Promise<Buffer | null> => {
  // A Legendary in its effect; a Secret Art only as its reveal.
  const effect = card.legendary
    ? EFFECTS[card.legendary]
    : options.reveal && card.secretArt
      ? STILL
      : undefined;
  if (!effect) return null;

  const key = createHash("sha1")
    .update(JSON.stringify({ card, reveal: !!options.reveal, width: WIDTH }))
    .digest("hex");
  const file = path.join(CACHE_DIR, `${key}.gif`);
  try {
    return await readFile(file);
  } catch {
    // Not drawn yet.
  }

  try {
    const art = await loadArt(
      await resolveArtSource({
        art_url: card.artUrl,
        legacy_card: card.legacyCard,
        art_adjust: null,
      }),
    );
    const gif = card.legendary
      ? await renderLegendaryGif(card, art, card.legendary, options)
      : await queued(() => renderGif(card, art, STILL, options));
    // A card that has art and came out without it hit a passing failure -
    // shown this once, but not kept, or it would be served that way for good.
    if (art || !(card.artUrl || card.legacyCard)) {
      await mkdir(CACHE_DIR, { recursive: true });
      await writeFile(file, gif);
    }
    return gif;
  } catch (error) {
    console.error(
      `Couldn't render Legendary "${card.name}" (${card.legendary}):`,
      error,
    );
    return null;
  }
};

/** How long the pull reveal plays before it comes to rest, in milliseconds. */
export const LEGENDARY_REVEAL_MS = REVEAL.frames * REVEAL.delay;

export type CardMedia = { name: string; buffer: Buffer };

/**
 * A card as Discord should show it: its animated GIF if it is a Legendary,
 * otherwise its still. With `reveal`, a Legendary or a Secret Art comes as its
 * pull reveal, under a name of its own so what replaces it - the loop, or the
 * still - is not mistaken for it.
 * A Legendary that cannot be animated falls back to its still; null only when
 * nothing could be drawn at all.
 */
export const renderCardMedia = async (
  card: BattleCard,
  options: { reveal?: boolean } = {},
): Promise<CardMedia | null> => {
  const gif = await legendaryGif(card, options);
  if (gif) {
    const stem = cardImageName(card).replace(/\.(gif|png)$/, "");
    return {
      name: `${stem}${options.reveal ? "-reveal" : ""}.gif`,
      buffer: gif,
    };
  }

  const still = await renderCardImage(card);
  return still
    ? { name: cardImageName(card).replace(/\.gif$/, ".png"), buffer: still }
    : null;
};

/** Several cards at once, dropping any that could not be drawn. */
export const renderCardMediaList = async (
  cards: BattleCard[],
  options: { reveal?: boolean } = {},
): Promise<CardMedia[]> =>
  (
    await Promise.all(cards.map((card) => renderCardMedia(card, options)))
  ).filter((media): media is CardMedia => media !== null);
