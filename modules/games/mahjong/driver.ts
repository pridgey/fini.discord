import { chooseClaim, chooseTurn } from "./bot";
import {
  newGame,
  nextHand,
  pendingClaims,
  playClaim,
  playTurn,
  shuffle,
  standings,
  turnOptions,
  type GameState,
  type PlayerInfo,
  type Rules,
} from "./game";

/**
 * Runs a table between human decisions: bots move, a riichi hand that can
 * only discard its draw does so, and the moment a person has a choice to
 * make the driver stops and says whose it is. Pure - the Discord layer
 * saves and shows what comes back.
 */

export const BOT_NAMES = ["Fini", "Fini Jr.", "Auntie Fini", "Grandpa Fini"];

/** Seats humans and bots at random, as drawing wind tiles would. */
export const seatPlayers = (
  humans: { id: string; name: string }[],
  seed: number,
): PlayerInfo[] => {
  const bots = BOT_NAMES.slice(0, 4 - humans.length).map((name, i) => ({
    id: `bot${i}`,
    name: `${name} (bot)`,
    bot: true,
  }));
  return shuffle([...humans.map((h) => ({ ...h, bot: false })), ...bots], seed);
};

export const startGame = (
  rules: Rules,
  humans: { id: string; name: string }[],
  seed: number,
): GameState => newGame(rules, seatPlayers(humans, seed), seed);

/** Seats the driver plays for: bots, and people a bot is covering for. */
export type Autopilot = (seat: number) => boolean;

export type Waiting =
  | { kind: "turn"; seat: number }
  | { kind: "claims"; seats: number[] }
  | { kind: "handOver" }
  | { kind: "gameOver" };

export const waitingOn = (s: GameState): Waiting => {
  switch (s.phase.kind) {
    case "turn":
      return { kind: "turn", seat: s.phase.seat };
    case "claims":
      return { kind: "claims", seats: pendingClaims(s) };
    case "handOver":
      return { kind: "handOver" };
    case "gameOver":
      return { kind: "gameOver" };
  }
};

/** A riichi hand with no win and no kan on offer has nothing to decide. */
const forcedDiscard = (s: GameState, seat: number) => {
  const o = turnOptions(s, seat);
  return !!o &&
    !!s.seats[seat].riichi &&
    !o.tsumo &&
    o.kans.length === 0 &&
    o.discards.length === 1
    ? o.discards[0]
    : null;
};

/**
 * Plays every automatic move until a person must decide or the hand ends.
 * If nobody at the table is a person (everyone left), plays to the end of
 * the game.
 */
export const runAutomatic = (
  start: GameState,
  autopilot: Autopilot,
): GameState => {
  let s = start;
  const everyoneAuto = [0, 1, 2, 3].every(autopilot);
  for (let guard = 0; guard < 5000; guard++) {
    const p = s.phase;
    if (p.kind === "gameOver") return s;
    if (p.kind === "handOver") {
      if (!everyoneAuto) return s;
      s = nextHand(s);
      continue;
    }
    if (p.kind === "turn") {
      if (autopilot(p.seat)) {
        s = playTurn(s, p.seat, chooseTurn(s, p.seat));
        continue;
      }
      const forced = forcedDiscard(s, p.seat);
      if (forced) {
        s = playTurn(s, p.seat, { type: "discard", tile: forced });
        continue;
      }
      return s;
    }
    // Claims: bots answer at once; people get the window.
    const auto = pendingClaims(s).filter(autopilot);
    if (auto.length) {
      s = playClaim(s, auto[0], chooseClaim(s, auto[0]));
      continue;
    }
    return s;
  }
  throw new Error("Mahjong driver ran away");
};

/** What happens when a person runs out of time. */
export const timeoutMove = (s: GameState, seat: number): GameState => {
  const p = s.phase;
  if (p.kind === "turn" && p.seat === seat) {
    const o = turnOptions(s, seat)!;
    if (o.tsumo) return playTurn(s, seat, { type: "tsumo" });
    // Throw the tile just drawn; after a call (nothing drawn), let the bot pick.
    const tile = p.drawn && o.discards.includes(p.drawn) ? p.drawn : null;
    return playTurn(
      s,
      seat,
      tile ? { type: "discard", tile } : chooseTurn(s, seat),
    );
  }
  if (p.kind === "claims" && pendingClaims(s).includes(seat)) {
    // A win is never thrown away by the clock.
    const ron = p.options[seat]?.ron;
    return playClaim(s, seat, ron ? { type: "ron" } : { type: "pass" });
  }
  return s;
};

/** Share of the pot by final place. */
export const PAYOUT_SHARES = [0.5, 0.3, 0.15, 0.05];

/**
 * Coins each seat takes home. The pot is four buy-ins: people pay theirs, and
 * the Reserve stakes each bot, so a lone player at a table of bots can win.
 */
export const payoutsFor = (s: GameState, buyIn: number) =>
  standings(s).map((st) => ({
    seat: st.seat,
    rank: st.rank,
    amount: Math.floor(buyIn * 4 * PAYOUT_SHARES[st.rank - 1] * 100) / 100,
  }));

/** How long a person gets, in ms. */
export const TIME_LIMITS = { turn: 60_000, claims: 20_000, handOver: 30_000 };
