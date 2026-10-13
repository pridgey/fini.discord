import GifEncoder from "gif-encoder-2";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import sharp from "sharp";
import {
  PACK_COVER_FILE,
  PACK_OPENING_DELAY_MS,
  PACK_OPENING_FILE,
  PACK_OPENING_FRAMES,
} from "../modules/finicardsV2/cardArt/packOpening";
import { TYPE_PALETTES } from "../modules/finicardsV2/cardArt/palettes";

/**
 * Draws the v2 booster pack and its opening animation, and saves both where
 * the game reads them (`modules/finicardsV2/assets`).
 *
 *   bun run scripts/finicards_v2_pack_art.ts
 *
 * Run it again after changing anything here; the game only ever reads the
 * saved files. The opening: the pack turns over to show its back, unzips down
 * its seam from the top, and light pours out of it until the pack is gone.
 */

/* ------------------------------------------------------------------ pack --- */

/** The pack is drawn in these units and scaled to whatever size is wanted. */
const UNITS = { w: 300, h: 460 };
const CRIMP = 30;
const INK = "#0b0c16";
const { power, wit, heart } = TYPE_PALETTES;

/** A foil pouch's outline: straight sides, with a pinked edge top and bottom. */
const outline = (): string => {
  const teeth = 20;
  const step = UNITS.w / teeth;
  const top = Array.from({ length: teeth }, (_, index) => `L${(index + 0.5) * step},0 L${(index + 1) * step},5`);
  const bottom = Array.from(
    { length: teeth },
    (_, index) => `L${UNITS.w - (index + 0.5) * step},${UNITS.h} L${UNITS.w - (index + 1) * step},${UNITS.h - 5}`,
  );
  return `M0,5 ${top.join(" ")} L${UNITS.w},${UNITS.h - 5} ${bottom.join(" ")} Z`;
};

/** The pressed ridges of a heat seal, across the pack at `y`. */
const crimp = (y: number): string => {
  const ridges = Array.from(
    { length: 42 },
    (_, index) => `<rect x="${6 + index * 7}" y="${y + 7}" width="2.4" height="${CRIMP - 13}" fill="#ffffff" opacity="0.2"></rect>`,
  ).join("");
  return `<rect x="0" y="${y}" width="${UNITS.w}" height="${CRIMP}" fill="#1a1c33"></rect>
    <rect x="0" y="${y}" width="${UNITS.w}" height="${CRIMP}" fill="url(#foil)" opacity="0.5"></rect>${ridges}
    <rect x="0" y="${y === 0 ? CRIMP - 1 : y}" width="${UNITS.w}" height="1" fill="#000000" opacity="0.55"></rect>`;
};

const defs = `<defs>
  <clipPath id="pouch"><path d="${outline()}"></path></clipPath>
  <linearGradient id="foil" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#ffffff"></stop><stop offset="0.14" stop-color="${heart.glow}"></stop>
    <stop offset="0.3" stop-color="${heart.bright}"></stop><stop offset="0.44" stop-color="#ffffff"></stop>
    <stop offset="0.56" stop-color="#b7f0e2"></stop><stop offset="0.7" stop-color="${wit.bright}"></stop>
    <stop offset="0.86" stop-color="${power.bright}"></stop><stop offset="1" stop-color="#ffffff"></stop>
  </linearGradient>
  <linearGradient id="body" x1="0" y1="0" x2="0.35" y2="1">
    <stop offset="0" stop-color="#23264a"></stop><stop offset="0.55" stop-color="#14162b"></stop><stop offset="1" stop-color="${INK}"></stop>
  </linearGradient>
  <radialGradient id="halo" cx="0.5" cy="0.5" r="0.5">
    <stop offset="0" stop-color="#ffffff" stop-opacity="0.34"></stop><stop offset="0.5" stop-color="${wit.bright}" stop-opacity="0.2"></stop>
    <stop offset="1" stop-color="${wit.bright}" stop-opacity="0"></stop>
  </radialGradient>
  <linearGradient id="sheen" x1="0" y1="1" x2="1" y2="0">
    <stop offset="0.3" stop-color="#ffffff" stop-opacity="0"></stop><stop offset="0.46" stop-color="#ffffff" stop-opacity="0.2"></stop>
    <stop offset="0.6" stop-color="#ffffff" stop-opacity="0"></stop>
  </linearGradient>
  <linearGradient id="shade" x1="0" y1="0" x2="1" y2="0">
    <stop offset="0" stop-color="#000000" stop-opacity="0.34"></stop><stop offset="0.12" stop-color="#000000" stop-opacity="0"></stop>
    <stop offset="0.88" stop-color="#000000" stop-opacity="0"></stop><stop offset="1" stop-color="#000000" stop-opacity="0.34"></stop>
  </linearGradient>
</defs>`;

const svg = (body: string): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${UNITS.w} ${UNITS.h}" font-family="Archivo, sans-serif">${defs}<g clip-path="url(#pouch)">${body}</g></svg>`;

/** Foil stripes fanned across the pouch, the cards' own prism at pack size. */
const stripes = Array.from({ length: 9 }, (_, index) => {
  const x = -140 + index * 62;
  return `<polygon points="${x},${UNITS.h} ${x + 26},${UNITS.h} ${x + 236},0 ${x + 210},0" fill="url(#foil)" opacity="${0.05 + (index % 3) * 0.035}"></polygon>`;
}).join("");

const sparkles = [
  [38, 72, 1.6], [262, 96, 1.3], [226, 52, 1], [52, 322, 1.2], [250, 344, 1.6], [150, 60, 0.9], [28, 204, 1], [274, 236, 1.1],
]
  .map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="#ffffff" opacity="0.85"></circle>`)
  .join("");

/** The three types as a wheel: each beats the next one round. */
const wheel = (cx: number, cy: number, radius: number): string => {
  const orbs = [power, wit, heart].map((palette, index) => {
    const angle = -Math.PI / 2 + (index * 2 * Math.PI) / 3;
    const x = cx + Math.cos(angle) * radius;
    const y = cy + Math.sin(angle) * radius;
    return `<circle cx="${x}" cy="${y}" r="25" fill="${palette.deeper}"></circle>
      <circle cx="${x}" cy="${y}" r="21" fill="${palette.main}"></circle>
      <circle cx="${x - 6}" cy="${y - 7}" r="8" fill="${palette.glow}" opacity="0.55"></circle>
      <text x="${x}" y="${y + 6}" text-anchor="middle" font-size="17" font-weight="800" font-style="italic" fill="#ffffff">${"PWH"[index]}</text>`;
  });
  return `<circle cx="${cx}" cy="${cy}" r="${radius + 44}" fill="url(#halo)"></circle>
    <circle cx="${cx}" cy="${cy}" r="${radius}" fill="none" stroke="url(#foil)" stroke-width="2.5" opacity="0.8"></circle>${orbs.join("")}`;
};

const base = `<rect width="${UNITS.w}" height="${UNITS.h}" fill="url(#body)"></rect>${stripes}`;
const finish = `${crimp(0)}${crimp(UNITS.h - CRIMP)}<rect width="${UNITS.w}" height="${UNITS.h}" fill="url(#sheen)"></rect>
  <rect width="${UNITS.w}" height="${UNITS.h}" fill="url(#shade)"></rect>`;

const FRONT = svg(`${base}${sparkles}
  <text x="150" y="98" text-anchor="middle" font-size="46" font-weight="800" font-style="italic" letter-spacing="-1.5" fill="#ffffff">Finicards</text>
  <rect x="50" y="110" width="200" height="3" rx="1.5" fill="url(#foil)"></rect>
  <text x="150" y="132" text-anchor="middle" font-size="10.5" font-weight="700" letter-spacing="3.4" fill="#ffffff" opacity="0.72">A DISCORD CARD GAME</text>
  ${wheel(150, 238, 50)}
  <g transform="rotate(-9 244 152)"><rect x="216" y="138" width="56" height="28" rx="14" fill="url(#foil)"></rect>
    <text x="244" y="158" text-anchor="middle" font-size="17" font-weight="800" font-style="italic" fill="${INK}">V2</text></g>
  <rect x="42" y="352" width="216" height="40" rx="20" fill="#ffffff" opacity="0.96"></rect>
  <text x="150" y="378" text-anchor="middle" font-size="15" font-weight="800" letter-spacing="1.6" fill="${INK}">5 CARD BOOSTER</text>
  <text x="150" y="414" text-anchor="middle" font-size="8" font-weight="700" letter-spacing="2.2" fill="#ffffff" opacity="0.5">POWER ▸ WIT ▸ HEART</text>
  ${finish}`);

/** Half the width of the fin that runs down the back, where the pack splits. */
const SEAM = 7;

const BACK = svg(`${base}
  <text x="76" y="150" text-anchor="middle" font-size="9" font-weight="700" letter-spacing="2" fill="#ffffff" opacity="0.5">FINICARDS</text>
  <text x="224" y="150" text-anchor="middle" font-size="9" font-weight="700" letter-spacing="2" fill="#ffffff" opacity="0.5">VERSION 2</text>
  <text x="76" y="300" text-anchor="middle" font-size="8" font-weight="700" letter-spacing="1.6" fill="#ffffff" opacity="0.38">5 CARDS INSIDE</text>
  <text x="224" y="300" text-anchor="middle" font-size="8" font-weight="700" letter-spacing="1.6" fill="#ffffff" opacity="0.38">TEAR HERE</text>
  <rect x="${150 - SEAM}" y="0" width="${SEAM * 2}" height="${UNITS.h}" fill="#1a1c33"></rect>
  <rect x="${150 - SEAM}" y="0" width="${SEAM * 2}" height="${UNITS.h}" fill="url(#foil)" opacity="0.42"></rect>
  <rect x="${150 - SEAM}" y="0" width="1" height="${UNITS.h}" fill="#000000" opacity="0.6"></rect>
  <rect x="${150 + SEAM - 1}" y="0" width="1" height="${UNITS.h}" fill="#ffffff" opacity="0.35"></rect>
  <rect x="149.5" y="0" width="1" height="${UNITS.h}" fill="#000000" opacity="0.5"></rect>
  ${finish}`);

const drawn = (source: string, width: number): Promise<Buffer> =>
  sharp(Buffer.from(source), { density: 300 }).resize({ width }).png().toBuffer();

/* --------------------------------------------------------------- opening --- */

const PACK = { w: 280, h: Math.round((280 * UNITS.h) / UNITS.w) };
const CANVAS = { w: 400, h: 520 };
/** Discord's own dark background, which a GIF's hard edges sit best on. */
const BACKDROP = { r: 26, g: 27, b: 30, alpha: 1 };
const CLEAR = { r: 0, g: 0, b: 0, alpha: 0 };

const ease = (t: number): number => t * t * (3 - 2 * t);
const clamp = (t: number): number => Math.min(1, Math.max(0, t));
/** Where `t` is between `from` and `to`, as 0 to 1. */
const span = (t: number, from: number, to: number): number => clamp((t - from) / (to - from));

/** When each part of the opening happens, as fractions of its length. */
const BEAT = { flip: [0.08, 0.36], zip: [0.44, 0.8], fade: [0.76, 1] } as const;

/** How far each side of the seam is pulled from it, at the top, fully open. */
const GAP = 78;

/** Light out of the seam: it follows the opening down, then fills the frame. */
const light = (t: number): string => {
  const fade = 1 - ease(span(t, ...BEAT.fade));
  const open = ease(span(t, ...BEAT.zip));
  const burst = ease(span(t, BEAT.fade[0] - 0.08, BEAT.fade[0] + 0.08));
  const glow = Math.min(1, open * 1.6) * fade;
  const cx = CANVAS.w / 2;
  const top = (CANVAS.h - PACK.h) / 2;
  const reach = PACK.h * open;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${CANVAS.w}" height="${CANVAS.h}"><defs>
    <radialGradient id="l"><stop offset="0" stop-color="#ffffff" stop-opacity="${glow}"></stop>
      <stop offset="0.45" stop-color="${wit.glow}" stop-opacity="${0.9 * glow}"></stop>
      <stop offset="0.8" stop-color="${heart.bright}" stop-opacity="${0.4 * glow}"></stop>
      <stop offset="1" stop-color="${heart.bright}" stop-opacity="0"></stop></radialGradient></defs>
    <ellipse cx="${cx}" cy="${top + reach / 2 - 20 * (1 - open)}" rx="${24 + (GAP + 30) * open + 150 * burst}" ry="${40 + reach * 0.62 + 140 * burst}" fill="url(#l)"></ellipse></svg>`;
};

/**
 * The pack's back, unzipped down its seam as far as `open` (0 to 1) of its
 * height. Above that point each row's two halves are drawn apart, further the
 * higher up they are, so the gap is a V with its point at the zip. `spread`
 * then pulls the whole of both halves apart, for when it has come right open.
 */
const unzipped = (back: Buffer, open: number, spread: number): Buffer => {
  const width = PACK.w + 2 * (GAP + 60);
  const out = Buffer.alloc(width * PACK.h * 4);
  const half = PACK.w / 2;
  const margin = (width - PACK.w) / 2;
  const zip = open * PACK.h;

  for (let y = 0; y < PACK.h; y++) {
    const above = Math.max(0, zip - y) / PACK.h;
    // Eased at the point of the V, so the foil curls open rather than creases.
    const pull = Math.round(GAP * Math.pow(above, 0.7) + 60 * spread);
    const row = y * PACK.w * 4;
    const to = y * width * 4;
    back.copy(out, to + (margin - pull) * 4, row, row + half * 4);
    back.copy(out, to + (margin + half + pull) * 4, row + half * 4, row + PACK.w * 4);
  }

  return out;
};

const drawOpening = async (front: Buffer, back: Buffer): Promise<Buffer> => {
  const backPixels = await sharp(back).ensureAlpha().raw().toBuffer();
  const unzippedWidth = PACK.w + 2 * (GAP + 60);

  /** A piece of the pack, turned and faded, placed by where its centre goes. */
  const piece = async (input: Buffer, angle: number, opacity: number, cx: number, cy: number) => {
    const turned = await sharp(input)
      .rotate(angle, { background: CLEAR })
      .ensureAlpha()
      .linear([1, 1, 1, opacity], [0, 0, 0, 0])
      .png()
      .toBuffer();
    const meta = await sharp(turned).metadata();
    return { input: turned, left: Math.round(cx - (meta.width ?? 0) / 2), top: Math.round(cy - (meta.height ?? 0) / 2) };
  };

  const frames: Buffer[] = [];
  for (let index = 0; index < PACK_OPENING_FRAMES; index++) {
    const t = index / (PACK_OPENING_FRAMES - 1);
    const cx = CANVAS.w / 2;
    const cy = CANVAS.h / 2;
    const layers: sharp.OverlayOptions[] = [];

    const turn = ease(span(t, ...BEAT.flip));
    // The zip runs at a steady pace: it is a pull, not a swing.
    const zip = span(t, ...BEAT.zip);
    const fade = 1 - ease(span(t, ...BEAT.fade));

    if (zip === 0) {
      // Turning over: the pack narrows to its edge, and widens again as its back.
      const facing = Math.cos(turn * Math.PI);
      const width = Math.max(2, Math.round(PACK.w * Math.abs(facing)));
      const side = await sharp(facing >= 0 ? front : back)
        .resize(width, PACK.h, { fit: "fill" })
        // Darker as it turns away from the light.
        .modulate({ brightness: 0.55 + 0.45 * Math.abs(facing) })
        .png()
        .toBuffer();
      // A last shiver before it goes.
      const shiver = Math.sin(t * 90) * 1.6 * span(t, BEAT.flip[1], BEAT.zip[0]);
      layers.push(await piece(side, shiver, 1, cx, cy));
    } else {
      layers.push({ input: Buffer.from(light(t)), left: 0, top: 0 });
      if (fade > 0) {
        const opened = await sharp(unzipped(backPixels, zip, 1 - fade), {
          raw: { width: unzippedWidth, height: PACK.h, channels: 4 },
        })
          .extract({
            left: (unzippedWidth - CANVAS.w) / 2,
            top: 0,
            width: CANVAS.w,
            height: PACK.h,
          })
          .png()
          .toBuffer();
        layers.push(await piece(opened, 0, fade, cx, cy));
      }
    }

    frames.push(
      await sharp({ create: { width: CANVAS.w, height: CANVAS.h, channels: 4, background: BACKDROP } })
        .composite(layers)
        .raw()
        .toBuffer(),
    );
  }

  const encoder = new GifEncoder(CANVAS.w, CANVAS.h, "neuquant", false, PACK_OPENING_FRAMES);
  encoder.setDelay(PACK_OPENING_DELAY_MS);
  encoder.setRepeat(-1);
  encoder.setQuality(8);
  encoder.start();
  for (const frame of frames) encoder.addFrame(frame);
  encoder.finish();

  return sharp(encoder.out.getData(), { animated: true })
    .gif({ effort: 8, interFrameMaxError: 3, loop: 1 })
    .toBuffer();
};

/* ------------------------------------------------------------------- run --- */

await mkdir(path.dirname(PACK_COVER_FILE), { recursive: true });

const cover = await drawn(FRONT, 600);
await writeFile(PACK_COVER_FILE, cover);
console.log(`${PACK_COVER_FILE}  ${Math.round(cover.length / 1024)} KB`);

const opening = await drawOpening(await drawn(FRONT, PACK.w), await drawn(BACK, PACK.w));
await writeFile(PACK_OPENING_FILE, opening);
console.log(`${PACK_OPENING_FILE}  ${Math.round(opening.length / 1024)} KB`);

if (process.argv.includes("--back")) {
  const file = path.join(path.dirname(PACK_COVER_FILE), "..", "..", "..", "scripts", "test_images", "booster-pack-back.png");
  await writeFile(file, await drawn(BACK, 600));
  console.log(file);
}
