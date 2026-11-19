import { describe, expect, it } from "bun:test";
import {
  claimOptions,
  inFuriten,
  newGame,
  nextHand,
  pendingClaims,
  playClaim,
  playTurn,
  turnOptions,
  type GameState,
  type HandResult,
} from "../../../modules/games/mahjong/game";
import { parseTiles, sortTiles } from "../../../modules/games/mahjong/tiles";
import { players } from "./wallBuilder";

/**
 * Rule-by-rule checks. Each test sets a table up directly - hands, wall,
 * whose turn - rather than dealing, so it can reach exactly the moment the
 * rule is about.
 */

// A filler hand far from ready that can't claim much.
const LONELY = "147m258p369s1234z";

type Setup = {
  rules?: "riichi" | "hongkong";
  hands: Record<number, string>;
  /** Seat on turn and the tile it just drew (added to its hand). */
  turn: number;
  drew: string;
  wall?: string;
  dora?: string;
  rinshan?: string;
  discards?: Record<number, string>;
  uninterrupted?: boolean;
  dealer?: number;
};

const setup = (o: Setup): GameState => {
  const s = newGame(o.rules ?? "riichi", players(), 5);
  s.dealer = o.dealer ?? 0;
  for (let i = 0; i < 4; i++) {
    const seat = s.seats[i];
    seat.hand = sortTiles(parseTiles(o.hands[i] ?? LONELY));
    seat.discards = parseTiles(o.discards?.[i] ?? "").map((tile) => ({ tile }));
    seat.flowers = [];
  }
  s.seats[o.turn].hand.push(o.drew);
  s.wall = parseTiles(o.wall ?? "2345678m2345678p2345678s");
  s.doraIndicators = parseTiles((o.dora ?? "1z") + "1z1z1z1z");
  if (o.rinshan) s.rinshan = parseTiles(o.rinshan);
  s.doraShown = s.rules === "riichi" ? 1 : 0;
  s.uraIndicators = parseTiles("1z1z1z1z1z");
  s.uninterrupted = o.uninterrupted ?? false;
  s.phase = { kind: "turn", seat: o.turn, drawn: o.drew, source: "wall" };
  return s;
};

const handOver = (s: GameState): HandResult => {
  if (s.phase.kind !== "handOver") throw new Error(`phase is ${s.phase.kind}`);
  return s.phase.result;
};
const passAll = (s: GameState) => {
  let x = s;
  for (const seat of pendingClaims(x)) x = playClaim(x, seat, { type: "pass" });
  return x;
};

describe("calls", () => {
  it("only the next seat may chi, and pon beats chi", () => {
    // Seat 0 discards 5p. Seat 1 can chi (46p); seat 2 holds 55p for a pon.
    let s = setup({
      hands: {
        0: "123m456s789s11z5p",
        1: "46p123s789m55z77z",
        2: "55p123s789m3z4z6z",
        3: LONELY,
      },
      turn: 0,
      drew: "9z".replace("9z", "2z"),
    });
    s = playTurn(s, 0, { type: "discard", tile: "5p" });
    expect(claimOptions(s, 1)?.chi).toEqual([["4p", "6p"]]);
    expect(claimOptions(s, 2)?.pon).toBe(true);
    expect(claimOptions(s, 2)?.chi).toEqual([]);
    s = playClaim(s, 1, { type: "chi", tiles: ["4p", "6p"] });
    s = playClaim(s, 2, { type: "pon" });
    expect(s.phase.kind === "turn" && s.phase.seat).toBe(2);
    expect(s.seats[2].melds[0]).toMatchObject({ type: "pon", from: 0 });
    expect(s.seats[1].melds).toHaveLength(0);
    // The turn skipped seat 1; seat 2 now discards without drawing.
    expect(s.phase.kind === "turn" && s.phase.drawn).toBe(null);
    expect(s.seats[0].discards.at(-1)?.calledBy).toBe(2);
  });

  it("forbids swap-calling (kuikae) after a chi", () => {
    let s = setup({
      hands: {
        0: "123m456s789s11z3p",
        1: "45p6p3p1s789m55z77z",
        2: LONELY,
        3: LONELY,
      },
      turn: 0,
      drew: "2z",
    });
    s = playTurn(s, 0, { type: "discard", tile: "3p" });
    s = playClaim(s, 1, { type: "chi", tiles: ["4p", "5p"] });
    const opts = turnOptions(s, 1)!;
    // Can't throw back the 3p, nor the 6p on the other side of 45p.
    expect(opts.discards).not.toContain("3p");
    expect(opts.discards).not.toContain("6p");
    expect(opts.discards).toContain("1s");
  });

  it("allows no calls but ron on the last discard", () => {
    let s = setup({
      hands: {
        0: "123m456s789s11z5p",
        1: "46p123s789m55z77z",
        2: "55p123s789m3z4z6z",
        3: LONELY,
      },
      turn: 0,
      drew: "2z",
      wall: "",
    });
    s = playTurn(s, 0, { type: "discard", tile: "5p" });
    expect(s.phase.kind).toBe("handOver"); // no window opened, wall empty: exhaustive draw
    expect(handOver(s)).toMatchObject({ type: "draw", kind: "exhaustive" });
  });
});

describe("furiten", () => {
  it("a wait in your own discards blocks ron but not tsumo", () => {
    // Seat 1 waits on 3-6m in riichi-less tanyao... give it riichi so it has a yaku.
    let s = setup({
      hands: {
        0: "123p456s789s11z3m",
        1: "234p567p234s45m88s",
        2: LONELY,
        3: LONELY,
      },
      turn: 0,
      drew: "2z",
      discards: { 1: "6m" },
    });
    expect(inFuriten(s, 1)).toBe(true);
    s = playTurn(s, 0, { type: "discard", tile: "3m" });
    // Seat 1 may still chi the 3m, but not ron it.
    expect(claimOptions(s, 1)?.ron).toBe(false);
    // Seat 1 draws 3m itself and may win.
    const t = setup({
      hands: { 1: "234p567p234s45m88s" },
      turn: 1,
      drew: "3m",
      discards: { 1: "6m" },
    });
    expect(turnOptions(t, 1)?.tsumo).toBe(true);
  });

  it("passing a winning tile blocks ron until your next discard; after riichi, for good", () => {
    let s = setup({
      hands: {
        0: "123p456s789s11z3m",
        1: "234p567p234s45m88s",
        2: "6m6m1p1p9s9s7z7z5z5z3z3z4z",
        3: LONELY,
      },
      turn: 0,
      drew: "2z",
    });
    s = playTurn(s, 0, { type: "discard", tile: "3m" });
    expect(claimOptions(s, 1)?.ron).toBe(true);
    s = passAll(s);
    expect(s.seats[1].tempFuriten).toBe(true);
    // Seat 1 draws and discards: furiten lifts.
    expect(s.phase.kind === "turn" && s.phase.seat).toBe(1);
    s = playTurn(s, 1, {
      type: "discard",
      tile: (s.phase as { drawn: string }).drawn,
    });
    expect(s.seats[1].tempFuriten).toBe(false);

    let r = setup({
      hands: {
        0: "123p456s789s11z3m",
        1: "234p567p234s45m88s",
        2: LONELY,
        3: LONELY,
      },
      turn: 0,
      drew: "2z",
    });
    r.seats[1].riichi = { double: false, ippatsu: false };
    r = passAll(playTurn(r, 0, { type: "discard", tile: "3m" }));
    expect(r.seats[1].riichiFuriten).toBe(true);
    expect(inFuriten(r, 1)).toBe(true);
  });
});

describe("riichi", () => {
  it("needs a closed ready hand, 1,000 points and four tiles in the wall", () => {
    const base = { hands: { 0: "123m456p789s11z45m" }, turn: 0, drew: "9p" };
    expect(turnOptions(setup(base), 0)?.riichi).toEqual(["9p"]);
    const poor = setup(base);
    poor.seats[0].points = 900;
    expect(turnOptions(poor, 0)?.riichi).toEqual([]);
    const late = setup({ ...base, wall: "123m" });
    expect(turnOptions(late, 0)?.riichi).toEqual([]);
  });

  it("locks the hand: only the drawn tile may go", () => {
    const s = setup({
      hands: { 0: "123m456p789s11z45m" },
      turn: 0,
      drew: "9p",
    });
    s.seats[0].riichi = { double: false, ippatsu: false };
    expect(turnOptions(s, 0)?.discards).toEqual(["9p"]);
    expect(() => playTurn(s, 0, { type: "discard", tile: "1z" })).toThrow();
  });

  it("allows a closed kan after riichi only if the waits don't change", () => {
    // 222m with a 3-6p wait elsewhere: kan on the drawn 2m keeps the wait.
    const ok = setup({
      hands: { 0: "222m456s789s11z45p" },
      turn: 0,
      drew: "2m",
      rinshan: "1z1z1z1z",
    });
    ok.seats[0].riichi = { double: false, ippatsu: false };
    expect(turnOptions(ok, 0)?.kans.length).toBe(1);
    // 2223m waits on 1-4m and 3m; a kan of 2m would change that.
    const bad = setup({
      hands: { 0: "2223m456s789s111z" },
      turn: 0,
      drew: "2m",
      rinshan: "1z1z1z1z",
    });
    bad.seats[0].riichi = { double: false, ippatsu: false };
    expect(turnOptions(bad, 0)?.kans).toEqual([]);
  });

  it("four riichi is an abortive draw", () => {
    let s = setup({ hands: { 0: "123m456p789s11z45m" }, turn: 0, drew: "9p" });
    for (const i of [1, 2, 3])
      s.seats[i].riichi = { double: false, ippatsu: false };
    s = passAll(playTurn(s, 0, { type: "riichi", tile: "9p" }));
    expect(handOver(s)).toMatchObject({ type: "draw", kind: "fourRiichi" });
    expect(s.sticks).toBe(1);
  });
});

describe("kans", () => {
  it("a closed kan shows a new dora at once and draws from the dead wall", () => {
    let s = setup({
      hands: { 0: "2222m456s789s11z4p" },
      turn: 0,
      drew: "5p",
      rinshan: "6p7z7z7z",
      dora: "3z",
    });
    s.doraIndicators = parseTiles("3z8p1z1z1z");
    const wallBefore = s.wall.length;
    s = playTurn(s, 0, { type: "kan", kind: 1 });
    expect(s.doraShown).toBe(2);
    expect(s.phase.kind === "turn" && s.phase.drawn).toBe("6p");
    expect(s.phase.kind === "turn" && s.phase.source).toBe("replacement");
    expect(s.wall.length).toBe(wallBefore - 1);
    // 456p + 11z: won on the replacement tile - rinshan, and 8p indicator makes 9p... not held.
    expect(turnOptions(s, 0)?.tsumo).toBe(true);
    s = playTurn(s, 0, { type: "tsumo" });
    const r = handOver(s);
    if (r.type !== "win") throw new Error();
    expect(r.wins[0].riichi?.yaku.map((y) => y.id)).toContain("rinshan");
  });

  it("an added kan can be robbed (chankan)", () => {
    let s = setup({
      hands: {
        0: "5m456s789s11z9p",
        1: "34m567p234s678s55p",
        2: LONELY,
        3: LONELY,
      },
      turn: 0,
      drew: "1p",
      rinshan: "1z1z1z1z",
    });
    s.seats[0].melds = [
      {
        type: "pon",
        tiles: parseTiles("555m"),
        open: true,
        from: 2,
        called: "5m",
      },
    ];
    // Seat 0 holds the fourth 5m; seat 1 waits on 2-5m with tanyao.
    expect(turnOptions(s, 0)?.kans).toEqual([4]);
    s = playTurn(s, 0, { type: "kan", kind: 4 });
    expect(s.phase.kind).toBe("claims");
    expect(claimOptions(s, 1)).toEqual({
      ron: true,
      pon: false,
      kan: false,
      chi: [],
    });
    s = playClaim(s, 1, { type: "ron" });
    const r = handOver(s);
    if (r.type !== "win") throw new Error();
    expect(r.wins[0].riichi?.yaku.map((y) => y.id).sort()).toEqual([
      "chankan",
      "pinfu",
      "tanyao",
    ]);
  });
});

describe("ends of a hand", () => {
  it("exhaustive draw: noten pays tenpai 3,000 in total", () => {
    // Seat 0 is ready; the others aren't. Wall is empty after this discard.
    let s = setup({
      hands: { 0: "123m456p789s11z45m" },
      turn: 0,
      drew: "9p",
      wall: "",
      discards: { 0: "5p" },
    });
    s = passAll(playTurn(s, 0, { type: "discard", tile: "9p" }));
    const r = handOver(s);
    expect(r).toMatchObject({ type: "draw", kind: "exhaustive", tenpai: [0] });
    expect(r.deltas).toEqual([3000, -1000, -1000, -1000]);
    // Dealer was ready: keeps the deal with a honba.
    const n = nextHand(s);
    expect([n.dealer, n.honba]).toEqual([0, 1]);
  });

  it("pays nagashi mangan instead of tenpai payments", () => {
    let s = setup({
      hands: { 0: "123m456p789s11z45m" },
      turn: 1,
      drew: "9p",
      wall: "",
      discards: { 0: "5p", 1: "1m9s1z" },
      dealer: 0,
    });
    s = passAll(playTurn(s, 1, { type: "discard", tile: "9p" }));
    const r = handOver(s);
    expect(r).toMatchObject({ type: "draw", nagashi: [1] });
    // Non-dealer mangan by self-draw: dealer 4,000, others 2,000.
    expect(r.deltas).toEqual([-4000, 8000, -2000, -2000]);
  });

  it("two ready players take 1,500 each", () => {
    let s = setup({
      hands: { 0: "123m456p789s11z45m", 2: "123m456p789s22z78s" },
      turn: 0,
      drew: "9p",
      wall: "",
      discards: { 0: "5p" },
    });
    s = passAll(playTurn(s, 0, { type: "discard", tile: "9p" }));
    expect(handOver(s).deltas).toEqual([1500, -1500, 1500, -1500]);
  });

  it("four of the same wind as the first discards is an abortive draw", () => {
    let s = setup({ hands: {}, turn: 0, drew: "1z", uninterrupted: true });
    for (let i = 0; i < 4; i++) {
      const seat = (s.phase as { seat: number }).seat;
      s.seats[seat].hand.push("1z");
      s = passAll(playTurn(s, seat, { type: "discard", tile: "1z" }));
      if (s.phase.kind === "turn") {
        // Next seat drew from the wall; make it a 1z instead.
        const p = s.phase;
        s.seats[p.seat].hand.splice(s.seats[p.seat].hand.indexOf(p.drawn!), 1);
        s.phase = { ...p, drawn: "1z" };
      }
    }
    expect(handOver(s)).toMatchObject({ type: "draw", kind: "fourWinds" });
  });

  it("double ron: both win, honba and sticks to the first in turn order", () => {
    let s = setup({
      hands: {
        0: "123p456s789s11z3m",
        1: "234p567p234s45m88s",
        2: "234p567p234s45m88s".replace("234p", "345p").replace("567p", "678p"),
        3: LONELY,
      },
      turn: 0,
      drew: "2z",
    });
    s.seats[1].riichi = { double: false, ippatsu: false };
    s.seats[2].riichi = { double: false, ippatsu: false };
    s.honba = 1;
    s.sticks = 2;
    s = playTurn(s, 0, { type: "discard", tile: "3m" });
    s = playClaim(s, 1, { type: "ron" });
    s = playClaim(s, 2, { type: "ron" });
    const r = handOver(s);
    if (r.type !== "win") throw new Error();
    expect(r.wins.map((w) => w.seat)).toEqual([1, 2]);
    // Seat 1: riichi pinfu tanyao (3 han 30 fu = 3,900) + 300 honba + 2,000 sticks.
    expect(r.wins[0].gained).toBe(3900 + 300 + 2000);
    expect(r.wins[1].gained).toBe(r.wins[1].riichi!.payment.ron);
    expect(r.deltas[0]).toBe(-(3900 + 300 + r.wins[1].riichi!.payment.ron));
  });

  it("three rons is an abortive draw", () => {
    const h = "234p567p234s45m88s";
    let s = setup({
      hands: {
        0: "123p456s789s11z3m",
        1: h,
        2: h.replace("234s", "345s"),
        3: h.replace("567p", "678p"),
      },
      turn: 0,
      drew: "2z",
    });
    for (const i of [1, 2, 3])
      s.seats[i].riichi = { double: false, ippatsu: false };
    s = playTurn(s, 0, { type: "discard", tile: "3m" });
    for (const i of [1, 2, 3]) s = playClaim(s, i, { type: "ron" });
    expect(handOver(s)).toMatchObject({ type: "draw", kind: "tripleRon" });
  });
});

describe("the game's end", () => {
  const over = (s: GameState, result: HandResult): GameState => ({
    ...s,
    phase: { kind: "handOver", result },
  });
  const draw = (tenpai: number[]): HandResult => ({
    type: "draw",
    kind: "exhaustive",
    tenpai,
    nagashi: [],
    deltas: [0, 0, 0, 0],
  });

  it("passes the deal when the dealer loses, resetting honba after a non-dealer win", () => {
    const s = newGame("riichi", players(), 3);
    s.honba = 2;
    const win: HandResult = {
      type: "win",
      wins: [{ seat: 2, from: 0, tile: "1m", hand: [], melds: [], gained: 0 }],
      deltas: [0, 0, 0, 0],
      uraIndicators: [],
    };
    const n = nextHand(over(s, win));
    expect([n.dealer, n.honba, n.handInRound]).toEqual([1, 0, 1]);
    const d = nextHand(over(s, draw([])));
    expect([d.dealer, d.honba]).toEqual([1, 3]);
  });

  it("ends after East 4 when someone has 30,000", () => {
    const s = newGame("riichi", players(), 3);
    s.dealer = 3;
    s.handInRound = 3;
    s.seats[1].points = 31000;
    s.seats[2].points = 19000;
    const n = nextHand(over(s, draw([])));
    expect(n.phase.kind).toBe("gameOver");
    if (n.phase.kind !== "gameOver") throw new Error();
    expect(n.phase.final.map((f) => f.seat)).toEqual([1, 0, 3, 2]);
  });

  it("goes into South when nobody has 30,000, and ends there as soon as someone does", () => {
    const s = newGame("riichi", players(), 3);
    s.dealer = 3;
    s.handInRound = 3;
    const n = nextHand(over(s, draw([])));
    expect(n.phase.kind).not.toBe("gameOver");
    expect([n.roundWind, n.handInRound, n.extended]).toEqual([1, 0, true]);
    n.seats[2].points = 30000;
    n.seats[0].points = 20000;
    expect(nextHand(over(n, draw([0]))).phase.kind).toBe("gameOver");
  });

  it("the dealer in first at all-last may stop (agari-yame)", () => {
    const s = newGame("riichi", players(), 3);
    s.dealer = 3;
    s.handInRound = 3;
    s.seats[3].points = 40000;
    s.seats[0].points = 10000;
    expect(nextHand(over(s, draw([3]))).phase.kind).toBe("gameOver");
    // Not first: plays on.
    s.seats[0].points = 41000;
    s.seats[3].points = 9000;
    expect(nextHand(over(s, draw([3]))).phase.kind).not.toBe("gameOver");
  });

  it("ends when someone goes below zero, and leftover sticks go to first", () => {
    const s = newGame("riichi", players(), 3);
    s.seats[0].points = -100;
    s.seats[1].points = 50100;
    s.sticks = 1;
    const n = nextHand(over(s, draw([])));
    expect(n.phase.kind).toBe("gameOver");
    expect(n.seats[1].points).toBe(51100);
  });
});

describe("Hong Kong", () => {
  it("sets flowers aside at the deal and replaces them", () => {
    for (let seed = 1; seed < 20; seed++) {
      const s = newGame("hongkong", players(), seed);
      for (const x of s.seats)
        expect(x.hand.some((t) => t.endsWith("f"))).toBe(false);
      const flowers = s.seats.reduce((n, x) => n + x.flowers.length, 0);
      expect(
        s.wall.length +
          s.seats.reduce((n, x) => n + x.hand.length, 0) +
          flowers,
      ).toBe(144);
    }
  });

  it("won't let a hand under 3 faan go out", () => {
    // Open hand of chows with a non-seat flower: chicken hand.
    const s = setup({
      rules: "hongkong",
      hands: { 0: "123p456s789s11z3m", 1: "234p567p45m88s" },
      turn: 0,
      drew: "2z",
    });
    s.seats[1].melds = [
      { type: "chi", tiles: parseTiles("234s"), open: true, from: 0 },
    ];
    s.seats[1].flowers = ["3f"];
    const t = playTurn(s, 0, { type: "discard", tile: "3m" });
    expect(claimOptions(t, 1)?.ron ?? false).toBe(false);
    // With a dragon pung and its own flower it reaches 3.
    const u = setup({
      rules: "hongkong",
      hands: { 0: "123p456s789s11z3m", 1: "555z567p45m88s" },
      turn: 0,
      drew: "2z",
    });
    u.seats[1].melds = [
      { type: "chi", tiles: parseTiles("234s"), open: true, from: 0 },
    ];
    u.seats[1].flowers = ["2f", "6f"];
    expect(
      claimOptions(playTurn(u, 0, { type: "discard", tile: "3m" }), 1)?.ron,
    ).toBe(true);
  });

  it("only the first seat in turn order wins when two can (head bump)", () => {
    const h = "234p567p234s45m88s";
    let s = setup({
      rules: "hongkong",
      hands: { 0: "123p456s789s11z3m", 1: h, 2: h.replace("234s", "345s") },
      turn: 0,
      drew: "2z",
    });
    s = playTurn(s, 0, { type: "discard", tile: "3m" });
    // Concealed all chows with no flowers: 3 faan each.
    s = playClaim(s, 2, { type: "ron" });
    s = playClaim(s, 1, { type: "ron" });
    const r = handOver(s);
    if (r.type !== "win") throw new Error();
    expect(r.wins.map((w) => w.seat)).toEqual([1]);
    // Half-shoot: discarder pays 16, the other two 8 each.
    expect(r.deltas).toEqual([-16, 32, -8, -8]);
  });

  it("has no furiten", () => {
    const s = setup({
      rules: "hongkong",
      hands: { 0: "123p456s789s11z3m", 1: "234p567p234s45m88s" },
      turn: 0,
      drew: "2z",
      discards: { 1: "6m" },
    });
    expect(inFuriten(s, 1)).toBe(false);
    expect(
      claimOptions(playTurn(s, 0, { type: "discard", tile: "3m" }), 1)?.ron,
    ).toBe(true);
  });
});

describe("more Riichi edge rules", () => {
  it("any call breaks every ippatsu", () => {
    let s = setup({
      hands: {
        0: "123m456p789s11z45m",
        1: "55z123m456p78s99s",
        2: LONELY,
        3: LONELY,
      },
      turn: 0,
      drew: "5z",
    });
    s.seats[0].riichi = { double: false, ippatsu: true };
    s.seats[0].hand = sortTiles(parseTiles("123m456p789s11z45m5z"));
    // Seat 0 is in riichi: it must throw its draw, the 5z, which seat 1 pons.
    s = playTurn(s, 0, { type: "discard", tile: "5z" });
    expect(s.seats[0].riichi?.ippatsu).toBe(false); // own discard ends it anyway
    const t = setup({
      hands: {
        0: LONELY,
        1: "55z123m456p78s99s",
        2: "123m456p789s11z45m",
        3: LONELY,
      },
      turn: 0,
      drew: "5z",
    });
    t.seats[2].riichi = { double: false, ippatsu: true };
    const u = playClaim(playTurn(t, 0, { type: "discard", tile: "5z" }), 1, {
      type: "pon",
    });
    expect(u.seats[2].riichi?.ippatsu).toBe(false);
  });

  it("double riichi only on an uninterrupted first discard", () => {
    const first = setup({
      hands: { 0: "123m456p789s11z45m" },
      turn: 0,
      drew: "9p",
      uninterrupted: true,
    });
    expect(
      passAll(playTurn(first, 0, { type: "riichi", tile: "9p" })).seats[0]
        .riichi?.double,
    ).toBe(true);
    const later = setup({
      hands: { 0: "123m456p789s11z45m" },
      turn: 0,
      drew: "9p",
      uninterrupted: false,
    });
    expect(
      passAll(playTurn(later, 0, { type: "riichi", tile: "9p" })).seats[0]
        .riichi?.double,
    ).toBe(false);
  });

  it("the dealer's East triplet in the East round is worth 2 han", () => {
    const s = setup({
      hands: { 0: "111z234m567p88s45s" },
      turn: 0,
      drew: "6s",
    });
    s.seats[0].hand = sortTiles(parseTiles("234m567p88s45s6s"));
    s.seats[0].melds = [
      {
        type: "pon",
        tiles: parseTiles("111z"),
        open: true,
        from: 2,
        called: "1z",
      },
    ];
    const r = handOver(playTurn(s, 0, { type: "tsumo" }));
    if (r.type !== "win") throw new Error();
    expect(r.wins[0].riichi?.yaku.map((y) => y.id).sort()).toEqual([
      "round_wind",
      "seat_wind",
    ]);
    expect(r.wins[0].riichi?.yakuHan).toBe(2);
  });

  it("an open-kan replacement win is rinshan without menzen tsumo", () => {
    let s = setup({
      hands: {
        0: "147m258p369s1234z",
        1: "777z234m567p88s4s",
        2: LONELY,
        3: LONELY,
      },
      turn: 0,
      drew: "7z",
      rinshan: "5s1z1z1z",
    });
    s.seats[1].hand = sortTiles(parseTiles("777z234m567p88s34s"));
    s = playTurn(s, 0, { type: "discard", tile: "7z" });
    s = playClaim(s, 1, { type: "kan" });
    expect(s.phase.kind === "turn" && s.phase.drawn).toBe("5s");
    s = playTurn(s, 1, { type: "tsumo" });
    const r = handOver(s);
    if (r.type !== "win") throw new Error();
    expect(r.wins[0].riichi?.yaku.map((y) => y.id).sort()).toEqual([
      "rinshan",
      "yakuhai_red",
    ]);
  });

  it("the last tile drawn is haitei, but never on a replacement draw", () => {
    const s = setup({
      hands: { 0: "234m567m234p67s55p" },
      turn: 0,
      drew: "8s",
      wall: "",
    });
    const r = handOver(playTurn(s, 0, { type: "tsumo" }));
    if (r.type !== "win") throw new Error();
    expect(r.wins[0].riichi?.yaku.map((y) => y.id)).toContain("haitei");
  });

  it("dealer tsumo pays 'all': each non-dealer pays the same", () => {
    const s = setup({
      hands: { 0: "234m567m234p67s55p" },
      turn: 0,
      drew: "8s",
    });
    const r = handOver(playTurn(s, 0, { type: "tsumo" }));
    // menzen tsumo + pinfu + tanyao: 3 han 20 fu dealer tsumo = 1,300 all.
    expect(r.deltas).toEqual([3900, -1300, -1300, -1300]);
  });

  it("a closed half-flush seven pairs is a mangan", async () => {
    const { scoreRiichi } =
      await import("../../../modules/games/mahjong/riichi");
    const { EAST, SOUTH } =
      await import("../../../modules/games/mahjong/tiles");
    const r = scoreRiichi({
      concealed: parseTiles("1133557799m1122z"),
      melds: [],
      winTile: "2z",
      tsumo: false,
      seatWind: SOUTH,
      roundWind: EAST,
    });
    expect(r?.yaku.map((y) => y.id).sort()).toEqual(["chiitoitsu", "honitsu"]);
    expect([r?.han, r?.fu, r?.limit, r?.payment.ron]).toEqual([
      5,
      25,
      "mangan",
      8000,
    ]);
  });
});
