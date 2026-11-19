import { discardOptions, shanten, type DiscardOption } from "./hand";
import {
  claimOptions,
  roundWindKind,
  seatWind,
  turnOptions,
  type Claim,
  type GameState,
  type TurnMove,
} from "./game";
import {
  ORPHANS,
  doraFromIndicator,
  isHonor,
  isSimple,
  isTerminalOrHonor,
  kindOf,
  toCounts,
  type Kind,
  type Tile,
} from "./tiles";

/**
 * Fini's bots. They play a sound, simple game - the kind a decent beginner
 * plays - rather than a strong one:
 *
 * - Discard toward the hand with the most ways to improve (shanten, then
 *   tile acceptance), shedding lone honors and terminals first.
 * - Declare riichi whenever ready with a closed hand.
 * - Call only for a hand that can still win: a dragon or own-wind pung, or
 *   (Riichi) an all-simples hand, or (Hong Kong) a one-suit hand.
 * - Fold against a riichi when far from ready, discarding tiles the riichi
 *   player has already let go.
 * - Always take a legal win.
 */

/** Every tile a seat can see: its own hand and the table's open tiles. */
export const visibleTo = (s: GameState, seatIndex: number): Tile[] => {
  const seat = s.seats[seatIndex];
  return [
    ...seat.hand,
    ...s.seats.flatMap((x) => x.melds.flatMap((m) => m.tiles)),
    ...s.seats.flatMap((x) =>
      x.discards.filter((d) => d.calledBy === undefined).map((d) => d.tile),
    ),
    ...s.doraIndicators.slice(0, s.doraShown),
  ];
};

const valueKinds = (s: GameState, seatIndex: number): Kind[] => [
  31,
  32,
  33,
  seatWind(s, seatIndex),
  roundWindKind(s),
];

/**
 * Safety of discarding a kind against every riichi at the table: 3 for a
 * tile the riichi player already discarded, down to 0 for a live middle tile.
 */
const safety = (
  s: GameState,
  seatIndex: number,
  kind: Kind,
  visible: number[],
): number => {
  let worst = 3;
  s.seats.forEach((x, i) => {
    if (i === seatIndex || !x.riichi) return;
    const theirs = x.discards.map((d) => kindOf(d.tile));
    let safe = 0;
    if (theirs.includes(kind)) safe = 3;
    else if (isHonor(kind))
      safe = visible[kind] >= 3 ? 3 : visible[kind] >= 2 ? 2 : 1;
    else if (isTerminalOrHonor(kind)) safe = 1;
    else {
      // Suji: 4 discarded makes 1 and 7 safer, and so on.
      const n = kind % 9;
      const suji = [n - 3, n + 3]
        .filter((m) => m >= 0 && m <= 8)
        .map((m) => kind - n + m);
      safe = suji.length && suji.every((k) => theirs.includes(k)) ? 2 : 0;
    }
    worst = Math.min(worst, safe);
  });
  return worst;
};

/** Ranks two discards that keep the same shanten: more acceptance, then lose the loneliest tile. */
const tileValue = (s: GameState, seatIndex: number, kind: Kind): number => {
  let v = 0;
  if (valueKinds(s, seatIndex).includes(kind)) v += 1;
  if (isSimple(kind)) v += 1;
  const doraKinds = s.doraIndicators
    .slice(0, s.doraShown)
    .map((t) => doraFromIndicator(kindOf(t)));
  if (doraKinds.includes(kind)) v += 2;
  return v;
};

export const chooseTurn = (s: GameState, seatIndex: number): TurnMove => {
  const opts = turnOptions(s, seatIndex);
  if (!opts) throw new Error("Not this bot's turn");
  if (opts.tsumo) return { type: "tsumo" };
  const seat = s.seats[seatIndex];

  if (opts.nineTerminals) {
    const kinds = ORPHANS.filter((k) => toCounts(seat.hand)[k] > 0).length;
    if (kinds < 11) return { type: "nineTerminals" };
  }

  if (seat.riichi) return { type: "discard", tile: opts.discards[0] };

  const visible = visibleTo(s, seatIndex);
  const visibleCounts = toCounts(visible);
  const options = discardOptions(
    { concealed: seat.hand, melds: seat.melds },
    visible,
    { sevenPairs: true, orphans: s.rules === "riichi" },
  ).filter((o) => opts.discards.some((t) => kindOf(t) === o.kind));
  if (!options.length) return { type: "discard", tile: opts.discards[0] };

  const threatened = s.seats.some((x, i) => i !== seatIndex && x.riichi);
  const best = options[0];
  let pick: DiscardOption;
  if (threatened && best.shanten >= 1) {
    pick = [...options].sort(
      (a, b) =>
        safety(s, seatIndex, b.kind, visibleCounts) -
          safety(s, seatIndex, a.kind, visibleCounts) || a.shanten - b.shanten,
    )[0];
  } else {
    const tied = options.filter(
      (o) => o.shanten === best.shanten && o.count >= best.count * 0.85,
    );
    pick = tied.sort(
      (a, b) =>
        tileValue(s, seatIndex, a.kind) - tileValue(s, seatIndex, b.kind) ||
        b.count - a.count,
    )[0];
  }

  const tile = tileFor(opts.discards, pick.kind, s.rules === "riichi");
  if (pick.shanten === 0 && opts.riichi.includes(tile) && pick.count > 0)
    return { type: "riichi", tile };
  return { type: "discard", tile };
};

/** The tile of a kind to discard, keeping a red five if there's a plain one. */
const tileFor = (tiles: Tile[], kind: Kind, keepRed: boolean): Tile => {
  const of = tiles.filter((t) => kindOf(t) === kind);
  if (keepRed) return of.find((t) => t[0] !== "0") ?? of[0];
  return of[0];
};

/** Best shanten reachable after making a call and discarding. */
const shantenAfterCall = (
  hand: Tile[],
  used: Tile[],
  meldCount: number,
): number => {
  const rest = [...hand];
  for (const t of used) rest.splice(rest.indexOf(t), 1);
  const counts = toCounts(rest);
  let best = 99;
  for (let k = 0; k < counts.length; k++) {
    if (!counts[k]) continue;
    counts[k]--;
    best = Math.min(
      best,
      shanten(counts, meldCount + 1, { sevenPairs: false, orphans: false }),
    );
    counts[k]++;
  }
  return best;
};

export const chooseClaim = (s: GameState, seatIndex: number): Claim => {
  const opts = claimOptions(s, seatIndex);
  if (!opts || s.phase.kind !== "claims") return { type: "pass" };
  if (opts.ron) return { type: "ron" };
  const seat = s.seats[seatIndex];
  const tile = s.phase.tile;
  const kind = kindOf(tile);
  const counts = toCounts(seat.hand);
  const now = shanten(counts, seat.melds.length, {
    sevenPairs: false,
    orphans: false,
  });
  const values = valueKinds(s, seatIndex);

  // Is the hand headed somewhere that can win once open?
  const allTiles = [...seat.hand, ...seat.melds.flatMap((m) => m.tiles)];
  const kinds = allTiles.map(kindOf);
  const hasValueMeld = seat.melds.some(
    (m) => values.includes(kindOf(m.tiles[0])) && m.type !== "chi",
  );
  const holdsValuePair = values.some((v) => counts[v] >= 2);
  const simples = kinds.filter((k) => isSimple(k)).length;
  const suitCounts = [0, 1, 2].map(
    (su) => kinds.filter((k) => k < 27 && Math.floor(k / 9) === su).length,
  );
  const honors = kinds.filter(isHonor).length;
  const flushy = Math.max(...suitCounts) + honors >= allTiles.length - 2;
  const tanyaoish = simples >= allTiles.length - 1 && isSimple(kind);
  const threatened = s.seats.some((x, i) => i !== seatIndex && x.riichi);
  if (threatened && now >= 2) return { type: "pass" };

  const worthOpening =
    s.rules === "riichi"
      ? hasValueMeld || holdsValuePair || tanyaoish || flushy
      : hasValueMeld || flushy || (holdsValuePair && seat.melds.length < 2);

  if (opts.pon && values.includes(kind)) {
    // A value pung is always worth taking.
    return { type: "pon" };
  }
  if (!worthOpening) return { type: "pass" };
  if (s.rules === "riichi" && tanyaoish && !isSimple(kind) && !hasValueMeld)
    return { type: "pass" };
  if (flushy && !hasValueMeld && !tanyaoish) {
    const mainSuit = suitCounts.indexOf(Math.max(...suitCounts));
    if (kind < 27 && Math.floor(kind / 9) !== mainSuit) return { type: "pass" };
  }

  if (opts.pon) {
    const used = seat.hand.filter((t) => kindOf(t) === kind).slice(0, 2);
    if (shantenAfterCall(seat.hand, used, seat.melds.length) < now)
      return { type: "pon" };
  }
  for (const pair of opts.chi) {
    if (shantenAfterCall(seat.hand, pair, seat.melds.length) < now)
      return { type: "chi", tiles: pair };
  }
  return { type: "pass" };
};
