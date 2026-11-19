/**
 * Mahjong tiles, written the way the community writes them ("mpsz"):
 *
 *   1m-9m  characters (man)       0m  the red five of characters
 *   1p-9p  circles (pin)          0p  the red five of circles
 *   1s-9s  bamboo (sou)           0s  the red five of bamboo
 *   1z-4z  winds: East, South, West, North
 *   5z-7z  dragons: White, Green, Red
 *   1f-4f  flowers (Hong Kong only), 5f-8f seasons
 *
 * A tile in a hand is its string. Two tiles of the same kind are equal for
 * every rule except dora, where a red five is worth one more - so most code
 * works on `kindOf(tile)`, an index 0-33, and only scoring looks at red.
 */

export type Tile = string;

export const SUITS = ["m", "p", "s"] as const;
export type Suit = (typeof SUITS)[number];

/** Kind index: 0-8 characters, 9-17 circles, 18-26 bamboo, 27-33 honors. */
export type Kind = number;

export const KIND_COUNT = 34;
export const EAST = 27;
export const SOUTH = 28;
export const WEST = 29;
export const NORTH = 30;
export const WHITE = 31;
export const GREEN = 32;
export const RED = 33;

export const WINDS = [EAST, SOUTH, WEST, NORTH] as const;
export const DRAGONS = [WHITE, GREEN, RED] as const;

export const isBonus = (tile: Tile): boolean => tile.endsWith("f");

export const isRed = (tile: Tile): boolean => tile[0] === "0";

export const kindOf = (tile: Tile): Kind => {
  const suit = tile[1];
  const n = tile[0] === "0" ? 5 : Number(tile[0]);
  switch (suit) {
    case "m":
      return n - 1;
    case "p":
      return 9 + n - 1;
    case "s":
      return 18 + n - 1;
    case "z":
      return 27 + n - 1;
    default:
      throw new Error(`Not a playing tile: ${tile}`);
  }
};

/** The plain (never red) tile of a kind. */
export const tileOf = (kind: Kind): Tile => {
  if (kind < 27) return `${(kind % 9) + 1}${"mps"[Math.floor(kind / 9)]}`;
  return `${kind - 26}z`;
};

export const isHonor = (kind: Kind) => kind >= 27;
export const isWind = (kind: Kind) => kind >= 27 && kind <= 30;
export const isDragon = (kind: Kind) => kind >= 31;
export const numberOf = (kind: Kind) => (kind < 27 ? (kind % 9) + 1 : 0);
export const suitOf = (kind: Kind): Suit | "z" =>
  kind < 27 ? SUITS[Math.floor(kind / 9)] : "z";
export const isTerminal = (kind: Kind) =>
  kind < 27 && (kind % 9 === 0 || kind % 9 === 8);
/** Terminals and honors: the "yaochuu" tiles. */
export const isTerminalOrHonor = (kind: Kind) =>
  isHonor(kind) || isTerminal(kind);
export const isSimple = (kind: Kind) => !isTerminalOrHonor(kind);

/** The 13 kinds of thirteen orphans. */
export const ORPHANS: Kind[] = [
  0, 8, 9, 17, 18, 26, 27, 28, 29, 30, 31, 32, 33,
];

/**
 * The tile a dora indicator points at: the next in its suit, 9 wraps to 1,
 * North wraps to East, Red dragon wraps to White.
 */
export const doraFromIndicator = (indicator: Kind): Kind => {
  if (indicator < 27) {
    const base = indicator - (indicator % 9);
    return base + (((indicator % 9) + 1) % 9);
  }
  if (indicator <= NORTH) return EAST + ((indicator - EAST + 1) % 4);
  return WHITE + ((indicator - WHITE + 1) % 3);
};

/** Counts per kind. Bonus tiles are skipped. */
export const toCounts = (tiles: Tile[]): number[] => {
  const counts = new Array(KIND_COUNT).fill(0);
  for (const t of tiles) if (!isBonus(t)) counts[kindOf(t)]++;
  return counts;
};

/**
 * Reads "123m456p0s11z" into tiles - digits belong to the suit letter that
 * follows them. For tests and fixtures.
 */
export const parseTiles = (text: string): Tile[] => {
  const tiles: Tile[] = [];
  let digits: string[] = [];
  for (const ch of text.replace(/\s+/g, "")) {
    if (/[0-9]/.test(ch)) digits.push(ch);
    else if ("mpszf".includes(ch)) {
      for (const d of digits) tiles.push(`${d}${ch}`);
      digits = [];
    } else throw new Error(`Bad tile text: ${text}`);
  }
  if (digits.length) throw new Error(`Digits without a suit: ${text}`);
  return tiles;
};

/** Writes tiles compactly: ["1m","2m","5p"] -> "12m5p". Order is kept per suit run. */
export const formatTiles = (tiles: Tile[]): string => {
  let out = "";
  let run = "";
  let suit = "";
  for (const t of tiles) {
    if (t[1] !== suit && run) {
      out += run + suit;
      run = "";
    }
    suit = t[1];
    run += t[0];
  }
  return out + (run ? run + suit : "");
};

const SUIT_ORDER = { m: 0, p: 1, s: 2, z: 3, f: 4 } as Record<string, number>;

/** Hand order: suit, then number, with a red five sitting with its fives. */
export const sortTiles = (tiles: Tile[]): Tile[] =>
  [...tiles].sort((a, b) => {
    const s = SUIT_ORDER[a[1]] - SUIT_ORDER[b[1]];
    if (s) return s;
    const na = a[0] === "0" ? 5.5 : Number(a[0]);
    const nb = b[0] === "0" ? 5.5 : Number(b[0]);
    return na - nb;
  });

/** The full set: four of each kind, one five of each suit red if asked. */
export const fullSet = (options: {
  redFives: boolean;
  bonus: boolean;
}): Tile[] => {
  const tiles: Tile[] = [];
  for (let k = 0; k < KIND_COUNT; k++) {
    for (let i = 0; i < 4; i++) {
      const plain = tileOf(k);
      tiles.push(
        options.redFives && numberOf(k) === 5 && i === 0
          ? `0${plain[1]}`
          : plain,
      );
    }
  }
  if (options.bonus) for (let f = 1; f <= 8; f++) tiles.push(`${f}f`);
  return tiles;
};

const WIND_NAMES = ["East", "South", "West", "North"];
const DRAGON_NAMES = ["White Dragon", "Green Dragon", "Red Dragon"];
const SUIT_NAMES = { m: "Characters", p: "Circles", s: "Bamboo" } as Record<
  string,
  string
>;
const FLOWER_NAMES = [
  "Plum",
  "Orchid",
  "Chrysanthemum",
  "Bamboo flower",
  "Spring",
  "Summer",
  "Autumn",
  "Winter",
];

/** A tile's name for people: "5 Circles", "red 5 Bamboo", "East Wind". */
export const tileName = (tile: Tile): string => {
  if (isBonus(tile)) return FLOWER_NAMES[Number(tile[0]) - 1];
  const k = kindOf(tile);
  if (isWind(k)) return `${WIND_NAMES[k - EAST]} Wind`;
  if (isDragon(k)) return DRAGON_NAMES[k - WHITE];
  return `${isRed(tile) ? "red " : ""}${numberOf(k)} ${SUIT_NAMES[tile[1]]}`;
};

export const windName = (wind: number): string => WIND_NAMES[wind];
