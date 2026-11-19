import { describe, expect, it } from "bun:test";
import type { Meld } from "../../../modules/games/mahjong/hand";
import {
  HK_TABLE,
  hkPayment,
  meetsMinimum,
  scoreHongKong,
  type HkWin,
} from "../../../modules/games/mahjong/hongkong";
import {
  EAST,
  SOUTH,
  WEST,
  parseTiles,
} from "../../../modules/games/mahjong/tiles";

const pon = (t: string): Meld => ({
  type: "pon",
  tiles: parseTiles(t),
  open: true,
  from: 1,
});
const chi = (t: string): Meld => ({
  type: "chi",
  tiles: parseTiles(t),
  open: true,
  from: 3,
});
const kan = (t: string, open: boolean): Meld => ({
  type: "kan",
  tiles: parseTiles(t),
  open,
});

const win = (
  hand: string,
  winTile: string,
  extra: Partial<HkWin> = {},
): HkWin => ({
  concealed: parseTiles(hand),
  melds: [],
  winTile,
  tsumo: false,
  seatWind: SOUTH,
  roundWind: EAST,
  flowers: ["1f"],
  ...extra,
});
const score = (hand: string, t: string, extra: Partial<HkWin> = {}) =>
  scoreHongKong(win(hand, t, extra));
const ids = (s: ReturnType<typeof scoreHongKong>) =>
  s?.faan.map((f) => f.id).sort();

describe("Hong Kong table and payment", () => {
  it("is the half-spicy table", () => {
    expect(HK_TABLE.slice(3)).toEqual([
      8, 16, 24, 32, 48, 64, 96, 128, 192, 256, 384,
    ]);
  });

  it("half-shoot: the discarder pays double, others single; self-draw all pay double", () => {
    expect(hkPayment(3, false)).toEqual({ fromDiscarder: 16, fromOther: 8 });
    expect(hkPayment(3, true)).toEqual({ fromDiscarder: 0, fromOther: 16 });
    expect(hkPayment(20, true).fromOther).toBe(768); // capped at 13
  });
});

describe("Hong Kong faan", () => {
  it("a chicken hand has no faan and can't go out", () => {
    // Open, mixed suits, runs and a pung, with a non-seat flower.
    const s = scoreHongKong({
      ...win("234m678p55s", "5s"),
      melds: [pon("999p"), chi("123s")],
    });
    expect(s?.total).toBe(0);
    expect(meetsMinimum(s)).toBe(false);
  });

  it("all chows concealed self-drawn with no flowers is 4 faan", () => {
    const s = score("234m567m234p678s55p", "8s", { tsumo: true, flowers: [] });
    expect(ids(s)).toEqual([
      "all_chows",
      "concealed",
      "no_flowers",
      "self_drawn",
    ]);
    expect(s?.total).toBe(4);
    expect(meetsMinimum(s)).toBe(true);
  });

  it("counts seat flowers and a full set", () => {
    // South seat: flower 2 and season 6 are its own.
    const seat = score("234m567m234p678s55p", "8s", {
      flowers: ["2f", "6f", "3f"],
    });
    expect(seat?.faan.filter((f) => f.id === "seat_flower")).toHaveLength(2);
    const set = score("234m567m234p678s55p", "8s", {
      flowers: ["1f", "2f", "3f", "4f"],
    });
    expect(set?.faan).toContainEqual({ id: "flower_set", faan: 2 });
    expect(set?.faan.some((f) => f.id === "seat_flower")).toBe(false);
  });

  it("dragon and wind pungs", () => {
    const s = scoreHongKong({
      ...win("234m678p55s", "5s"),
      melds: [pon("777z"), pon("222z")],
      seatWind: SOUTH,
    });
    expect(ids(s)).toEqual(["dragon_pung", "seat_wind"]);
    const double = scoreHongKong({
      ...win("234m678p55s", "5s"),
      melds: [pon("777z"), pon("111z")],
      seatWind: EAST,
      flowers: ["3f"], // not East's own flower
    });
    expect(double?.total).toBe(3);
  });

  it("all pungs, mixed and pure one suit", () => {
    const pungs = scoreHongKong({
      ...win("222m888p55s", "5s"),
      melds: [pon("444s"), pon("999m")],
    });
    expect(ids(pungs)).toEqual(["all_pungs"]);
    const mixed = scoreHongKong({
      ...win("234m678m11z", "1z"),
      melds: [chi("123m"), pon("999m")],
    });
    expect(ids(mixed)).toEqual(["mixed_one_suit"]);
    const pure = score("123456789p23488p", "8p");
    expect(pure?.faan).toContainEqual({ id: "pure_one_suit", faan: 7 });
  });

  it("small dragons is 5 including its pungs; great dragons is the limit", () => {
    const small = scoreHongKong({
      ...win("555z66z234m567p", "6z"),
      melds: [pon("777z")],
    });
    expect(ids(small)).toEqual(["small_dragons"]);
    const big = scoreHongKong({
      ...win("555z666z22m", "2m"),
      melds: [pon("777z"), chi("123m")],
    });
    expect(ids(big)).toEqual(["big_dragons"]);
    expect(big?.total).toBe(13);
    expect(big?.limit).toBe(true);
  });

  it("small winds 6, great winds the limit", () => {
    const small = scoreHongKong({
      ...win("111z222z44z", "4z"),
      melds: [pon("333z"), chi("123m")],
    });
    expect(small?.faan).toContainEqual({ id: "small_winds", faan: 6 });
    expect(small?.faan).toContainEqual({ id: "mixed_one_suit", faan: 3 });
    const big = scoreHongKong({
      ...win("111z222z55m", "5m"),
      melds: [pon("333z"), pon("444z")],
    });
    expect(ids(big)).toEqual(["big_winds"]);
  });

  it("seven pairs", () => {
    const s = score("1133m4466p2288s77z", "7z");
    expect(ids(s)).toEqual(["concealed", "seven_pairs"]);
    expect(s?.total).toBe(5);
  });

  it("all concealed pungs is a limit only by self-draw", () => {
    expect(ids(score("111m333p555s777z22m", "7z", { tsumo: true }))).toEqual([
      "concealed_pungs",
    ]);
    const ron = score("111m333p555s777z22m", "7z");
    expect(ids(ron)).toEqual(["all_pungs", "concealed", "dragon_pung"]);
  });

  it("limit hands", () => {
    expect(ids(score("19m19p19s12345677z", "7z"))).toEqual([
      "thirteen_orphans",
    ]);
    expect(ids(score("11123455678999m", "5m"))).toEqual(["nine_gates"]);
    expect(ids(score("11223344556677z", "7z"))).toEqual(["all_honors"]);
    const terms = scoreHongKong({
      ...win("111m999p99s", "9s"),
      melds: [pon("111s"), pon("999m")],
    });
    expect(ids(terms)).toEqual(["all_terminals"]);
    const kongs = scoreHongKong({
      ...win("55p", "5p"),
      melds: [
        kan("2222m", true),
        kan("3333p", false),
        kan("4444s", true),
        kan("6666s", true),
      ],
    });
    expect(ids(kongs)).toEqual(["four_kongs"]);
    expect(
      ids(
        score("234m567m234p678s55p", "8s", {
          tsumo: true,
          firstTurn: true,
          seatWind: EAST,
        }),
      ),
    ).toEqual(["heavenly"]);
  });

  it("situational faan", () => {
    const base = "234m567m234p678s55p";
    expect(ids(score(base, "8s", { tsumo: true, lastTile: true }))).toContain(
      "last_tile",
    );
    expect(
      ids(score(base, "8s", { tsumo: true, replacement: true })),
    ).toContain("kong_replacement");
    expect(ids(score(base, "8s", { robbingKong: true }))).toContain(
      "robbing_kong",
    );
  });

  it("mixed terminals with all pungs", () => {
    const s = scoreHongKong({
      ...win("111m999p11z", "1z"),
      melds: [pon("999s"), pon("333z")],
      seatWind: WEST,
    });
    expect(ids(s)).toEqual(["all_pungs", "mixed_terminals", "seat_wind"]);
    expect(s?.total).toBe(5);
  });

  it("caps at 13", () => {
    // Pure one suit 7 + all pungs 3 + concealed 1 + self-drawn 1 + no flowers 1 = 13
    const s = score("111222333444p55p", "5p", { tsumo: true, flowers: [] });
    expect(s?.total).toBe(13);
  });

  it("is not a win if the shape is incomplete", () => {
    expect(score("123m456p789s1123z", "3z")).toBeNull();
  });
});
