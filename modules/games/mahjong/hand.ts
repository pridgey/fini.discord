import {
  KIND_COUNT,
  ORPHANS,
  isHonor,
  kindOf,
  toCounts,
  type Kind,
  type Tile,
} from "./tiles";

/**
 * A hand's shape: the sets it is made of, how far it is from winning, and
 * which tiles would win it. Nothing here knows about a ruleset - Riichi and
 * Hong Kong agree on what a complete hand looks like and differ only on what
 * it is worth.
 */

/**
 * A called or declared set, laid face up (or, for a concealed kan, two up and
 * two down). `from` is the seat the claimed tile came from; a concealed kan
 * has none.
 */
export type Meld = {
  type: "chi" | "pon" | "kan";
  tiles: Tile[];
  /** False only for a concealed kan (ankan). */
  open: boolean;
  from?: number;
  /** The tile taken from another player's discard. */
  called?: Tile;
  /** A kan made by adding a fourth tile to a pon (shouminkan). */
  added?: boolean;
};

/** A set inside a decomposition: a run starting at `kind`, or a triplet of it. */
export type Group = { type: "chi" | "pon"; kind: Kind };

/** One way to read a standard hand: a pair and the concealed sets. */
export type Reading = { pair: Kind; groups: Group[] };

const canRun = (k: Kind) => k < 27 && k % 9 <= 6;

/**
 * Every way to split concealed tiles into one pair and some sets. The tiles
 * must number 3n+2. Readings are deduplicated - two orders of taking the same
 * sets are one reading.
 */
export const readings = (counts: number[]): Reading[] => {
  const total = counts.reduce((a, b) => a + b, 0);
  if (total % 3 !== 2) return [];
  const found = new Map<string, Reading>();
  const c = [...counts];
  const groups: Group[] = [];
  let pair = -1;

  const walk = (from: number) => {
    let i = from;
    while (i < KIND_COUNT && c[i] === 0) i++;
    if (i === KIND_COUNT) {
      if (pair < 0) return;
      const sorted = [...groups].sort(
        (a, b) => a.kind - b.kind || a.type.localeCompare(b.type),
      );
      const key = `${pair}|${sorted.map((g) => g.type[0] + g.kind).join(",")}`;
      if (!found.has(key)) found.set(key, { pair, groups: sorted });
      return;
    }
    if (pair < 0 && c[i] >= 2) {
      c[i] -= 2;
      pair = i;
      walk(i);
      pair = -1;
      c[i] += 2;
    }
    if (c[i] >= 3) {
      c[i] -= 3;
      groups.push({ type: "pon", kind: i });
      walk(i);
      groups.pop();
      c[i] += 3;
    }
    if (canRun(i) && c[i + 1] > 0 && c[i + 2] > 0) {
      c[i]--;
      c[i + 1]--;
      c[i + 2]--;
      groups.push({ type: "chi", kind: i });
      walk(i);
      groups.pop();
      c[i]++;
      c[i + 1]++;
      c[i + 2]++;
    }
  };
  walk(0);
  return [...found.values()];
};

/** Seven pairs: seven different kinds, two of each. Only a closed 14. */
export const isSevenPairs = (counts: number[]): boolean =>
  counts.reduce((a, b) => a + b, 0) === 14 &&
  counts.filter((n) => n === 2).length === 7;

/** Thirteen orphans: one of each terminal and honor, and one of them twice. */
export const isThirteenOrphans = (counts: number[]): boolean => {
  if (counts.reduce((a, b) => a + b, 0) !== 14) return false;
  let pair = false;
  for (const k of ORPHANS) {
    if (counts[k] === 0) return false;
    if (counts[k] === 2) pair = true;
  }
  return pair;
};

/** Whether concealed tiles plus `meldCount` declared sets make a winning shape. */
export const isComplete = (counts: number[], meldCount: number): boolean => {
  if (meldCount === 0 && (isSevenPairs(counts) || isThirteenOrphans(counts)))
    return true;
  return readings(counts).length > 0;
};

// ---------------------------------------------------------------------------
// Shanten: how many tiles a hand is from ready. 0 is ready (tenpai), -1 won.

/**
 * Each suit (and the honors) is searched on its own for every useful mix of
 * sets, partial sets and a pair; the four parts are then combined. Suits
 * repeat across hands, so each is cached by its nine counts.
 */
type PartOption = { sets: number; partials: number; pair: number };

const partCache = new Map<string, PartOption[]>();

const partOptions = (c: number[], runs: boolean): PartOption[] => {
  const key = (runs ? "s" : "h") + c.join("");
  const cached = partCache.get(key);
  if (cached) return cached;
  const found = new Map<string, PartOption>();
  const n = c.length;

  const walk = (i: number, sets: number, partials: number, pair: number) => {
    while (i < n && c[i] === 0) i++;
    if (i === n) {
      const k = `${sets},${partials},${pair}`;
      if (!found.has(k)) found.set(k, { sets, partials, pair });
      return;
    }
    if (c[i] >= 3) {
      c[i] -= 3;
      walk(i, sets + 1, partials, pair);
      c[i] += 3;
    }
    if (runs && i <= n - 3 && c[i + 1] > 0 && c[i + 2] > 0) {
      (c[i]--, c[i + 1]--, c[i + 2]--);
      walk(i, sets + 1, partials, pair);
      (c[i]++, c[i + 1]++, c[i + 2]++);
    }
    if (c[i] >= 2) {
      c[i] -= 2;
      if (!pair) walk(i, sets, partials, 1);
      walk(i, sets, partials + 1, pair);
      c[i] += 2;
    }
    if (runs && i <= n - 2 && c[i + 1] > 0) {
      (c[i]--, c[i + 1]--);
      walk(i, sets, partials + 1, pair);
      (c[i]++, c[i + 1]++);
    }
    if (runs && i <= n - 3 && c[i + 2] > 0) {
      (c[i]--, c[i + 2]--);
      walk(i, sets, partials + 1, pair);
      (c[i]++, c[i + 2]++);
    }
    // Leave one copy of this tile unused.
    c[i]--;
    walk(i, sets, partials, pair);
    c[i]++;
  };
  walk(0, 0, 0, 0);

  // Keep only options no other option beats on every count.
  const all = [...found.values()];
  const kept = all.filter(
    (a) =>
      !all.some(
        (b) =>
          b !== a &&
          b.sets >= a.sets &&
          b.partials >= a.partials &&
          b.pair >= a.pair &&
          (b.sets > a.sets || b.partials > a.partials || b.pair > a.pair),
      ),
  );
  if (partCache.size > 50000) partCache.clear();
  partCache.set(key, kept);
  return kept;
};

const normalShanten = (counts: number[], meldCount: number): number => {
  const parts = [
    partOptions(counts.slice(0, 9), true),
    partOptions(counts.slice(9, 18), true),
    partOptions(counts.slice(18, 27), true),
    partOptions(counts.slice(27, 34), false),
  ];
  let best = 8;
  const combine = (i: number, sets: number, partials: number, pair: number) => {
    if (i === parts.length) {
      const totalSets = Math.min(4, sets + meldCount);
      const usable = Math.min(partials, 4 - totalSets);
      const s = 8 - 2 * totalSets - usable - pair;
      if (s < best) best = s;
      return;
    }
    for (const o of parts[i]) {
      if (pair + o.pair > 1) continue;
      combine(i + 1, sets + o.sets, partials + o.partials, pair + o.pair);
    }
  };
  combine(0, 0, 0, 0);
  return best;
};

const sevenPairsShanten = (counts: number[]): number => {
  const pairs = counts.filter((n) => n >= 2).length;
  const kinds = counts.filter((n) => n >= 1).length;
  return 6 - pairs + Math.max(0, 7 - kinds);
};

const orphansShanten = (counts: number[]): number => {
  let kinds = 0;
  let pair = false;
  for (const k of ORPHANS) {
    if (counts[k] > 0) kinds++;
    if (counts[k] >= 2) pair = true;
  }
  return 13 - kinds - (pair ? 1 : 0);
};

export type ShantenOptions = { sevenPairs: boolean; orphans: boolean };

/**
 * Shanten of concealed tiles (13 or 14 less three per meld). With 14 tiles
 * it reads the hand as if the best tile were already discarded, so a won
 * hand is -1.
 */
export const shanten = (
  counts: number[],
  meldCount: number,
  options: ShantenOptions = { sevenPairs: true, orphans: true },
): number => {
  let best = normalShanten(counts, meldCount);
  if (meldCount === 0) {
    if (options.sevenPairs) best = Math.min(best, sevenPairsShanten(counts));
    if (options.orphans) best = Math.min(best, orphansShanten(counts));
  }
  return best;
};

export type HandShape = { concealed: Tile[]; melds: Meld[] };

/** Every tile the hand holds, concealed and in its melds. */
export const allTiles = (hand: HandShape): Tile[] => [
  ...hand.concealed,
  ...hand.melds.flatMap((m) => m.tiles),
];

/**
 * The kinds that would complete a ready hand of 3n+1 concealed tiles.
 * `live` drops any kind the player already holds all four of: they can never
 * draw or claim it, and a hand waiting only on such tiles is not ready
 * (karaten).
 */
export const waits = (
  hand: HandShape,
  options: ShantenOptions = { sevenPairs: true, orphans: true },
): { all: Kind[]; live: Kind[] } => {
  const counts = toCounts(hand.concealed);
  const held = toCounts(allTiles(hand));
  const all: Kind[] = [];
  for (let k = 0; k < KIND_COUNT; k++) {
    if (counts[k] >= 4) continue;
    counts[k]++;
    const meldCount = hand.melds.length;
    const done =
      readings(counts).length > 0 ||
      (meldCount === 0 &&
        ((options.sevenPairs && isSevenPairs(counts)) ||
          (options.orphans && isThirteenOrphans(counts))));
    counts[k]--;
    if (done) all.push(k);
  }
  return { all, live: all.filter((k) => held[k] < 4) };
};

/** How many of each kind are still unseen by a player, given what they can see. */
export const unseen = (visible: Tile[]): number[] => {
  const seen = toCounts(visible);
  return seen.map((n) => Math.max(0, 4 - n));
};

/**
 * For a hand of 3n+2 tiles: each discard that keeps the shanten lowest, with
 * the tiles that would then improve it and how many of those are left.
 * Bots choose by this, and the hints show it to new players.
 */
export type DiscardOption = {
  kind: Kind;
  shanten: number;
  /** Kinds that would lower the shanten after this discard. */
  improves: Kind[];
  /** Unseen copies of those kinds. */
  count: number;
};

export const discardOptions = (
  hand: HandShape,
  visible: Tile[],
  options: ShantenOptions = { sevenPairs: true, orphans: true },
): DiscardOption[] => {
  const counts = toCounts(hand.concealed);
  const left = unseen(visible);
  const meldCount = hand.melds.length;
  const result: DiscardOption[] = [];
  const orphans = new Set(ORPHANS);
  for (let d = 0; d < KIND_COUNT; d++) {
    if (counts[d] === 0) continue;
    counts[d]--;
    const s = shanten(counts, meldCount, options);
    const improves: Kind[] = [];
    let count = 0;
    // Only a tile next to (or the same as) one already held can help, apart
    // from the terminals and honors thirteen orphans wants.
    const near = (k: number) => {
      if (counts[k] > 0) return true;
      if (options.sevenPairs && meldCount === 0 && counts[k] > 0) return true;
      if (options.orphans && meldCount === 0 && orphans.has(k)) return true;
      if (k >= 27) return false;
      for (let delta = -2; delta <= 2; delta++) {
        const j = k + delta;
        if (
          delta &&
          j >= 0 &&
          Math.floor(j / 9) === Math.floor(k / 9) &&
          j < 27 &&
          counts[j] > 0
        )
          return true;
      }
      return false;
    };
    for (let k = 0; k < KIND_COUNT; k++) {
      if (k === d || counts[k] >= 4 || !near(k)) continue;
      counts[k]++;
      if (shanten(counts, meldCount, options) < s) {
        improves.push(k);
        count += left[k];
      }
      counts[k]--;
    }
    counts[d]++;
    result.push({ kind: d, shanten: s, improves, count });
  }
  return result.sort((a, b) => a.shanten - b.shanten || b.count - a.count);
};

/** Kinds in a concealed tile list, for quick membership checks. */
export const hasKind = (tiles: Tile[], kind: Kind) =>
  tiles.some((t) => !t.endsWith("f") && kindOf(t) === kind);

export const isHonorKind = isHonor;
