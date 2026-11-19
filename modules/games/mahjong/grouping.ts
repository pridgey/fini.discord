import { shanten, type Meld } from "./hand";
import {
  KIND_COUNT,
  kindOf,
  sortTiles,
  toCounts,
  type Kind,
  type Tile,
} from "./tiles";

/**
 * A hand read the way a teacher would point at it: these three are a finished
 * set, these two are the pair, these two need one more, this one is on its
 * own. It is the same search shanten makes, keeping the groups it found, so
 * the picture always agrees with the "tiles from ready" count.
 */

export type HandGroup =
  | { type: "set"; shape: "run" | "triplet"; tiles: Tile[] }
  | { type: "pair"; tiles: Tile[] }
  | { type: "partial"; tiles: Tile[]; needs: Kind[] }
  | { type: "loose"; tiles: Tile[] }
  | { type: "called"; meld: Meld };

export type Grouping = {
  groups: HandGroup[];
  /** "standard" is four sets and a pair; "pairs" is seven pairs. */
  mode: "standard" | "pairs";
  /** Finished sets, called ones included (standard), or pairs (pairs mode). */
  done: number;
  hasPair: boolean;
  shanten: number;
};

type Pick = {
  sets: [number, number][];
  partials: [number, number][];
  pair: number;
  loose: number[];
};

const needsFor = (a: number, b: number): Kind[] => {
  if (a === b) return [a];
  const suitStart = a - (a % 9);
  const inSuit = (k: number) => k >= suitStart && k < suitStart + 9;
  if (b - a === 1) return [a - 1, b + 1].filter(inSuit);
  return [a + 1];
};

export const groupHand = (concealed: Tile[], melds: Meld[]): Grouping => {
  const counts = toCounts(concealed);
  const meldCount = melds.length;
  const s = shanten(counts, meldCount);
  const pairsShanten =
    meldCount === 0
      ? shanten(counts, 0, { sevenPairs: true, orphans: false })
      : 99;
  const normal = shanten(counts, meldCount, {
    sevenPairs: false,
    orphans: false,
  });

  if (meldCount === 0 && pairsShanten < normal)
    return pairsGrouping(concealed, s);

  // Search: sets first, then partials and the pair, scored as shanten is.
  const c = [...counts];
  let best: Pick | null = null;
  let bestScore = -1;
  const sets: [number, number][] = [];
  const partials: [number, number][] = [];
  const loose: number[] = [];
  let pair = -1;

  const score = () => {
    const total = sets.length + meldCount;
    return (
      2 * total + Math.min(partials.length, 4 - total) + (pair >= 0 ? 1 : 0)
    );
  };
  const record = () => {
    const sc = score();
    const better =
      sc > bestScore ||
      (sc === bestScore &&
        best &&
        (sets.length > best.sets.length ||
          (sets.length === best.sets.length &&
            partials.length < best.partials.length)));
    if (better) {
      bestScore = sc;
      best = {
        sets: [...sets],
        partials: [...partials],
        pair,
        loose: [...loose],
      };
    }
  };

  const partialsFrom = (i: number) => {
    while (i < KIND_COUNT && c[i] === 0) i++;
    if (i === KIND_COUNT) return record();
    if (pair < 0 && c[i] >= 2) {
      c[i] -= 2;
      pair = i;
      partialsFrom(i);
      pair = -1;
      c[i] += 2;
    }
    if (c[i] >= 2) {
      c[i] -= 2;
      partials.push([i, i]);
      partialsFrom(i);
      partials.pop();
      c[i] += 2;
    }
    for (const gap of [1, 2]) {
      const j = i + gap;
      if (i < 27 && Math.floor(j / 9) === Math.floor(i / 9) && c[j] > 0) {
        (c[i]--, c[j]--);
        partials.push([i, j]);
        partialsFrom(i);
        partials.pop();
        (c[i]++, c[j]++);
      }
    }
    c[i]--;
    loose.push(i);
    partialsFrom(i);
    loose.pop();
    c[i]++;
  };

  const setsFrom = (i: number) => {
    while (i < KIND_COUNT && c[i] === 0) i++;
    if (i === KIND_COUNT) return partialsFrom(0);
    if (c[i] >= 3) {
      c[i] -= 3;
      sets.push([i, 0]);
      setsFrom(i);
      sets.pop();
      c[i] += 3;
    }
    if (i < 27 && i % 9 <= 6 && c[i + 1] > 0 && c[i + 2] > 0) {
      (c[i]--, c[i + 1]--, c[i + 2]--);
      sets.push([i, 1]);
      setsFrom(i);
      sets.pop();
      (c[i]++, c[i + 1]++, c[i + 2]++);
    }
    setsFrom(i + 1);
  };
  setsFrom(0);

  const pick = best as Pick | null;
  if (!pick)
    return {
      groups: melds.map((meld) => ({ type: "called", meld })),
      mode: "standard",
      done: meldCount,
      hasPair: false,
      shanten: s,
    };

  // Hand the kinds back as the actual tiles, so red fives stay red.
  const pool = sortTiles(concealed);
  const take = (k: Kind) => {
    const i = pool.findIndex((t) => kindOf(t) === k);
    return pool.splice(i, 1)[0];
  };
  const groups: HandGroup[] = [];
  for (const [k, isRun] of pick.sets) {
    const kinds = isRun ? [k, k + 1, k + 2] : [k, k, k];
    groups.push({
      type: "set",
      shape: isRun ? "run" : "triplet",
      tiles: kinds.map(take),
    });
  }
  if (pick.pair >= 0)
    groups.push({ type: "pair", tiles: [take(pick.pair), take(pick.pair)] });
  for (const [a, b] of pick.partials)
    groups.push({
      type: "partial",
      tiles: [take(a), take(b)],
      needs: needsFor(a, b),
    });
  if (pool.length) groups.push({ type: "loose", tiles: pool });
  for (const meld of melds) groups.push({ type: "called", meld });
  return {
    groups,
    mode: "standard",
    done: pick.sets.length + meldCount,
    hasPair: pick.pair >= 0,
    shanten: s,
  };
};

const pairsGrouping = (concealed: Tile[], s: number): Grouping => {
  const pool = sortTiles(concealed);
  const groups: HandGroup[] = [];
  const loose: Tile[] = [];
  const seen = new Set<Kind>();
  for (const t of pool) {
    const k = kindOf(t);
    if (seen.has(k)) continue;
    const same = pool.filter((x) => kindOf(x) === k);
    if (same.length >= 2) {
      seen.add(k);
      groups.push({ type: "pair", tiles: same.slice(0, 2) });
      loose.push(...same.slice(2));
    }
  }
  for (const t of pool) if (!seen.has(kindOf(t))) loose.push(t);
  if (loose.length) groups.push({ type: "loose", tiles: sortTiles(loose) });
  return {
    groups,
    mode: "pairs",
    done: groups.filter((g) => g.type === "pair").length,
    hasPair: true,
    shanten: s,
  };
};
