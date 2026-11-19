import { describe, expect, it } from "bun:test";
import {
  pendingClaims,
  playClaim,
  playTurn,
  turnOptions,
  claimOptions,
  inFuriten,
  newGame,
  type GameState,
  type Claim,
} from "../../../modules/games/mahjong/game";
import { players, tableWith } from "./wallBuilder";

const turnSeat = (s: GameState) =>
  s.phase.kind === "turn" ? s.phase.seat : -1;
const drawn = (s: GameState) =>
  s.phase.kind === "turn" ? s.phase.drawn : null;

/** Everyone still able to claim passes. */
const passAll = (s: GameState): GameState => {
  let x = s;
  for (const seat of pendingClaims(x)) x = playClaim(x, seat, { type: "pass" });
  return x;
};

/** The seat on turn discards what it just drew; claims are passed. */
const tsumogiri = (s: GameState): GameState =>
  passAll(playTurn(s, turnSeat(s), { type: "discard", tile: drawn(s)! }));

const claim = (s: GameState, seat: number, c: Claim) => playClaim(s, seat, c);

// A quiet table: seat 0 deals and waits on 3-6m; nobody can claim the
// filler draws below.
const QUIET = {
  hands: [
    "123m456p789s11z45m",
    "123p567s99p23467z",
    "222m333p444s678p5z",
    "666m888p12378s56z",
  ],
  dora: "2z",
  ura: "2z",
};

describe("dealing", () => {
  it("deals 13 each and the dealer draws a 14th", () => {
    const s = tableWith({ ...QUIET, draws: ["9m"] });
    expect(s.seats.map((x) => x.hand.length)).toEqual([14, 13, 13, 13]);
    expect(turnSeat(s)).toBe(0);
    expect(drawn(s)).toBe("9m");
    expect(s.wall).toHaveLength(136 - 14 - 52 - 1);
    expect(s.doraIndicators[0]).toBe("2z");
    expect(s.doraShown).toBe(1);
  });

  it("deals a random wall that holds every tile once", () => {
    const s = newGame("riichi", players(), 42);
    const everything = [
      ...s.wall,
      ...s.rinshan,
      ...s.doraIndicators,
      ...s.uraIndicators,
      ...s.seats.flatMap((x) => x.hand),
    ];
    expect(everything).toHaveLength(136);
    expect(new Set(everything.filter((t) => t[0] === "0"))).toEqual(
      new Set(["0m", "0p", "0s"]),
    );
  });
});

describe("a hand by self-draw", () => {
  it("passes the turn around and pays a dealer tsumo 500 all", () => {
    let s = tableWith({ ...QUIET, draws: ["9m", "7m", "4p", "3z", "6m"] });
    s = tsumogiri(s); // dealer cuts 9m
    expect(turnSeat(s)).toBe(1);
    s = tsumogiri(s);
    s = tsumogiri(s);
    s = tsumogiri(s);
    expect(turnSeat(s)).toBe(0);
    expect(drawn(s)).toBe("6m");
    expect(turnOptions(s, 0)?.tsumo).toBe(true);
    s = playTurn(s, 0, { type: "tsumo" });
    expect(s.phase.kind).toBe("handOver");
    if (s.phase.kind !== "handOver" || s.phase.result.type !== "win")
      throw new Error();
    const w = s.phase.result.wins[0];
    expect(w.riichi?.yaku.map((y) => y.id)).toEqual(["menzen_tsumo"]);
    expect(w.riichi?.fu).toBe(30); // 20 + 2 tsumo + 4 double-wind pair = 26
    expect(s.phase.result.deltas).toEqual([1500, -500, -500, -500]);
    expect(s.seats.map((x) => x.points)).toEqual([26500, 24500, 24500, 24500]);
  });

  it("pays a yakuman for blessing of heaven", () => {
    let s = tableWith({ ...QUIET, draws: ["6m"] });
    s = playTurn(s, 0, { type: "tsumo" });
    if (s.phase.kind !== "handOver" || s.phase.result.type !== "win")
      throw new Error();
    expect(s.phase.result.wins[0].riichi?.yaku.map((y) => y.id)).toEqual([
      "tenhou",
    ]);
    expect(s.phase.result.deltas).toEqual([48000, -16000, -16000, -16000]);
  });

  it("refuses moves out of turn and illegal discards", () => {
    const s = tableWith({ ...QUIET, draws: ["9m"] });
    expect(() => playTurn(s, 1, { type: "discard", tile: "1p" })).toThrow();
    expect(() => playTurn(s, 0, { type: "discard", tile: "5z" })).toThrow();
    expect(() => playTurn(s, 0, { type: "tsumo" })).toThrow();
  });
});

describe("dealing in", () => {
  it("offers no ron without a yaku, and the passed tile leaves the seat in furiten", () => {
    let s = tableWith({ ...QUIET, draws: ["9m", "6m"] });
    s = tsumogiri(s);
    s = playTurn(s, 1, { type: "discard", tile: "6m" });
    // Seat 0's closed hand has no yaku without riichi: no window opens at all.
    expect(claimOptions(s, 0)).toBeNull();
    expect(s.seats[0].tempFuriten).toBe(true);
    expect(inFuriten(s, 0)).toBe(true);
  });

  it("double riichi and ippatsu ron: the dealer takes 7,700 and their stick back", () => {
    let s = tableWith({ ...QUIET, draws: ["9m", "6m"] });
    expect(turnOptions(s, 0)?.riichi).toContain("9m");
    s = passAll(playTurn(s, 0, { type: "riichi", tile: "9m" }));
    expect(s.seats[0].riichi).toEqual({ double: true, ippatsu: true });
    expect(s.seats[0].points).toBe(24000);
    expect(s.sticks).toBe(1);
    s = playTurn(s, 1, { type: "discard", tile: "6m" });
    expect(claimOptions(s, 0)?.ron).toBe(true);
    s = claim(s, 0, { type: "ron" });
    if (s.phase.kind !== "handOver" || s.phase.result.type !== "win")
      throw new Error(s.phase.kind);
    const w = s.phase.result.wins[0];
    expect(w.riichi?.yaku.map((y) => y.id).sort()).toEqual([
      "double_riichi",
      "ippatsu",
    ]);
    expect([w.riichi?.han, w.riichi?.fu]).toEqual([3, 40]);
    expect(s.phase.result.deltas).toEqual([8700, -7700, 0, 0]);
    expect(s.seats[0].points).toBe(32700);
    expect(s.sticks).toBe(0);
  });
});
