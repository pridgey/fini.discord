import { describe, expect, it } from "bun:test";
import { chooseClaim, chooseTurn } from "../../../modules/games/mahjong/bot";
import {
  claimOptions,
  newGame,
  nextHand,
  pendingClaims,
  playClaim,
  playTurn,
  turnOptions,
  START_POINTS,
  type Claim,
  type GameState,
  type Rules,
  type TurnMove,
} from "../../../modules/games/mahjong/game";
import { isComplete } from "../../../modules/games/mahjong/hand";
import { HK_MIN_FAAN } from "../../../modules/games/mahjong/hongkong";
import { toCounts } from "../../../modules/games/mahjong/tiles";
import { players } from "./wallBuilder";

/**
 * Whole games, start to finish, checking the table after every move:
 * no tile created or lost, no point created or lost, every hand the right
 * size, every win a real win that scores what was paid.
 */

const tileTotal = (s: GameState) =>
  s.wall.length +
  s.rinshan.length +
  s.doraIndicators.length +
  s.uraIndicators.length +
  s.seats.reduce(
    (n, x) =>
      n +
      x.hand.length +
      x.flowers.length +
      x.melds.reduce((m, meld) => m + meld.tiles.length, 0) +
      x.discards.filter((d) => d.calledBy === undefined).length,
    0,
  );

const checkInvariants = (s: GameState, rules: Rules) => {
  expect(tileTotal(s)).toBe(rules === "riichi" ? 136 : 144);
  const points = s.seats.reduce((n, x) => n + x.points, 0) + s.sticks * 1000;
  expect(points).toBe(START_POINTS[rules] * 4);
  if (s.phase.kind === "turn" || s.phase.kind === "claims") {
    s.seats.forEach((x, i) => {
      const expected =
        13 -
        3 * x.melds.length +
        (s.phase.kind === "turn" && s.phase.seat === i ? 1 : 0);
      expect(x.hand.length).toBe(expected);
      expect(x.hand.some((t) => t.endsWith("f"))).toBe(false);
    });
  }
  if (s.phase.kind === "handOver" && s.phase.result.type === "win") {
    for (const w of s.phase.result.wins) {
      const counts = toCounts(w.hand);
      expect(isComplete(counts, w.melds.length)).toBe(true);
      if (rules === "hongkong")
        expect(w.hongkong!.total).toBeGreaterThanOrEqual(HK_MIN_FAAN);
      else expect(w.riichi!.yaku.length).toBeGreaterThan(0);
    }
  }
};

type Policy = {
  turn: (s: GameState, seat: number) => TurnMove;
  claim: (s: GameState, seat: number) => Claim;
};

const botPolicy: Policy = { turn: chooseTurn, claim: chooseClaim };

/** Picks at random among every legal move, to reach the odd corners. */
const randomPolicy = (seed: number): Policy => {
  let x = seed;
  const rand = () => (x = (x * 1103515245 + 12345) % 2147483648) / 2147483648;
  const pick = <T>(a: T[]) => a[Math.floor(rand() * a.length)];
  return {
    turn: (s, seat) => {
      const o = turnOptions(s, seat)!;
      if (o.tsumo && rand() < 0.9) return { type: "tsumo" };
      if (o.kans.length && rand() < 0.5)
        return { type: "kan", kind: pick(o.kans) };
      if (o.riichi.length && rand() < 0.6)
        return { type: "riichi", tile: pick(o.riichi) };
      if (o.nineTerminals && rand() < 0.5) return { type: "nineTerminals" };
      return { type: "discard", tile: pick(o.discards) };
    },
    claim: (s, seat) => {
      const o = claimOptions(s, seat)!;
      if (o.ron && rand() < 0.9) return { type: "ron" };
      const choices: Claim[] = [{ type: "pass" }, { type: "pass" }];
      if (o.pon) choices.push({ type: "pon" });
      if (o.kan) choices.push({ type: "kan" }, { type: "kan" });
      for (const c of o.chi) choices.push({ type: "chi", tiles: c });
      return pick(choices);
    },
  };
};

const playGame = (rules: Rules, seed: number, policy: Policy) => {
  let s = newGame(rules, players([true, true, true, true]), seed);
  const stats = {
    hands: 0,
    wins: 0,
    draws: 0,
    moves: 0,
    yaku: new Map<string, number>(),
  };
  for (let guard = 0; guard < 20000; guard++) {
    checkInvariants(s, rules);
    const p = s.phase;
    if (p.kind === "gameOver") return { s, stats };
    if (p.kind === "handOver") {
      stats.hands++;
      if (p.result.type === "win") {
        stats.wins++;
        for (const w of p.result.wins)
          for (const y of w.riichi?.yaku ?? w.hongkong?.faan ?? [])
            stats.yaku.set(y.id, (stats.yaku.get(y.id) ?? 0) + 1);
      } else stats.draws++;
      s = nextHand(s);
      continue;
    }
    stats.moves++;
    if (p.kind === "turn") s = playTurn(s, p.seat, policy.turn(s, p.seat));
    else {
      const seat = pendingClaims(s)[0];
      s = playClaim(s, seat, policy.claim(s, seat));
    }
  }
  throw new Error("Game did not end");
};

describe("whole games", () => {
  for (const rules of ["riichi", "hongkong"] as Rules[]) {
    it(`${rules}: bots play 40 games to the end with every invariant held`, () => {
      const totals = { hands: 0, wins: 0, draws: 0 };
      const yaku = new Map<string, number>();
      for (let seed = 1; seed <= 40; seed++) {
        const { s, stats } = playGame(rules, seed, botPolicy);
        expect(s.phase.kind).toBe("gameOver");
        totals.hands += stats.hands;
        totals.wins += stats.wins;
        totals.draws += stats.draws;
        for (const [k, v] of stats.yaku) yaku.set(k, (yaku.get(k) ?? 0) + v);
      }
      // Bots should win most hands, as real tables do.
      expect(totals.wins / totals.hands).toBeGreaterThan(
        rules === "riichi" ? 0.55 : 0.35,
      );
      console.log(
        rules,
        totals,
        [...yaku.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12),
      );
    }, 120000);

    it(`${rules}: random legal moves for 100 games never break the rules engine`, () => {
      for (let seed = 1; seed <= 100; seed++) {
        const { s } = playGame(rules, seed * 31, randomPolicy(seed));
        expect(s.phase.kind).toBe("gameOver");
      }
    }, 120000);
  }
});
