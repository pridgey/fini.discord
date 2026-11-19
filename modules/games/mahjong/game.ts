import { allTiles, isComplete, readings, waits, type Meld } from "./hand";
import {
  HK_MIN_FAAN,
  hkPayment,
  scoreHongKong,
  type HkScore,
} from "./hongkong";
import {
  isNagashi,
  nineTerminals,
  scoreRiichi,
  settleRiichi,
  paymentFor,
  type RiichiScore,
} from "./riichi";
import {
  WINDS,
  fullSet,
  isBonus,
  isWind,
  kindOf,
  sortTiles,
  toCounts,
  type Kind,
  type Tile,
} from "./tiles";

/**
 * One table of mahjong as plain data, and the moves that change it.
 *
 * Every function here is pure: it takes a state and returns a new one, so a
 * game can be saved as a row, replayed in tests, and never half-applied. The
 * Discord layer decides who may press what; this file decides what a move
 * does and refuses moves the rules don't allow.
 *
 * The flow of a hand:
 *
 *   turn ──discard──▶ claims ──all pass──▶ next seat's turn (draws)
 *     │                 │
 *     │                 ├─ron──▶ handOver
 *     │                 └─pon/chi/kan──▶ caller's turn (no draw)
 *     ├─tsumo──▶ handOver
 *     └─kan──▶ (chankan window if added) ──▶ same seat draws a replacement
 *
 * A claims window only opens when someone can actually claim; otherwise play
 * moves straight on.
 */

export type Rules = "riichi" | "hongkong";

export type Discard = {
  tile: Tile;
  /** Seat that claimed it; it stays in the river for furiten but is shown as taken. */
  calledBy?: number;
  /** The tile turned sideways to declare riichi. */
  riichi?: boolean;
  /** Discarded straight from the draw. */
  tsumogiri?: boolean;
};

export type Seat = {
  id: string;
  name: string;
  bot: boolean;
  points: number;
  hand: Tile[];
  melds: Meld[];
  discards: Discard[];
  flowers: Tile[];
  riichi: null | { double: boolean; ippatsu: boolean };
  /** Passed a winning tile after riichi: no ron for the rest of the hand. */
  riichiFuriten: boolean;
  /** Passed a winning tile: no ron until this seat's next discard. */
  tempFuriten: boolean;
  /** Kinds this seat may not discard right after a call (kuikae). */
  kuikae: Kind[];
};

export type TurnSource = "wall" | "replacement" | "call";

export type ClaimOptions = {
  ron: boolean;
  pon: boolean;
  kan: boolean;
  /** Each pair of hand tiles that could make a chi with the discard. */
  chi: Tile[][];
};

export type Claim =
  | { type: "ron" }
  | { type: "pon" }
  | { type: "kan" }
  | { type: "chi"; tiles: Tile[] }
  | { type: "pass" };

export type Phase =
  | { kind: "turn"; seat: number; drawn: Tile | null; source: TurnSource }
  | {
      kind: "claims";
      discarder: number;
      tile: Tile;
      /** A tile added to a pon (robbable) rather than a discard. */
      robbing?: boolean;
      options: Record<number, ClaimOptions>;
      responses: Record<number, Claim>;
    }
  | { kind: "handOver"; result: HandResult }
  | { kind: "gameOver"; result: HandResult | null; final: FinalStanding[] };

export type WinDetail = {
  seat: number;
  /** Seat that dealt in, or null for self-draw. */
  from: number | null;
  tile: Tile;
  hand: Tile[];
  melds: Meld[];
  riichi?: RiichiScore;
  hongkong?: HkScore;
  /** Points this win moved, after honba and sticks. */
  gained: number;
};

export type DrawKind =
  | "exhaustive"
  | "nineTerminals"
  | "fourWinds"
  | "fourRiichi"
  | "fourKans"
  | "tripleRon";

export type HandResult =
  | { type: "win"; wins: WinDetail[]; deltas: number[]; uraIndicators: Tile[] }
  | {
      type: "draw";
      kind: DrawKind;
      tenpai: number[];
      nagashi: number[];
      deltas: number[];
      /** Who called the abortive draw, if anyone did. */
      by?: number;
    }
  | { type: "eightFlowers"; seat: number; deltas: number[] };

export type FinalStanding = { seat: number; points: number; rank: number };

export type GameEvent =
  | { type: "draw"; seat: number }
  | { type: "flower"; seat: number; tile: Tile }
  | { type: "discard"; seat: number; tile: Tile; riichi?: boolean }
  | { type: "call"; seat: number; meld: Meld }
  | { type: "kan"; seat: number; meld: Meld }
  | { type: "dora"; tile: Tile };

export type GameState = {
  rules: Rules;
  /** "east" plays the East round only (extended into South if nobody reaches 30,000). */
  length: "east";
  seats: Seat[];
  /** 0 = East round, 1 = South. */
  roundWind: number;
  /** Seat index of the dealer. */
  dealer: number;
  /** How many hands of this round have passed the deal (0-3), for "East 2" style names. */
  handInRound: number;
  honba: number;
  /** Riichi sticks waiting on the table. */
  sticks: number;
  wall: Tile[];
  /** Riichi only: replacement tiles for kans. */
  rinshan: Tile[];
  doraIndicators: Tile[];
  uraIndicators: Tile[];
  /** Dora indicators revealed. */
  doraShown: number;
  /** An open kan's dora waits for that seat's discard. */
  pendingDora: number;
  kanSeats: number[];
  /** No call or kan yet, and the first go-around isn't over. */
  uninterrupted: boolean;
  phase: Phase;
  /** Bumped by every move, so a stale button can be refused. */
  step: number;
  seed: number;
  /** Recent events for the table message. */
  events: GameEvent[];
  /** True once the hand has gone into the South-round extension. */
  extended: boolean;
};

export const START_POINTS: Record<Rules, number> = {
  riichi: 25000,
  hongkong: 1000,
};
export const TARGET_POINTS = 30000;

// ---------------------------------------------------------------------------
// Randomness: a small seeded generator so a hand can be replayed.

const mulberry = (seed: number) => () => {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

export const shuffle = <T>(items: T[], seed: number): T[] => {
  const rand = mulberry(seed);
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

// ---------------------------------------------------------------------------
// Helpers

export const seatWind = (state: GameState, seat: number): Kind =>
  WINDS[(seat - state.dealer + 4) % 4];

export const roundWindKind = (state: GameState): Kind => WINDS[state.roundWind];

const clone = (s: GameState): GameState => structuredClone(s);

const removeTile = (hand: Tile[], tile: Tile): Tile[] => {
  const i = hand.indexOf(tile);
  if (i < 0) throw new RuleError(`No ${tile} in hand`);
  return [...hand.slice(0, i), ...hand.slice(i + 1)];
};

/** Removes `n` tiles of a kind, preferring plain fives over red ones unless asked. */
const takeKind = (
  hand: Tile[],
  kind: Kind,
  n: number,
): { hand: Tile[]; taken: Tile[] } => {
  const taken: Tile[] = [];
  let rest = [...hand];
  const ordered = rest
    .filter((t) => !isBonus(t) && kindOf(t) === kind)
    .sort((a, b) => (a[0] === "0" ? 1 : 0) - (b[0] === "0" ? 1 : 0));
  for (const t of ordered.slice(0, n)) {
    taken.push(t);
    rest = removeTile(rest, t);
  }
  if (taken.length < n) throw new RuleError("Not enough tiles");
  return { hand: rest, taken };
};

export class RuleError extends Error {}

const totalDiscards = (s: GameState) =>
  s.seats.reduce((n, seat) => n + seat.discards.length, 0);

const liveWall = (s: GameState) => s.wall.length;

const pushEvent = (s: GameState, e: GameEvent) => {
  s.events.push(e);
  if (s.events.length > 12) s.events.splice(0, s.events.length - 12);
};

// ---------------------------------------------------------------------------
// Starting a game and a hand

export type PlayerInfo = { id: string; name: string; bot: boolean };

export const newGame = (
  rules: Rules,
  players: PlayerInfo[],
  seed: number,
  preset?: { wall?: Tile[] },
): GameState => {
  if (players.length !== 4) throw new RuleError("A table needs four seats");
  const state: GameState = {
    rules,
    length: "east",
    seats: players.map((p) => ({
      ...p,
      points: START_POINTS[rules],
      hand: [],
      melds: [],
      discards: [],
      flowers: [],
      riichi: null,
      riichiFuriten: false,
      tempFuriten: false,
      kuikae: [],
    })),
    roundWind: 0,
    dealer: 0,
    handInRound: 0,
    honba: 0,
    sticks: 0,
    wall: [],
    rinshan: [],
    doraIndicators: [],
    uraIndicators: [],
    doraShown: 0,
    pendingDora: 0,
    kanSeats: [],
    uninterrupted: true,
    phase: { kind: "turn", seat: 0, drawn: null, source: "wall" },
    step: 0,
    seed,
    events: [],
    extended: false,
  };
  return dealHand(state, preset?.wall);
};

/**
 * Deals a hand. `presetWall` (tests) is the tile order: the first 14 are the
 * dead wall in Riichi, then the deal, then draws.
 */
export const dealHand = (prev: GameState, presetWall?: Tile[]): GameState => {
  const s = clone(prev);
  const tiles =
    presetWall ??
    shuffle(
      fullSet({
        redFives: s.rules === "riichi",
        bonus: s.rules === "hongkong",
      }),
      s.seed + s.step * 7919,
    );
  let wall = [...tiles];
  if (s.rules === "riichi") {
    const dead = wall.splice(0, 14);
    s.rinshan = dead.slice(0, 4);
    s.doraIndicators = dead.slice(4, 9);
    s.uraIndicators = dead.slice(9, 14);
    s.doraShown = 1;
  } else {
    s.rinshan = [];
    s.doraIndicators = [];
    s.uraIndicators = [];
    s.doraShown = 0;
  }
  for (const seat of s.seats) {
    seat.hand = [];
    seat.melds = [];
    seat.discards = [];
    seat.flowers = [];
    seat.riichi = null;
    seat.riichiFuriten = false;
    seat.tempFuriten = false;
    seat.kuikae = [];
  }
  for (let i = 0; i < 4; i++) {
    const seat = s.seats[(s.dealer + i) % 4];
    seat.hand = wall.splice(0, 13);
  }
  s.wall = wall;
  s.pendingDora = 0;
  s.kanSeats = [];
  s.uninterrupted = true;
  s.events = [];
  if (s.rules === "hongkong") {
    for (let i = 0; i < 4; i++) replaceFlowers(s, (s.dealer + i) % 4);
  }
  for (const seat of s.seats) seat.hand = sortTiles(seat.hand);
  s.step++;
  return drawFor(s, s.dealer, "wall");
};

/** Hong Kong: set aside every flower in a hand, drawing replacements from the back. */
const replaceFlowers = (s: GameState, seatIndex: number) => {
  const seat = s.seats[seatIndex];
  for (;;) {
    const flower = seat.hand.find(isBonus);
    if (!flower || s.wall.length === 0) return;
    seat.hand = removeTile(seat.hand, flower);
    seat.flowers.push(flower);
    pushEvent(s, { type: "flower", seat: seatIndex, tile: flower });
    seat.hand.push(s.wall.pop()!);
  }
};

/** Gives a seat its turn with a fresh tile. Mutates `s`. */
const drawFor = (
  s: GameState,
  seatIndex: number,
  source: "wall" | "replacement",
): GameState => {
  const seat = s.seats[seatIndex];
  let tile: Tile | undefined;
  if (source === "replacement" && s.rules === "riichi") {
    tile = s.rinshan.shift();
    // The dead wall stays at 14: it takes a tile from the live wall's end.
    const moved = s.wall.pop();
    if (moved) s.rinshan.push(moved);
  } else if (source === "replacement") {
    tile = s.wall.pop();
  } else {
    tile = s.wall.shift();
  }
  if (!tile) return exhaustiveDraw(s);
  let src: TurnSource = source;
  // Hong Kong flowers drawn mid-hand: set aside and replace from the back.
  while (isBonus(tile)) {
    seat.flowers.push(tile);
    pushEvent(s, { type: "flower", seat: seatIndex, tile });
    if (seat.flowers.length === 8) return eightFlowers(s, seatIndex);
    const next = s.wall.pop();
    if (!next) return exhaustiveDraw(s);
    tile = next;
    src = "replacement";
  }
  seat.hand.push(tile);
  pushEvent(s, { type: "draw", seat: seatIndex });
  s.phase = { kind: "turn", seat: seatIndex, drawn: tile, source: src };
  return s;
};

// ---------------------------------------------------------------------------
// What a seat may do

export type TurnOptions = {
  /** Distinct tiles that may be discarded. */
  discards: Tile[];
  /** Discards that declare riichi. */
  riichi: Tile[];
  tsumo: boolean;
  /** Kinds that can be made into a kan (closed or added). */
  kans: Kind[];
  nineTerminals: boolean;
};

const isFirstDraw = (s: GameState, seatIndex: number) =>
  s.uninterrupted && s.seats[seatIndex].discards.length === 0;

/** The score a self-draw would get now, or null if it isn't a legal win. */
export const tsumoScore = (s: GameState, seatIndex: number) => {
  const phase = s.phase;
  if (phase.kind !== "turn" || phase.seat !== seatIndex || !phase.drawn)
    return null;
  const seat = s.seats[seatIndex];
  if (!isComplete(toCounts(seat.hand), seat.melds.length)) return null;
  return scoreWin(s, seatIndex, phase.drawn, true, {
    lastTile: liveWall(s) === 0 && phase.source !== "replacement",
    replacement: phase.source === "replacement",
  });
};

type WinFlags = {
  lastTile?: boolean;
  replacement?: boolean;
  robbing?: boolean;
};

/** Scores a winning hand for this seat; returns null if it may not be declared. */
const scoreWin = (
  s: GameState,
  seatIndex: number,
  tile: Tile,
  tsumo: boolean,
  flags: WinFlags,
): { riichi?: RiichiScore; hongkong?: HkScore } | null => {
  const seat = s.seats[seatIndex];
  const concealed = tsumo ? seat.hand : [...seat.hand, tile];
  if (s.rules === "riichi") {
    const score = scoreRiichi({
      concealed,
      melds: seat.melds,
      winTile: tile,
      tsumo,
      seatWind: seatWind(s, seatIndex),
      roundWind: roundWindKind(s),
      riichi: !!seat.riichi && !seat.riichi.double,
      doubleRiichi: !!seat.riichi?.double,
      ippatsu: !!seat.riichi?.ippatsu,
      lastTile: flags.lastTile,
      rinshan: flags.replacement,
      chankan: flags.robbing,
      firstDraw: tsumo && isFirstDraw(s, seatIndex),
      doraIndicators: s.doraIndicators.slice(0, s.doraShown),
      uraIndicators: s.uraIndicators.slice(0, s.doraShown),
    });
    return score ? { riichi: score } : null;
  }
  const dealerFirstDiscard =
    !tsumo &&
    s.uninterrupted &&
    totalDiscards(s) === 1 &&
    s.seats[s.dealer].discards.length === 1;
  const score = scoreHongKong({
    concealed,
    melds: seat.melds,
    winTile: tile,
    tsumo,
    seatWind: seatWind(s, seatIndex),
    roundWind: roundWindKind(s),
    flowers: seat.flowers,
    lastTile: flags.lastTile,
    replacement: flags.replacement,
    robbingKong: flags.robbing,
    firstTurn: (tsumo && isFirstDraw(s, seatIndex)) || dealerFirstDiscard,
  });
  if (!score || score.total < HK_MIN_FAAN) return null;
  return { hongkong: score };
};

export const turnOptions = (
  s: GameState,
  seatIndex: number,
): TurnOptions | null => {
  const phase = s.phase;
  if (phase.kind !== "turn" || phase.seat !== seatIndex) return null;
  const seat = s.seats[seatIndex];
  const distinct = [...new Set(seat.hand)];

  let discards: Tile[];
  if (seat.riichi) discards = phase.drawn ? [phase.drawn] : distinct;
  else {
    discards = distinct.filter((t) => !seat.kuikae.includes(kindOf(t)));
    if (!discards.length) discards = distinct;
  }

  const riichi: Tile[] = [];
  const closed = seat.melds.every((m) => !m.open);
  if (
    s.rules === "riichi" &&
    !seat.riichi &&
    closed &&
    seat.points >= 1000 &&
    liveWall(s) >= 4 &&
    phase.drawn
  ) {
    for (const t of distinct) {
      const after = { concealed: removeTile(seat.hand, t), melds: seat.melds };
      if (waits(after).all.length > 0) riichi.push(t);
    }
  }

  const kans: Kind[] = [];
  const totalKans = s.seats.reduce(
    (n, x) => n + x.melds.filter((m) => m.type === "kan").length,
    0,
  );
  const canKan =
    totalKans < 4 &&
    liveWall(s) > 0 &&
    phase.drawn !== null &&
    (s.rules === "hongkong" || s.rinshan.length > 0);
  if (canKan) {
    const counts = toCounts(seat.hand);
    for (let k = 0; k < counts.length; k++) {
      if (counts[k] === 4) {
        if (!seat.riichi || riichiKanAllowed(seat, k, phase.drawn!))
          kans.push(k);
      }
    }
    if (!seat.riichi) {
      for (const m of seat.melds) {
        if (m.type === "pon" && counts[kindOf(m.tiles[0])] >= 1)
          kans.push(kindOf(m.tiles[0]));
      }
    }
  }

  return {
    discards: sortTiles(discards),
    riichi: sortTiles(riichi),
    tsumo: !!tsumoScore(s, seatIndex),
    kans,
    nineTerminals:
      s.rules === "riichi" &&
      isFirstDraw(s, seatIndex) &&
      phase.drawn !== null &&
      nineTerminals(seat.hand),
  };
};

/**
 * After riichi a closed kan is allowed only with the tile just drawn, and only
 * if it changes neither the waits nor how the hand reads.
 */
const riichiKanAllowed = (seat: Seat, kind: Kind, drawn: Tile): boolean => {
  if (kindOf(drawn) !== kind) return false;
  const before = removeTile(seat.hand, drawn);
  const w1 = waits({ concealed: before, melds: seat.melds }).all;
  const after = before.filter((t) => kindOf(t) !== kind);
  const w2 = waits({
    concealed: after,
    melds: [...seat.melds, { type: "kan", tiles: [], open: false }],
  }).all;
  if (w1.join() !== w2.join()) return false;
  // In every winning reading the three must be a triplet.
  for (const w of w1) {
    const counts = toCounts(before);
    counts[w]++;
    for (const r of readings(counts)) {
      if (!r.groups.some((g) => g.type === "pon" && g.kind === kind))
        return false;
    }
  }
  return true;
};

/** What a seat may claim from the tile in the claims window. */
const claimOptionsFor = (
  s: GameState,
  seatIndex: number,
  discarder: number,
  tile: Tile,
  robbing: boolean,
): ClaimOptions => {
  const seat = s.seats[seatIndex];
  const kind = kindOf(tile);
  const none: ClaimOptions = { ron: false, pon: false, kan: false, chi: [] };
  const ron = canRon(s, seatIndex, tile, robbing);
  if (robbing) return { ...none, ron };
  const last = liveWall(s) === 0;
  if (seat.riichi || last) return { ...none, ron };
  const counts = toCounts(seat.hand);
  const totalKans = s.seats.reduce(
    (n, x) => n + x.melds.filter((m) => m.type === "kan").length,
    0,
  );
  const pon = counts[kind] >= 2;
  const kan =
    counts[kind] >= 3 &&
    totalKans < 4 &&
    (s.rules === "hongkong" || s.rinshan.length > 0);
  const chi: Tile[][] = [];
  if ((discarder + 1) % 4 === seatIndex && kind < 27) {
    const n = kind % 9;
    const patterns = [
      [-2, -1],
      [-1, 1],
      [1, 2],
    ].filter(([a, b]) => n + a >= 0 && n + b <= 8);
    for (const [a, b] of patterns) {
      const firsts = [
        ...new Set(
          seat.hand.filter((t) => !isBonus(t) && kindOf(t) === kind + a),
        ),
      ];
      const seconds = [
        ...new Set(
          seat.hand.filter((t) => !isBonus(t) && kindOf(t) === kind + b),
        ),
      ];
      for (const x of firsts)
        for (const y of seconds) {
          // Make sure a discard would remain after kuikae.
          const left = removeTile(removeTile(seat.hand, x), y);
          const banned = chiKuikae(kind, kind + a, kind + b);
          if (
            s.rules === "riichi" &&
            left.every((t) => banned.includes(kindOf(t)))
          )
            continue;
          chi.push([x, y]);
        }
    }
  }
  return { ron, pon, kan, chi };
};

/** Kinds that may not be discarded after a chi: the called kind, and the other end of a two-sided shape. */
const chiKuikae = (called: Kind, a: Kind, b: Kind): Kind[] => {
  const banned = [called];
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  if (hi - lo === 1) {
    if (called === lo - 1 && (hi + 1) % 9 !== 0 && hi % 9 !== 8)
      banned.push(hi + 1);
    if (called === hi + 1 && lo % 9 !== 0) banned.push(lo - 1);
  }
  return banned;
};

/** Riichi furiten: any winning tile already in this seat's own discards. */
export const inFuriten = (s: GameState, seatIndex: number): boolean => {
  if (s.rules !== "riichi") return false;
  const seat = s.seats[seatIndex];
  if (seat.riichiFuriten || seat.tempFuriten) return true;
  const w = waits({ concealed: seat.hand, melds: seat.melds }).all;
  return seat.discards.some((d) => w.includes(kindOf(d.tile)));
};

const canRon = (
  s: GameState,
  seatIndex: number,
  tile: Tile,
  robbing: boolean,
): boolean => {
  const seat = s.seats[seatIndex];
  const counts = toCounts([...seat.hand, tile]);
  if (!isComplete(counts, seat.melds.length)) return false;
  if (inFuriten(s, seatIndex)) return false;
  return !!scoreWin(s, seatIndex, tile, false, {
    lastTile: liveWall(s) === 0 && !robbing,
    robbing,
  });
};

/** Whether a tile would complete this seat's hand (used for furiten). */
const completesHand = (s: GameState, seatIndex: number, tile: Tile) => {
  const seat = s.seats[seatIndex];
  return isComplete(toCounts([...seat.hand, tile]), seat.melds.length);
};

export const claimOptions = (
  s: GameState,
  seatIndex: number,
): ClaimOptions | null =>
  s.phase.kind === "claims" ? (s.phase.options[seatIndex] ?? null) : null;

// ---------------------------------------------------------------------------
// Moves on your own turn

export type TurnMove =
  | { type: "discard"; tile: Tile }
  | { type: "riichi"; tile: Tile }
  | { type: "tsumo" }
  | { type: "kan"; kind: Kind }
  | { type: "nineTerminals" };

export const playTurn = (
  prev: GameState,
  seatIndex: number,
  move: TurnMove,
): GameState => {
  const opts = turnOptions(prev, seatIndex);
  if (!opts) throw new RuleError("It isn't your turn");
  const s = clone(prev);
  s.step++;
  const phase = s.phase as Extract<Phase, { kind: "turn" }>;
  const seat = s.seats[seatIndex];

  switch (move.type) {
    case "tsumo": {
      if (!opts.tsumo) throw new RuleError("That isn't a winning hand");
      const score = tsumoScore(prev, seatIndex)!;
      return settleWin(s, [
        { seat: seatIndex, from: null, tile: phase.drawn!, ...score },
      ]);
    }
    case "nineTerminals": {
      if (!opts.nineTerminals)
        throw new RuleError(
          "You don't have nine different terminals and honors",
        );
      return abortiveDraw(s, "nineTerminals", seatIndex);
    }
    case "kan":
      if (!opts.kans.includes(move.kind))
        throw new RuleError("You can't make that kan");
      return declareKan(s, seatIndex, move.kind);
    case "discard":
    case "riichi": {
      const allowed = move.type === "riichi" ? opts.riichi : opts.discards;
      if (!allowed.includes(move.tile)) {
        throw new RuleError(
          move.type === "riichi"
            ? "You can't declare riichi with that discard"
            : seat.riichi
              ? "After riichi you must discard the tile you drew"
              : "You can't discard that tile right now",
        );
      }
      return discard(
        s,
        seatIndex,
        move.tile,
        move.type === "riichi",
        phase.drawn === move.tile,
      );
    }
  }
};

const revealPendingDora = (s: GameState) => {
  while (s.pendingDora > 0) {
    s.pendingDora--;
    s.doraShown = Math.min(5, s.doraShown + 1);
    pushEvent(s, { type: "dora", tile: s.doraIndicators[s.doraShown - 1] });
  }
};

const discard = (
  s: GameState,
  seatIndex: number,
  tile: Tile,
  declareRiichi: boolean,
  tsumogiri: boolean,
): GameState => {
  const seat = s.seats[seatIndex];
  seat.hand = sortTiles(removeTile(seat.hand, tile));
  const firstDiscard = seat.discards.length === 0;
  seat.discards.push({
    tile,
    riichi: declareRiichi || undefined,
    tsumogiri: tsumogiri || undefined,
  });
  seat.kuikae = [];
  seat.tempFuriten = false;
  if (seat.riichi) seat.riichi.ippatsu = false;
  if (declareRiichi) {
    // Stick goes down once the tile survives the claims window.
    seat.riichi = { double: firstDiscard && s.uninterrupted, ippatsu: true };
  }
  pushEvent(s, {
    type: "discard",
    seat: seatIndex,
    tile,
    riichi: declareRiichi || undefined,
  });
  revealPendingDora(s);
  return openClaims(s, seatIndex, tile, false);
};

/** After a discard (or an added kan), see who can claim it. */
const openClaims = (
  s: GameState,
  discarder: number,
  tile: Tile,
  robbing: boolean,
): GameState => {
  const options: Record<number, ClaimOptions> = {};
  for (let i = 1; i < 4; i++) {
    const seat = (discarder + i) % 4;
    const o = claimOptionsFor(s, seat, discarder, tile, robbing);
    if (o.ron || o.pon || o.kan || o.chi.length) options[seat] = o;
  }
  // Seats the tile would complete but who can't ron (furiten, no yaku) still
  // go into temporary furiten as it passes.
  if (s.rules === "riichi") {
    for (let i = 1; i < 4; i++) {
      const seat = (discarder + i) % 4;
      if (!options[seat]?.ron && completesHand(s, seat, tile))
        markPassedWin(s, seat);
    }
  }
  s.phase = {
    kind: "claims",
    discarder,
    tile,
    robbing: robbing || undefined,
    options,
    responses: {},
  };
  if (Object.keys(options).length === 0) return resolveClaims(s);
  return s;
};

const markPassedWin = (s: GameState, seatIndex: number) => {
  const seat = s.seats[seatIndex];
  if (seat.riichi) seat.riichiFuriten = true;
  else seat.tempFuriten = true;
};

// ---------------------------------------------------------------------------
// Claims

export const playClaim = (
  prev: GameState,
  seatIndex: number,
  claim: Claim,
): GameState => {
  const phase = prev.phase;
  if (phase.kind !== "claims")
    throw new RuleError("Nothing to claim right now");
  const opts = phase.options[seatIndex];
  if (!opts) throw new RuleError("You can't claim this tile");
  if (phase.responses[seatIndex])
    throw new RuleError("You've already answered");
  const ok =
    claim.type === "pass" ||
    (claim.type === "ron" && opts.ron) ||
    (claim.type === "pon" && opts.pon) ||
    (claim.type === "kan" && opts.kan) ||
    (claim.type === "chi" &&
      opts.chi.some(
        (c) => [...c].sort().join() === [...claim.tiles].sort().join(),
      ));
  if (!ok) throw new RuleError("You can't make that claim");
  const s = clone(prev);
  s.step++;
  const p = s.phase as Extract<Phase, { kind: "claims" }>;
  p.responses[seatIndex] = claim;
  if (claim.type !== "ron" && opts.ron && s.rules === "riichi")
    markPassedWin(s, seatIndex);
  // Resolve once everyone has answered, or once nobody still deciding could
  // make a claim that outranks the best one already made. Rons are equal, so
  // a second possible ron is always waited for (double ron).
  const pending = Object.keys(p.options)
    .map(Number)
    .filter((n) => !p.responses[n]);
  const best = Math.max(0, ...Object.values(p.responses).map(claimRank));
  const couldBeat = pending.some(
    (n) => optionRank(p.options[n]) >= best && optionRank(p.options[n]) > 0,
  );
  if (pending.length === 0 || (best > 0 && !couldBeat)) return resolveClaims(s);
  return s;
};

const claimRank = (c: Claim) =>
  c.type === "ron"
    ? 3
    : c.type === "pon" || c.type === "kan"
      ? 2
      : c.type === "chi"
        ? 1
        : 0;
const optionRank = (o: ClaimOptions) =>
  o.ron ? 3 : o.pon || o.kan ? 2 : o.chi.length ? 1 : 0;

/** Seats still to answer in the claims window. */
export const pendingClaims = (s: GameState): number[] => {
  if (s.phase.kind !== "claims") return [];
  const p = s.phase;
  return Object.keys(p.options)
    .map(Number)
    .filter((n) => !p.responses[n]);
};

const resolveClaims = (s: GameState): GameState => {
  const p = s.phase as Extract<Phase, { kind: "claims" }>;
  const order = [1, 2, 3].map((i) => (p.discarder + i) % 4);
  const rons = order.filter((seat) => p.responses[seat]?.type === "ron");

  if (rons.length) {
    if (s.rules === "riichi" && rons.length === 3)
      return abortiveDraw(s, "tripleRon");
    const winners = s.rules === "hongkong" ? rons.slice(0, 1) : rons;
    const wins = winners.map((seat) => {
      const score = scoreWin(s, seat, p.tile, false, {
        lastTile: liveWall(s) === 0 && !p.robbing,
        robbing: p.robbing,
      })!;
      return { seat, from: p.discarder, tile: p.tile, ...score };
    });
    // A riichi declared with the winning tile never goes down.
    const discarder = s.seats[p.discarder];
    const lastDiscard = discarder.discards.at(-1);
    if (!p.robbing && lastDiscard?.riichi && discarder.riichi)
      discarder.riichi = null;
    return settleWin(s, wins);
  }

  // The tile survived: a riichi stick goes down.
  const discarder = s.seats[p.discarder];
  if (!p.robbing && discarder.discards.at(-1)?.riichi && discarder.riichi) {
    discarder.points -= 1000;
    s.sticks++;
    if (s.seats.every((x) => x.riichi)) return abortiveDraw(s, "fourRiichi");
  }

  if (p.robbing) {
    // Nobody robbed the kan: its owner draws a replacement.
    return drawFor(s, p.discarder, "replacement");
  }

  const kanOrPon = order.find((seat) =>
    ["pon", "kan"].includes(p.responses[seat]?.type ?? ""),
  );
  const chiSeat = order.find((seat) => p.responses[seat]?.type === "chi");
  if (kanOrPon !== undefined)
    return makeCall(s, kanOrPon, p.discarder, p.tile, p.responses[kanOrPon]!);
  if (chiSeat !== undefined)
    return makeCall(s, chiSeat, p.discarder, p.tile, p.responses[chiSeat]!);

  // Abortive draws that trigger on a passed discard.
  if (s.rules === "riichi") {
    if (s.uninterrupted && totalDiscards(s) === 4) {
      const firsts = s.seats.map((x) => x.discards[0]?.tile);
      const k = kindOf(firsts[0]!);
      if (isWind(k) && firsts.every((t) => t && kindOf(t) === k))
        return abortiveDraw(s, "fourWinds");
    }
    const kanCount = s.seats.reduce(
      (n, x) => n + x.melds.filter((m) => m.type === "kan").length,
      0,
    );
    if (kanCount === 4 && new Set(s.kanSeats).size > 1)
      return abortiveDraw(s, "fourKans");
  }

  // The first go-around ends once every seat has discarded.
  if (s.uninterrupted && s.seats.every((x) => x.discards.length > 0))
    s.uninterrupted = false;

  const next = (p.discarder + 1) % 4;
  if (liveWall(s) === 0) return exhaustiveDraw(s);
  return drawFor(s, next, "wall");
};

const breakIppatsu = (s: GameState) => {
  for (const seat of s.seats) if (seat.riichi) seat.riichi.ippatsu = false;
};

const makeCall = (
  s: GameState,
  seatIndex: number,
  from: number,
  tile: Tile,
  claim: Claim,
): GameState => {
  const seat = s.seats[seatIndex];
  const kind = kindOf(tile);
  s.uninterrupted = false;
  breakIppatsu(s);
  const river = s.seats[from].discards;
  river[river.length - 1].calledBy = seatIndex;
  let meld: Meld;
  if (claim.type === "chi") {
    let hand = removeTile(seat.hand, claim.tiles[0]);
    hand = removeTile(hand, claim.tiles[1]);
    seat.hand = hand;
    meld = {
      type: "chi",
      tiles: sortTiles([tile, ...claim.tiles]),
      open: true,
      from,
      called: tile,
    };
    const [a, b] = claim.tiles.map(kindOf);
    seat.kuikae = s.rules === "riichi" ? chiKuikae(kind, a, b) : [];
  } else {
    const n = claim.type === "kan" ? 3 : 2;
    const { hand, taken } = takeKind(seat.hand, kind, n);
    seat.hand = hand;
    meld = {
      type: claim.type === "kan" ? "kan" : "pon",
      tiles: [...taken, tile],
      open: true,
      from,
      called: tile,
    };
    seat.kuikae = s.rules === "riichi" && claim.type === "pon" ? [kind] : [];
  }
  seat.melds.push(meld);
  pushEvent(s, { type: "call", seat: seatIndex, meld });
  if (meld.type === "kan") {
    s.kanSeats.push(seatIndex);
    if (s.rules === "riichi") s.pendingDora++;
    return drawFor(s, seatIndex, "replacement");
  }
  s.phase = { kind: "turn", seat: seatIndex, drawn: null, source: "call" };
  return s;
};

const declareKan = (s: GameState, seatIndex: number, kind: Kind): GameState => {
  const seat = s.seats[seatIndex];
  s.uninterrupted = false;
  breakIppatsu(s);
  s.kanSeats.push(seatIndex);
  const counts = toCounts(seat.hand);
  if (counts[kind] === 4) {
    const { hand, taken } = takeKind(seat.hand, kind, 4);
    seat.hand = hand;
    const meld: Meld = { type: "kan", tiles: taken, open: false };
    seat.melds.push(meld);
    pushEvent(s, { type: "kan", seat: seatIndex, meld });
    if (s.rules === "riichi") {
      // A concealed kan shows its dora at once (and any open kan's still waiting).
      s.pendingDora++;
      revealPendingDora(s);
    }
    // Only thirteen orphans may rob a concealed kan.
    return openKokushiRob(s, seatIndex, taken[0]);
  }
  // Added kan: a fourth tile on a pon. Others may rob it.
  const meld = seat.melds.find(
    (m) => m.type === "pon" && kindOf(m.tiles[0]) === kind,
  )!;
  const { hand, taken } = takeKind(seat.hand, kind, 1);
  seat.hand = hand;
  meld.type = "kan";
  meld.added = true;
  meld.tiles = [...meld.tiles, taken[0]];
  pushEvent(s, { type: "kan", seat: seatIndex, meld });
  if (s.rules === "riichi") {
    revealPendingDora(s);
    s.pendingDora++;
  }
  return openClaims(s, seatIndex, taken[0], true);
};

const openKokushiRob = (
  s: GameState,
  seatIndex: number,
  tile: Tile,
): GameState => {
  if (s.rules === "riichi") {
    const options: Record<number, ClaimOptions> = {};
    for (let i = 1; i < 4; i++) {
      const seat = (seatIndex + i) % 4;
      const x = s.seats[seat];
      const counts = toCounts([...x.hand, tile]);
      if (
        x.melds.length === 0 &&
        counts.reduce((a, b) => a + b, 0) === 14 &&
        canRon(s, seat, tile, true)
      ) {
        const score = scoreWin(s, seat, tile, false, { robbing: true });
        if (score?.riichi?.yaku.some((y) => y.id === "kokushi"))
          options[seat] = { ron: true, pon: false, kan: false, chi: [] };
      }
    }
    if (Object.keys(options).length) {
      s.phase = {
        kind: "claims",
        discarder: seatIndex,
        tile,
        robbing: true,
        options,
        responses: {},
      };
      return s;
    }
  }
  return drawFor(s, seatIndex, "replacement");
};

// ---------------------------------------------------------------------------
// Ending a hand

const settleWin = (
  s: GameState,
  wins: {
    seat: number;
    from: number | null;
    tile: Tile;
    riichi?: RiichiScore;
    hongkong?: HkScore;
  }[],
): GameState => {
  const deltas = [0, 0, 0, 0];
  const details: WinDetail[] = [];
  wins.forEach((w, i) => {
    const winner = s.seats[w.seat];
    const dealer = w.seat === s.dealer;
    const tsumo = w.from === null;
    // Honba and sticks go to the first winner in turn order.
    const honba = i === 0 ? s.honba : 0;
    let gained = 0;
    if (w.riichi) {
      const pay = settleRiichi(w.riichi, { dealer, tsumo, honba });
      if (!tsumo) {
        deltas[w.from!] -= pay.fromDiscarder;
        gained += pay.fromDiscarder;
      } else {
        for (let other = 0; other < 4; other++) {
          if (other === w.seat) continue;
          const amount = other === s.dealer ? pay.fromDealer : pay.fromEach;
          deltas[other] -= amount;
          gained += amount;
        }
      }
      if (i === 0) {
        gained += s.sticks * 1000;
      }
    } else if (w.hongkong) {
      for (let other = 0; other < 4; other++) {
        if (other === w.seat) continue;
        const amount = tsumo
          ? w.hongkong.fromOther
          : other === w.from
            ? w.hongkong.fromDiscarder
            : w.hongkong.fromOther;
        deltas[other] -= amount;
        gained += amount;
      }
    }
    deltas[w.seat] += gained;
    details.push({
      seat: w.seat,
      from: w.from,
      tile: w.tile,
      hand: sortTiles(tsumo ? winner.hand : [...winner.hand, w.tile]),
      melds: winner.melds,
      riichi: w.riichi,
      hongkong: w.hongkong,
      gained,
    });
  });
  if (s.rules === "riichi") s.sticks = 0;
  s.seats.forEach((seat, i) => (seat.points += deltas[i]));
  // Sticks already left the riichi players' points; the winner's gain counted them.
  const anyRiichi = s.seats.some((x) => x.riichi);
  const result: HandResult = {
    type: "win",
    wins: details,
    deltas,
    uraIndicators:
      anyRiichi && s.rules === "riichi"
        ? s.uraIndicators.slice(0, s.doraShown)
        : [],
  };
  s.phase = { kind: "handOver", result };
  return s;
};

const eightFlowers = (s: GameState, seatIndex: number): GameState => {
  const pay = hkPayment(13, true);
  const deltas = [0, 0, 0, 0];
  for (let i = 0; i < 4; i++)
    if (i !== seatIndex) {
      deltas[i] -= pay.fromOther;
      deltas[seatIndex] += pay.fromOther;
    }
  s.seats.forEach((seat, i) => (seat.points += deltas[i]));
  s.phase = {
    kind: "handOver",
    result: { type: "eightFlowers", seat: seatIndex, deltas },
  };
  return s;
};

/** Whether a seat's 13 tiles are ready. Hong Kong uses the shape only. */
export const isTenpai = (s: GameState, seatIndex: number): boolean => {
  const seat = s.seats[seatIndex];
  const w = waits({ concealed: seat.hand, melds: seat.melds });
  return w.live.length > 0;
};

const exhaustiveDraw = (s: GameState): GameState => {
  const deltas = [0, 0, 0, 0];
  const tenpai = [0, 1, 2, 3].filter((i) => isTenpai(s, i));
  const nagashi: number[] = [];
  if (s.rules === "riichi") {
    for (let i = 0; i < 4; i++) {
      const seat = s.seats[i];
      if (
        isNagashi(
          seat.discards.map((d) => d.tile),
          seat.discards.some((d) => d.calledBy !== undefined),
        )
      )
        nagashi.push(i);
    }
    if (nagashi.length) {
      for (const n of nagashi) {
        // Paid as a mangan self-draw: 4,000 all from the dealer's, 2,000/4,000 otherwise.
        const p = paymentFor(2000, n === s.dealer);
        for (let o = 0; o < 4; o++) {
          if (o === n) continue;
          const amount =
            n !== s.dealer && o === s.dealer ? p.tsumoDealer : p.tsumoOther;
          deltas[o] -= amount;
          deltas[n] += amount;
        }
      }
    } else if (tenpai.length > 0 && tenpai.length < 4) {
      const gain = 3000 / tenpai.length;
      const loss = 3000 / (4 - tenpai.length);
      for (let i = 0; i < 4; i++) deltas[i] = tenpai.includes(i) ? gain : -loss;
    }
  }
  s.seats.forEach((seat, i) => (seat.points += deltas[i]));
  s.phase = {
    kind: "handOver",
    result: { type: "draw", kind: "exhaustive", tenpai, nagashi, deltas },
  };
  return s;
};

const abortiveDraw = (s: GameState, kind: DrawKind, by?: number): GameState => {
  s.phase = {
    kind: "handOver",
    result: {
      type: "draw",
      kind,
      tenpai: [],
      nagashi: [],
      deltas: [0, 0, 0, 0],
      by,
    },
  };
  return s;
};

// ---------------------------------------------------------------------------
// Moving to the next hand, or ending the game

/** Whether the dealer keeps the deal after this result. */
export const dealerRepeats = (s: GameState, result: HandResult): boolean => {
  if (result.type === "win")
    return result.wins.some((w) => w.seat === s.dealer);
  if (result.type === "eightFlowers") return result.seat === s.dealer;
  if (result.kind !== "exhaustive") return true;
  return result.tenpai.includes(s.dealer);
};

/** Places: highest points first, ties to the seat that started nearer East. */
export const standings = (s: GameState): FinalStanding[] =>
  s.seats
    .map((seat, i) => ({ seat: i, points: seat.points }))
    .sort((a, b) => b.points - a.points || a.seat - b.seat)
    .map((x, i) => ({ ...x, rank: i + 1 }));

export const nextHand = (prev: GameState): GameState => {
  if (prev.phase.kind !== "handOver")
    throw new RuleError("The hand isn't over");
  const s = clone(prev);
  const result = prev.phase.result;
  const repeat = dealerRepeats(s, result);
  const isDraw = result.type === "draw";
  const nonDealerWon = !repeat && !isDraw;

  const end = (): GameState => {
    const final = standings(s);
    if (s.sticks > 0) {
      s.seats[final[0].seat].points += s.sticks * 1000;
      s.sticks = 0;
    }
    s.phase = { kind: "gameOver", result, final: standings(s) };
    s.step++;
    return s;
  };

  if (s.seats.some((x) => x.points < 0)) return end();

  const top = standings(s)[0];
  if (s.rules === "riichi") {
    // Extension: sudden death once anyone has reached the target.
    if (s.extended && top.points >= TARGET_POINTS) return end();
    // East 4 ("all last"): the game ends unless nobody has reached 30,000.
    if (s.roundWind === 0 && s.handInRound === 3) {
      if (repeat && top.seat === s.dealer && top.points >= TARGET_POINTS)
        return end();
      if (!repeat) {
        if (top.points >= TARGET_POINTS) return end();
        s.extended = true;
      }
    }
    if (s.roundWind === 1 && s.handInRound === 3 && !repeat) return end();
  } else if (s.handInRound === 3 && !repeat) {
    return end();
  }

  if (repeat || isDraw) s.honba++;
  if (nonDealerWon) s.honba = 0;
  if (!repeat) {
    s.dealer = (s.dealer + 1) % 4;
    s.handInRound++;
    if (s.handInRound === 4) {
      s.handInRound = 0;
      s.roundWind++;
    }
  }
  if (s.rules === "hongkong") s.honba = 0;
  return dealHand(s);
};

/** "East 2, 1 honba" */
export const roundLabel = (s: GameState): string =>
  `${["East", "South"][s.roundWind]} ${s.handInRound + 1}${s.honba ? `, ${s.honba} honba` : ""}`;

export const playerTiles = (s: GameState, seatIndex: number) =>
  allTiles({
    concealed: s.seats[seatIndex].hand,
    melds: s.seats[seatIndex].melds,
  });
