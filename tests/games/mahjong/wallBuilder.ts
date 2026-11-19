import {
  fullSet,
  parseTiles,
  type Tile,
} from "../../../modules/games/mahjong/tiles";
import {
  newGame,
  type GameState,
  type Rules,
} from "../../../modules/games/mahjong/game";

/**
 * Stacks a wall for a test: the hands each seat is dealt (dealer first), the
 * tiles drawn in order, and for Riichi the dead wall. Everything else is
 * filled from what's left of the set, in a fixed order.
 */
export const stackWall = (opts: {
  rules?: Rules;
  hands: string[];
  draws?: string[];
  rinshan?: string;
  dora?: string;
  ura?: string;
}): Tile[] => {
  const rules = opts.rules ?? "riichi";
  const pool = fullSet({
    redFives: rules === "riichi",
    bonus: rules === "hongkong",
  });
  const take = (t: Tile): Tile => {
    const i = pool.indexOf(t);
    if (i < 0) throw new Error(`Wall has no ${t} left`);
    pool.splice(i, 1);
    return t;
  };
  const hands = opts.hands.map((h) => parseTiles(h).map(take));
  hands.forEach((h, i) => {
    if (h.length !== 13) throw new Error(`Hand ${i} has ${h.length} tiles`);
  });
  const draws = (opts.draws ?? []).flatMap((d) => parseTiles(d)).map(take);
  const dead: Tile[] = [];
  if (rules === "riichi") {
    const want = [...parseTiles(opts.rinshan ?? "").map(take)];
    const dora = parseTiles(opts.dora ?? "").map(take);
    const ura = parseTiles(opts.ura ?? "").map(take);
    // Fill each section of the dead wall from the end of the pool so the
    // live wall's filler stays predictable.
    const fill = (arr: Tile[], n: number) => {
      while (arr.length < n) arr.push(pool.splice(pool.length - 1, 1)[0]);
      return arr;
    };
    dead.push(...fill(want, 4), ...fill(dora, 5), ...fill(ura, 5));
  }
  const flowers = pool.filter((t) => t.endsWith("f"));
  const rest = pool.filter((t) => !t.endsWith("f"));
  // Flowers sit mid-wall: away from the first draws, and away from the back,
  // where replacement tiles come from.
  const mid = Math.floor(rest.length / 2);
  return [
    ...dead,
    ...hands.flat(),
    ...draws,
    ...rest.slice(0, mid),
    ...flowers,
    ...rest.slice(mid),
  ];
};

export const players = (bots = [false, true, true, true]) =>
  bots.map((bot, i) => ({ id: `p${i}`, name: `P${i}`, bot }));

export const tableWith = (opts: Parameters<typeof stackWall>[0]): GameState =>
  newGame(opts.rules ?? "riichi", players(), 1, { wall: stackWall(opts) });
