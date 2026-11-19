import sharp, { type OverlayOptions } from "sharp";
import { COLLECTIONS, piecesOf, type CollectionKey } from "../items";
import type { BattleCard } from "../types";
import {
  coverCrop,
  loadArt,
  renderCardImage,
  resolveArtSource,
} from "./generateCardImage";

/**
 * The summoning: a completed set of dungeon items calling its card (issue #8),
 * as a GIF that plays once.
 *
 *   gather   - the pieces appear one by one and circle, glowing
 *   converge - they spiral in, faster and faster
 *   flash    - a burst of white
 *   reveal   - the card scales up out of the light, rays turning behind it
 *   rest     - the card holds, so the last frame is the card itself
 *
 * Each set draws its own pieces: Dragon Balls as orange orbs with their stars,
 * the Chaos Emeralds as cut gems in their colours, and Exodia's limbs and head
 * as sealed cards each holding its piece of his own art - which close in to
 * their places in a body rather than to a point, so he's assembled. Encoded the way the Legendary reveal is: frames stacked raw and
 * handed to sharp, so it runs off the main thread.
 */

const WIDTH = 400;
const HEIGHT = 560;
const CX = WIDTH / 2;
const CY = HEIGHT / 2 - 10;
/** The card at rest, inside the frame. */
const CARD = { width: 316 };

const DELAY = 50;
const PHASE = { gather: 30, converge: 18, flash: 6, reveal: 20, rest: 16 };
export const SUMMON_FRAMES = Object.values(PHASE).reduce((a, b) => a + b, 0);
/** How long the summoning plays before it comes to rest, in milliseconds. */
export const SUMMON_MS = SUMMON_FRAMES * DELAY;
export const SUMMON_FILE = "summoning.gif";

const SET_GLOW: Record<CollectionKey, string> = {
  dragon_balls: "#ffb03b",
  exodia: "#c79bff",
  chaos_emeralds: "#fff1a0",
};

const EMERALD: Record<string, string> = {
  green: "#2ecc71",
  blue: "#3b82f6",
  yellow: "#facc15",
  cyan: "#22d3ee",
  purple: "#a855f7",
  red: "#ef4444",
  white: "#f1f5f9",
};

const n = (value: number) => value.toFixed(2);

/** `colour` mixed toward white (amount > 0) or black (amount < 0). */
const shade = (colour: string, amount: number): string => {
  const value = Number.parseInt(colour.slice(1), 16);
  const channel = (shift: number) => {
    const c = (value >> shift) & 255;
    const target = amount > 0 ? 255 : 0;
    return Math.round(c + (target - c) * Math.abs(amount));
  };
  return `#${[16, 8, 0].map((shift) => channel(shift).toString(16).padStart(2, "0")).join("")}`;
};

/** Where each of Exodia's pieces sits once he's assembled, from the centre. */
const EXODIA_SLOTS: Record<string, { x: number; y: number }> = {
  exodia_head: { x: 0, y: -78 },
  exodia_right_arm: { x: -82, y: -8 },
  exodia_left_arm: { x: 82, y: -8 },
  exodia_right_leg: { x: -40, y: 76 },
  exodia_left_leg: { x: 40, y: 76 },
};

/**
 * The part of Exodia's art each piece holds, as shares of the picture: his
 * right arm is on the viewer's left.
 */
const EXODIA_CROPS: Record<string, [number, number, number, number]> = {
  exodia_head: [0.3, 0, 0.4, 0.38],
  exodia_right_arm: [0, 0.22, 0.38, 0.45],
  exodia_left_arm: [0.62, 0.22, 0.38, 0.45],
  exodia_right_leg: [0.1, 0.58, 0.4, 0.42],
  exodia_left_leg: [0.5, 0.58, 0.4, 0.42],
};
const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const easeIn = (t: number) => t * t * t;
const easeOut = (t: number) => 1 - (1 - t) ** 3;

/** A five-pointed star, for the Dragon Balls. */
const star = (x: number, y: number, r: number, fill: string) => {
  const points = Array.from({ length: 10 }, (_, i) => {
    const angle = -Math.PI / 2 + (i * Math.PI) / 5;
    const radius = i % 2 === 0 ? r : r * 0.45;
    return `${n(x + Math.cos(angle) * radius)},${n(y + Math.sin(angle) * radius)}`;
  });
  return `<polygon points="${points.join(" ")}" fill="${fill}"></polygon>`;
};

/** One piece of `set`, `index` in its order, drawn at (x, y) at size `s`. */
const pieceSvg = (
  set: CollectionKey,
  index: number,
  x: number,
  y: number,
  s: number,
  opacity: number,
  fragments: Record<string, string>,
): string => {
  const pieces = piecesOf(set);
  const piece = pieces[index];
  const body = (() => {
    if (set === "dragon_balls") {
      const stars = index + 1;
      const ring = stars === 1 ? 0 : s * 0.2;
      return [
        `<circle cx="${n(x)}" cy="${n(y)}" r="${n(s * 0.5)}" fill="url(#orb)"></circle>`,
        ...Array.from({ length: stars }, (_, i) => {
          const angle = (i / stars) * Math.PI * 2 - Math.PI / 2;
          return star(
            x + Math.cos(angle) * ring,
            y + Math.sin(angle) * ring,
            s * (stars === 1 ? 0.2 : 0.1),
            "#d42a1e",
          );
        }),
        `<ellipse cx="${n(x - s * 0.17)}" cy="${n(y - s * 0.2)}" rx="${n(s * 0.13)}" ry="${n(s * 0.08)}" fill="#ffffff" fill-opacity="0.75"></ellipse>`,
      ].join("");
    }
    if (set === "exodia") {
      const w = s * 0.72;
      const h = s;
      const inset = s * 0.07;
      const fragment = piece ? fragments[piece.key] : undefined;
      const id = `frag${index}`;
      return [
        `<rect x="${n(x - w / 2)}" y="${n(y - h / 2)}" width="${n(w)}" height="${n(h)}" rx="${n(s * 0.06)}" fill="#2a1a0c"></rect>`,
        fragment
          ? `<clipPath id="${id}"><rect x="${n(x - w / 2 + inset)}" y="${n(y - h / 2 + inset)}" width="${n(w - inset * 2)}" height="${n(h - inset * 2.6)}" rx="${n(s * 0.03)}"></rect></clipPath><image x="${n(x - w / 2 + inset)}" y="${n(y - h / 2 + inset)}" width="${n(w - inset * 2)}" height="${n(h - inset * 2.6)}" preserveAspectRatio="xMidYMid slice" clip-path="url(#${id})" xlink:href="${fragment}"></image>`
          : "",
        `<rect x="${n(x - w / 2)}" y="${n(y - h / 2)}" width="${n(w)}" height="${n(h)}" rx="${n(s * 0.06)}" fill="none" stroke="#e6b84a" stroke-width="${n(s * 0.045)}"></rect>`,
        `<text x="${n(x)}" y="${n(y + h / 2 - s * 0.045)}" text-anchor="middle" font-family="JetBrains Mono, monospace" font-size="${n(s * 0.085)}" font-weight="800" letter-spacing="${n(s * 0.008)}" fill="#e6b84a">${(piece?.short ?? "").toUpperCase()}</text>`,
      ].join("");
    }
    // A Chaos Emerald: a cut gem seen from the side - a lit crown over a
    // shaded pavilion, and its facet lines.
    const colour =
      EMERALD[(piece?.key ?? "").replace("chaos_emerald_", "")] ?? "#2ecc71";
    const w = s * 0.92;
    const crown = s * 0.3;
    const pavilion = s * 0.52;
    const top = y - (crown + pavilion) / 2;
    const girdle = top + crown;
    const tip = girdle + pavilion;
    const table = w * 0.3;
    const line = `stroke="#ffffff" stroke-opacity="0.35" stroke-width="${n(s * 0.012)}"`;
    return [
      `<polygon points="${n(x - table)},${n(top)} ${n(x + table)},${n(top)} ${n(x + w / 2)},${n(girdle)} ${n(x - w / 2)},${n(girdle)}" fill="${shade(colour, 0.35)}"></polygon>`,
      `<polygon points="${n(x - w / 2)},${n(girdle)} ${n(x + w / 2)},${n(girdle)} ${n(x)},${n(tip)}" fill="${shade(colour, -0.25)}"></polygon>`,
      // The facets that catch the light: the table, and the left of the pavilion.
      `<polygon points="${n(x - table)},${n(top)} ${n(x + table)},${n(top)} ${n(x + table * 0.55)},${n(girdle)} ${n(x - table * 0.55)},${n(girdle)}" fill="${shade(colour, 0.6)}"></polygon>`,
      `<polygon points="${n(x - w / 2)},${n(girdle)} ${n(x - w / 6)},${n(girdle)} ${n(x)},${n(tip)}" fill="${colour}"></polygon>`,
      `<path d="M${n(x - table)} ${n(top)} L${n(x - w / 2)} ${n(girdle)} M${n(x + table)} ${n(top)} L${n(x + w / 2)} ${n(girdle)} M${n(x - table * 0.55)} ${n(girdle)} L${n(x)} ${n(tip)} M${n(x + table * 0.55)} ${n(girdle)} L${n(x)} ${n(tip)} M${n(x - w / 2)} ${n(girdle)} H${n(x + w / 2)}" fill="none" ${line}></path>`,
    ].join("");
  })();
  // A soft halo under every piece, in its set's light.
  return `<g opacity="${n(opacity)}"><circle cx="${n(x)}" cy="${n(y)}" r="${n(s * 0.85)}" fill="url(#halo)"></circle>${body}</g>`;
};

/** The frame's background, rays and pieces, at frame `f`. */
const sceneSvg = (
  set: CollectionKey,
  f: number,
  fragments: Record<string, string>,
): string => {
  const glow = SET_GLOW[set];
  const count = piecesOf(set).length;
  const { gather, converge, flash } = PHASE;
  const convergeStart = gather;
  const flashStart = gather + converge;
  const revealStart = flashStart + flash;

  // How strong the light is: rising through the gathering, full at the flash.
  const light =
    f < flashStart ? 0.25 + 0.55 * (f / flashStart) : f < revealStart ? 1 : 0.8;

  const pieces =
    f < flashStart
      ? Array.from({ length: count }, (_, i) => {
          const appear = clamp01((f - i * 3) / 6);
          const t = clamp01((f - convergeStart) / converge);
          const spin = f * 0.035 + easeIn(t) * (set === "exodia" ? 0 : 6);
          const angle = (i / count) * Math.PI * 2 + spin - Math.PI / 2;
          const circling = {
            x: CX + Math.cos(angle) * 146,
            y: CY + Math.sin(angle) * 146,
          };
          // Exodia's pieces close in on their places in a body; the rest on
          // the middle.
          const slot = EXODIA_SLOTS[piecesOf(set)[i]?.key ?? ""];
          const target =
            set === "exodia" && slot
              ? { x: CX + slot.x, y: CY + slot.y }
              : { x: CX, y: CY };
          const k = set === "exodia" ? easeOut(t) : easeIn(t);
          const size =
            set === "exodia" ? 70 * (1 + 0.15 * k) : 56 * (1 - 0.45 * k);
          return pieceSvg(
            set,
            i,
            circling.x + (target.x - circling.x) * k,
            circling.y + (target.y - circling.y) * k,
            size,
            appear,
            fragments,
          );
        }).join("")
      : "";

  // Rays behind the card once it's out, turning slowly.
  const rays =
    f >= revealStart
      ? Array.from({ length: 16 }, (_, i) => {
          const angle = (i / 16) * Math.PI * 2 + (f - revealStart) * 0.02;
          const spread = 0.07;
          const reach = 440;
          return `<polygon points="${CX},${CY} ${n(CX + Math.cos(angle - spread) * reach)},${n(CY + Math.sin(angle - spread) * reach)} ${n(CX + Math.cos(angle + spread) * reach)},${n(CY + Math.sin(angle + spread) * reach)}" fill="url(#rays)"></polygon>`;
        }).join("")
      : "";

  const title =
    f < flashStart
      ? `<text x="${CX}" y="40" text-anchor="middle" font-family="JetBrains Mono, monospace" font-size="14" font-weight="800" letter-spacing="5" fill="${glow}" fill-opacity="${n(clamp01(f / 8))}">SUMMONING ${COLLECTIONS[set].summons.toUpperCase()}</text>`
      : "";

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" font-family="Archivo, DejaVu Sans, sans-serif">`,
    `<defs>`,
    `<radialGradient id="sky" cx="50%" cy="48%" r="70%"><stop offset="0" stop-color="${glow}" stop-opacity="${n(light * 0.55)}"></stop><stop offset="0.55" stop-color="#1b1430" stop-opacity="1"></stop><stop offset="1" stop-color="#07060d" stop-opacity="1"></stop></radialGradient>`,
    // Rays fade out from the centre, so they read as light, not stripes.
    `<radialGradient id="rays" gradientUnits="userSpaceOnUse" cx="${CX}" cy="${CY}" r="300"><stop offset="0" stop-color="${glow}" stop-opacity="0.38"></stop><stop offset="1" stop-color="${glow}" stop-opacity="0"></stop></radialGradient>`,
    `<radialGradient id="halo"><stop offset="0" stop-color="${glow}" stop-opacity="0.75"></stop><stop offset="1" stop-color="${glow}" stop-opacity="0"></stop></radialGradient>`,
    `<radialGradient id="orb" cx="40%" cy="35%" r="65%"><stop offset="0" stop-color="#ffe2a8"></stop><stop offset="0.55" stop-color="#ffa630"></stop><stop offset="1" stop-color="#d9640f"></stop></radialGradient>`,
    `</defs>`,
    `<rect width="${WIDTH}" height="${HEIGHT}" fill="#07060d"></rect>`,
    `<rect width="${WIDTH}" height="${HEIGHT}" fill="url(#sky)"></rect>`,
    rays,
    title,
    pieces,
    `</svg>`,
  ].join("");
};

/** White over everything at the flash, fading as the card comes out. */
const flashSvg = (f: number): string | null => {
  const start = PHASE.gather + PHASE.converge;
  const t = f - start;
  const opacity =
    t < 0 ? 0 : t < 3 ? (t + 1) / 3 : clamp01(1 - (t - 3) / (PHASE.flash + 6));
  if (opacity <= 0) return null;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}"><rect width="${WIDTH}" height="${HEIGHT}" fill="#ffffff" fill-opacity="${n(opacity)}"></rect></svg>`;
};

/**
 * Exodia's pieces, cut from his own art: each piece's part of the picture as
 * an image it can carry. Empty when the art can't be had - the cards are then
 * drawn sealed.
 */
const exodiaFragments = async (
  card: BattleCard,
): Promise<Record<string, string>> => {
  const art = await loadArt(
    await resolveArtSource({
      art_url: card.artUrl,
      legacy_card: card.legacyCard,
      art_adjust: card.artAdjust,
    }),
  ).catch(() => null);
  if (!art) return {};
  const { width = 1, height = 1 } = await sharp(art).metadata();
  const pieces: Record<string, string> = {};
  for (const [key, [x, y, w, h]] of Object.entries(EXODIA_CROPS)) {
    const region = await sharp(art)
      .extract({
        left: Math.round(x * width),
        top: Math.round(y * height),
        width: Math.max(1, Math.round(w * width)),
        height: Math.max(1, Math.round(h * height)),
      })
      .png()
      .toBuffer();
    const fitted = await coverCrop(region, 120, 150);
    pieces[key] = `data:image/png;base64,${fitted.toString("base64")}`;
  }
  return pieces;
};

/**
 * The summoning of `card` from `set`, as a GIF that plays once and comes to
 * rest on the card. Null if it can't be drawn - the caller shows the card.
 */
export const renderSummonGif = async (
  set: CollectionKey,
  card: BattleCard,
): Promise<Buffer | null> => {
  try {
    const face = await renderCardImage(card, { width: CARD.width });
    if (!face) return null;
    const faceMeta = await sharp(face).metadata();
    const faceHeight = faceMeta.height ?? Math.round(CARD.width * 1.4);
    const revealStart = PHASE.gather + PHASE.converge + PHASE.flash;
    const fragments = set === "exodia" ? await exodiaFragments(card) : {};

    const frames: Buffer[] = [];
    for (let f = 0; f < SUMMON_FRAMES; f++) {
      const layers: OverlayOptions[] = [];
      // The card comes out under the end of the flash, growing to rest.
      const shown = f - (revealStart - 3);
      if (shown >= 0) {
        const scale = 0.82 + 0.18 * easeOut(clamp01(shown / PHASE.reveal));
        const width = Math.round(CARD.width * scale);
        const height = Math.round(faceHeight * scale);
        layers.push({
          input: await sharp(face).resize({ width, height }).png().toBuffer(),
          left: Math.round(CX - width / 2),
          top: Math.round(CY + 10 - height / 2),
        });
      }
      const flash = flashSvg(f);
      if (flash) layers.push({ input: Buffer.from(flash) });

      frames.push(
        await sharp(Buffer.from(sceneSvg(set, f, fragments)))
          .composite(layers)
          .ensureAlpha()
          .raw()
          .toBuffer(),
      );
    }

    return await sharp(Buffer.concat(frames), {
      raw: {
        width: WIDTH,
        height: HEIGHT * SUMMON_FRAMES,
        channels: 4,
        pageHeight: HEIGHT,
      },
    })
      .gif({
        delay: Array(SUMMON_FRAMES).fill(DELAY),
        effort: 4,
        dither: 0.6,
        interFrameMaxError: 4,
        loop: 1,
      })
      .toBuffer();
  } catch (error) {
    console.error(`Couldn't draw the summoning of ${card.name}:`, error);
    return null;
  }
};
