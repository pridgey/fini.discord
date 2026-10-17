import sharp, { type OverlayOptions } from "sharp";
import { USER_AGENT } from "./geocode";
import type { LatLon } from "./score";

/**
 * Draws a map with pins on it from OpenStreetMap's free tiles. The tile usage
 * policy asks for a User-Agent, caching, and no bulk downloads; a map is a
 * dozen tiles and each is kept in memory once fetched.
 * https://operations.osmfoundation.org/policies/tiles/
 */

const TILE_URL = "https://tile.openstreetmap.org";
const TILE = 256;
const MAX_CACHED_TILES = 400;
const SEA = "#aad3df";

export type Pin = LatLon & { color: string; label?: string };

const tiles = new Map<string, Promise<Buffer | null>>();

const tile = (z: number, x: number, y: number): Promise<Buffer | null> => {
  const key = `${z}/${x}/${y}`;
  const kept = tiles.get(key);
  if (kept) return kept;
  if (tiles.size >= MAX_CACHED_TILES) tiles.delete(tiles.keys().next().value!);

  const fetching = fetch(`${TILE_URL}/${key}.png`, {
    headers: { "User-Agent": USER_AGENT },
    signal: AbortSignal.timeout(10_000),
  })
    .then(async (response) => (response.ok ? Buffer.from(await response.arrayBuffer()) : null))
    .catch(() => null);
  // A failed tile is tried again next time rather than kept as a hole.
  fetching.then((buffer) => buffer || tiles.delete(key));
  tiles.set(key, fetching);
  return fetching;
};

/** Web Mercator: a point's position in pixels on the whole world at zoom `z`. */
export const project = ({ lat, lon }: LatLon, z: number) => {
  const size = TILE * 2 ** z;
  const clamped = Math.max(-85.0511, Math.min(85.0511, lat));
  const sin = Math.sin((clamped * Math.PI) / 180);
  return {
    x: ((lon + 180) / 360) * size,
    y: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * size,
  };
};

/**
 * Pins are moved a whole turn of longitude where that brings them closer to
 * the first, so a guess in Alaska and an answer in Siberia sit side by side
 * instead of at opposite ends of the map.
 */
const unwrap = (pins: Pin[]): Pin[] =>
  pins.map((pin) => {
    const delta = pin.lon - pins[0].lon;
    return delta > 180 ? { ...pin, lon: pin.lon - 360 } : delta < -180 ? { ...pin, lon: pin.lon + 360 } : pin;
  });

/** The closest zoom that fits every pin with room to spare, within [min, max]. */
export const fitZoom = (
  pins: LatLon[],
  width: number,
  height: number,
  { min = 1, max = 14 } = {},
): number => {
  for (let z = max; z > min; z--) {
    const points = pins.map((pin) => project(pin, z));
    const spanX = Math.max(...points.map((p) => p.x)) - Math.min(...points.map((p) => p.x));
    const spanY = Math.max(...points.map((p) => p.y)) - Math.min(...points.map((p) => p.y));
    if (spanX <= width * 0.7 && spanY <= height * 0.7) return z;
  }
  return min;
};

const escapeXml = (text: string) =>
  text.replace(/[<>&"']/g, (c) => `&#${c.charCodeAt(0)};`);

const pinSvg = (x: number, y: number, pin: Pin) => `
  <g transform="translate(${x.toFixed(1)} ${y.toFixed(1)})">
    <path d="M0 0 C -5 -10 -13 -16 -13 -25 A 13 13 0 1 1 13 -25 C 13 -16 5 -10 0 0 Z"
      fill="${pin.color}" stroke="#ffffff" stroke-width="2.5"/>
    <circle cx="0" cy="-25" r="5" fill="#ffffff"/>
    ${
      pin.label
        ? `<text x="0" y="-46" text-anchor="middle" font-family="sans-serif" font-size="17"
            font-weight="700" fill="#1b1b1b" stroke="#ffffff" stroke-width="4"
            paint-order="stroke">${escapeXml(pin.label)}</text>`
        : ""
    }
  </g>`;

/**
 * A PNG map showing every pin, later pins drawn over earlier ones. With one
 * pin it is centred there at `zoom`; with several it fits them all. A dashed
 * line joins a guess to its answer when there are exactly two.
 */
export const renderMap = async (
  pins: Pin[],
  {
    width = 800,
    height = 480,
    zoom,
    line: joined = pins.length === 2,
  }: { width?: number; height?: number; zoom?: number; line?: boolean } = {},
): Promise<Buffer> => {
  const placed = unwrap(pins);
  const z = zoom ?? (placed.length > 1 ? fitZoom(placed, width, height) : 5);
  const points = placed.map((pin) => project(pin, z));
  const centre = {
    x: (Math.min(...points.map((p) => p.x)) + Math.max(...points.map((p) => p.x))) / 2,
    y: (Math.min(...points.map((p) => p.y)) + Math.max(...points.map((p) => p.y))) / 2,
  };
  const left = centre.x - width / 2;
  const top = centre.y - height / 2;

  // The tiles under the view, laid on a canvas aligned to the tile grid and
  // then cut down to the view - sharp cannot place images off the canvas.
  const count = 2 ** z;
  const firstX = Math.floor(left / TILE);
  const firstY = Math.floor(top / TILE);
  const lastX = Math.floor((left + width - 1) / TILE);
  const lastY = Math.floor((top + height - 1) / TILE);

  const layers: OverlayOptions[] = [];
  await Promise.all(
    Array.from({ length: lastX - firstX + 1 }, (_, i) => firstX + i).flatMap((x) =>
      Array.from({ length: lastY - firstY + 1 }, (_, j) => firstY + j).map(async (y) => {
        if (y < 0 || y >= count) return;
        const image = await tile(z, ((x % count) + count) % count, y);
        if (image) {
          layers.push({ input: image, left: (x - firstX) * TILE, top: (y - firstY) * TILE });
        }
      }),
    ),
  );

  const grid = await sharp({
    create: {
      width: (lastX - firstX + 1) * TILE,
      height: (lastY - firstY + 1) * TILE,
      channels: 4,
      background: SEA,
    },
  })
    .composite(layers)
    .png()
    .toBuffer();

  const view = sharp(grid).extract({
    left: Math.round(left - firstX * TILE),
    top: Math.round(top - firstY * TILE),
    width,
    height,
  });

  const onView = points.map((p) => ({ x: p.x - left, y: p.y - top }));
  const line =
    joined && onView.length > 1
      ? `<line x1="${onView[0].x.toFixed(1)}" y1="${onView[0].y.toFixed(1)}"
          x2="${onView[1].x.toFixed(1)}" y2="${onView[1].y.toFixed(1)}"
          stroke="#1b1b1b" stroke-width="3" stroke-dasharray="10 7" opacity="0.75"/>`
      : "";
  const overlay = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
    ${line}
    ${placed.map((pin, i) => pinSvg(onView[i].x, onView[i].y, pin)).join("")}
    <rect x="${width - 200}" y="${height - 20}" width="200" height="20" fill="#ffffff" opacity="0.8"/>
    <text x="${width - 6}" y="${height - 6}" text-anchor="end" font-family="sans-serif"
      font-size="12" fill="#333333">© OpenStreetMap contributors</text>
  </svg>`;

  return sharp(await view.png().toBuffer())
    .composite([{ input: Buffer.from(overlay) }])
    .png()
    .toBuffer();
};
