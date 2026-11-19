import { describe, expect, it } from "bun:test";
import type { Meld } from "../../../modules/games/mahjong/hand";
import {
  basePoints,
  paymentFor,
  scoreRiichi,
  settleRiichi,
  isNagashi,
  nineTerminals,
  type RiichiWin,
} from "../../../modules/games/mahjong/riichi";
import {
  EAST,
  SOUTH,
  WEST,
  parseTiles,
} from "../../../modules/games/mahjong/tiles";

/**
 * Expected values come from the standard Riichi score table (as published by
 * the EMA and used by Tenhou and Mahjong Soul).
 */

const pon = (t: string, from = 1): Meld => ({
  type: "pon",
  tiles: parseTiles(t),
  open: true,
  from,
});
const chi = (t: string, from = 3): Meld => ({
  type: "chi",
  tiles: parseTiles(t),
  open: true,
  from,
});
const kan = (t: string, open: boolean): Meld => ({
  type: "kan",
  tiles: parseTiles(t),
  open,
});

const win = (
  hand: string,
  winTile: string,
  extra: Partial<RiichiWin> = {},
): RiichiWin => ({
  concealed: parseTiles(hand),
  melds: [],
  winTile,
  tsumo: false,
  seatWind: SOUTH,
  roundWind: EAST,
  ...extra,
});

const score = (hand: string, winTile: string, extra: Partial<RiichiWin> = {}) =>
  scoreRiichi(win(hand, winTile, extra));

const ids = (s: ReturnType<typeof scoreRiichi>) =>
  s?.yaku.map((y) => y.id).sort();

describe("the score table", () => {
  const table = (han: number, fu: number, dealer: boolean) =>
    paymentFor(basePoints(han, fu, 0), dealer);

  it("matches non-dealer ron values", () => {
    expect(table(1, 30, false).ron).toBe(1000);
    expect(table(1, 40, false).ron).toBe(1300);
    expect(table(1, 50, false).ron).toBe(1600);
    expect(table(2, 25, false).ron).toBe(1600);
    expect(table(2, 30, false).ron).toBe(2000);
    expect(table(2, 40, false).ron).toBe(2600);
    expect(table(3, 30, false).ron).toBe(3900);
    expect(table(3, 40, false).ron).toBe(5200);
    expect(table(3, 60, false).ron).toBe(7700);
    expect(table(4, 30, false).ron).toBe(7700); // no kiriage mangan
    expect(table(4, 40, false).ron).toBe(8000);
    expect(table(3, 70, false).ron).toBe(8000);
    expect(table(5, 30, false).ron).toBe(8000);
    expect(table(6, 30, false).ron).toBe(12000);
    expect(table(8, 30, false).ron).toBe(16000);
    expect(table(11, 30, false).ron).toBe(24000);
    expect(table(13, 30, false).ron).toBe(32000);
  });

  it("matches dealer ron values", () => {
    expect(table(1, 30, true).ron).toBe(1500);
    expect(table(2, 30, true).ron).toBe(2900);
    expect(table(3, 30, true).ron).toBe(5800);
    expect(table(4, 30, true).ron).toBe(11600);
    expect(table(5, 30, true).ron).toBe(12000);
    expect(table(2, 25, true).ron).toBe(2400);
  });

  it("matches tsumo splits", () => {
    const p = table(1, 30, false);
    expect([p.tsumoOther, p.tsumoDealer]).toEqual([300, 500]);
    const q = table(2, 20, false);
    expect([q.tsumoOther, q.tsumoDealer]).toEqual([400, 700]);
    const r = table(3, 25, false);
    expect([r.tsumoOther, r.tsumoDealer]).toEqual([800, 1600]);
    const d = table(1, 30, true);
    expect(d.tsumoOther).toBe(500);
    const m = table(5, 30, false);
    expect([m.tsumoOther, m.tsumoDealer]).toEqual([2000, 4000]);
    expect(table(4, 30, true).tsumoOther).toBe(3900);
  });

  it("pays yakuman and double yakuman", () => {
    expect(paymentFor(basePoints(0, 0, 1), false).ron).toBe(32000);
    expect(paymentFor(basePoints(0, 0, 1), true).ron).toBe(48000);
    expect(paymentFor(basePoints(0, 0, 2), false).ron).toBe(64000);
  });
});

describe("common hands", () => {
  it("pinfu self-draw is 20 fu: 400/700 with menzen tsumo", () => {
    const s = score("123m456m789p234s55s", "9p", { tsumo: true });
    expect(ids(s)).toEqual(["menzen_tsumo", "pinfu"]);
    expect(s?.fu).toBe(20);
    expect([s?.payment.tsumoOther, s?.payment.tsumoDealer]).toEqual([400, 700]);
  });

  it("pinfu tanyao ron is 2 han 30 fu: 2000", () => {
    const s = score("234m567m234p678s55p", "8s");
    expect(ids(s)).toEqual(["pinfu", "tanyao"]);
    expect([s?.han, s?.fu, s?.payment.ron]).toEqual([2, 30, 2000]);
  });

  it("is not pinfu on a middle wait, and takes the 2 fu", () => {
    const s = score("234m567m234p678s55p", "7s", { riichi: true });
    expect(ids(s)).toEqual(["riichi", "tanyao"]);
    expect(s?.fu).toBe(40); // 20 + 10 closed ron + 2 middle wait = 32 -> 40
  });

  it("picks the reading worth most: two-sided over middle", () => {
    // 45s + 6s is two-sided, so pinfu applies.
    const s = score("234m567m234p456s88p", "6s");
    expect(ids(s)).toContain("pinfu");
  });

  it("is not pinfu with a value pair", () => {
    const s = score("234m567m234p678s55z", "8s", { riichi: true });
    expect(ids(s)).toEqual(["riichi"]);
    expect(s?.fu).toBe(40); // 20 + 10 + 2 dragon pair = 32 -> 40
    const wind = score("234m567m234p678s22z", "8s", { riichi: true }); // seat wind South
    expect(wind?.fu).toBe(40);
    const guest = score("234m567m234p678s33z", "8s", { riichi: true }); // West: no value
    expect(ids(guest)).toEqual(["pinfu", "riichi"]);
    expect(guest?.fu).toBe(30);
  });

  it("counts a double wind pair as 4 fu", () => {
    const s = score("234m567m234p678s11z", "8s", {
      riichi: true,
      seatWind: EAST,
    });
    expect(
      s?.fuParts.filter((p) => p.reason.includes("wind pair")),
    ).toHaveLength(2);
    expect(s?.fu).toBe(40);
  });

  it("open yakuhai hand with nothing else is 30 fu: 1000", () => {
    const s = scoreRiichi({
      ...win("234m678p34s22p", "5s"),
      concealed: parseTiles("234m678p345s22p"),
      melds: [pon("777z")],
    });
    expect(ids(s)).toEqual(["yakuhai_red"]);
    expect([s?.han, s?.fu, s?.payment.ron]).toEqual([1, 30, 1000]);
  });

  it("open hand of runs and a plain pair rounds up to 30 fu", () => {
    const s = scoreRiichi({
      ...win("", "5s"),
      concealed: parseTiles("234m678p345s22p"),
      melds: [chi("678s")],
    });
    expect(ids(s)).toEqual(["tanyao"]);
    expect(s?.fu).toBe(30);
    expect(s?.payment.ron).toBe(1000);
  });

  it("refuses a hand with no yaku, even with dora", () => {
    const s = scoreRiichi({
      ...win("", "5s"),
      concealed: parseTiles("234m678p345s99p"),
      melds: [chi("123s")],
      doraIndicators: ["4m"],
    });
    expect(s).toBeNull();
  });

  it("counts fu for concealed terminal triplets and a middle wait", () => {
    const s = score("111m456p234s789s99p", "5p", { riichi: true });
    expect(ids(s)).toEqual(["riichi"]);
    // 20 base + 10 closed ron + 8 concealed 111m + 2 middle wait = 40
    expect([s?.fu, s?.payment.ron]).toEqual([40, 1300]);
  });

  it("treats a triplet finished by ron as open", () => {
    // Waiting on 5m/1z pair-pair: ron on 1z makes 111z an open triplet.
    const s = score("123m456p789s11z555m", "5m", {
      riichi: true,
      seatWind: WEST,
      roundWind: SOUTH,
    });
    // 555m finished by ron: open simple triplet 2 fu. 20+10+2 = 32 -> 40.
    expect(s?.fu).toBe(40);
    const t = score("123m456p789s11z555m", "5m", {
      riichi: true,
      tsumo: true,
      seatWind: WEST,
      roundWind: SOUTH,
    });
    // tsumo: concealed 4 fu + tsumo 2 = 26 -> 30
    expect(t?.fu).toBe(30);
  });

  it("scores seven pairs at 25 fu: 1600, and 800/1600 by tsumo", () => {
    const r = score("1133m4466p2288s77z", "7z");
    expect(ids(r)).toEqual(["chiitoitsu"]);
    expect([r?.han, r?.fu, r?.payment.ron]).toEqual([2, 25, 1600]);
    const t = score("1133m4466p2288s77z", "7z", { tsumo: true });
    expect([t?.payment.tsumoOther, t?.payment.tsumoDealer]).toEqual([
      800, 1600,
    ]);
  });

  it("prefers twice pure double sequence over seven pairs", () => {
    const s = score("223344m556677p88s", "8s");
    expect(ids(s)).toEqual(["ryanpeikou", "tanyao"]);
    expect(s?.limit).toBe("mangan"); // 4 han 40 fu
  });

  it("finds pure double sequence", () => {
    const s = score("112233m456p789s55p", "5p", { riichi: true });
    expect(ids(s)).toEqual(["iipeikou", "riichi"]);
  });
});

describe("yaku", () => {
  it("sanshoku closed 2, open 1", () => {
    expect(ids(score("234m234p234s678m99p", "9p"))).toEqual(["sanshoku"]);
    const open = scoreRiichi({
      ...win("", "9p"),
      concealed: parseTiles("234m234p678m99p"),
      melds: [chi("234s")],
    });
    expect(open?.yaku).toEqual([{ id: "sanshoku", han: 1 }]);
  });

  it("ittsu closed 2, open 1", () => {
    const s = score("123456789p234s11m", "1m");
    expect(ids(s)).toEqual(["ittsu"]);
    expect(s?.yakuHan).toBe(2);
    const open = scoreRiichi({
      ...win("", "1m"),
      concealed: parseTiles("123456p234s11m"),
      melds: [chi("789p")],
    });
    expect(open?.yakuHan).toBe(1);
  });

  it("chanta and junchan", () => {
    const ch = score("123m789p123s999s11z", "1z", { riichi: true });
    expect(ids(ch)).toEqual(["chanta", "riichi"]);
    const ju = score("123m789p123s999s11p", "1p", { riichi: true });
    expect(ids(ju)).toEqual(["junchan", "riichi"]);
    expect(ju?.yakuHan).toBe(4);
  });

  it("toitoi, sanankou, and the triplet yaku", () => {
    const s = scoreRiichi({
      ...win("", "9s"),
      concealed: parseTiles("222m444p99s"),
      melds: [pon("888s"), pon("333z")],
      tsumo: true,
    });
    // Two concealed triplets only: not sanankou.
    expect(ids(s)).toEqual(["toitoi"]);
    const san = scoreRiichi({
      ...win("", "9s"),
      concealed: parseTiles("222m444p666s99s"),
      melds: [pon("888s")],
      tsumo: true,
    });
    expect(ids(san)).toEqual(["sanankou", "toitoi"]);
  });

  it("sanshoku doukou", () => {
    const s = scoreRiichi({
      ...win("", "1z"),
      concealed: parseTiles("444m444p11z"),
      melds: [pon("444s"), chi("678m")],
    });
    expect(ids(s)).toContain("sanshoku_doukou");
  });

  it("honitsu and chinitsu, closed and open", () => {
    expect(
      score("123456m789m111z22z", "2z", { riichi: true, seatWind: WEST })?.yaku,
    ).toContainEqual({ id: "honitsu", han: 3 });
    const open = scoreRiichi({
      ...win("", "2z"),
      concealed: parseTiles("123456m22z"),
      melds: [pon("111z"), chi("789m")],
      seatWind: WEST,
    });
    expect(open?.yaku).toContainEqual({ id: "honitsu", han: 2 });
    const flush = score("12345678999p234p", "4p");
    expect(flush?.yaku).toContainEqual({ id: "chinitsu", han: 6 });
  });

  it("shousangen gets its 2 han plus the two dragon triplets", () => {
    const s = scoreRiichi({
      ...win("", "6z"),
      concealed: parseTiles("555z66z234m567p"),
      melds: [pon("777z")],
    });
    expect(ids(s)).toEqual(["shousangen", "yakuhai_red", "yakuhai_white"]);
    expect(s?.yakuHan).toBe(4);
  });

  it("honroutou with toitoi", () => {
    const s = scoreRiichi({
      ...win("", "9p"),
      concealed: parseTiles("111m999p99s"),
      melds: [pon("111z", 2), pon("999m")],
      seatWind: WEST,
      roundWind: SOUTH,
    });
    expect(ids(s)).toEqual(["honroutou", "toitoi"]);
  });

  it("situational yaku", () => {
    const base = "234m567m234p678s55p";
    expect(ids(score(base, "8s", { riichi: true, ippatsu: true }))).toEqual([
      "ippatsu",
      "pinfu",
      "riichi",
      "tanyao",
    ]);
    expect(ids(score(base, "8s", { doubleRiichi: true }))).toEqual([
      "double_riichi",
      "pinfu",
      "tanyao",
    ]);
    expect(ids(score(base, "8s", { lastTile: true }))).toEqual([
      "houtei",
      "pinfu",
      "tanyao",
    ]);
    expect(ids(score(base, "8s", { lastTile: true, tsumo: true }))).toEqual([
      "haitei",
      "menzen_tsumo",
      "pinfu",
      "tanyao",
    ]);
    expect(ids(score(base, "8s", { chankan: true }))).toEqual([
      "chankan",
      "pinfu",
      "tanyao",
    ]);
  });

  it("rinshan after a closed kan", () => {
    const t = scoreRiichi({
      ...win("", "6p"),
      concealed: parseTiles("234m567m456p88s"),
      melds: [kan("2222s", false)],
      tsumo: true,
      rinshan: true,
      riichi: true,
    });
    expect(ids(t)).toEqual(["menzen_tsumo", "riichi", "rinshan", "tanyao"]);
    // 20 + 2 tsumo + 16 closed simple kan = 38 -> 40 (pinfu impossible with a kan)
    expect(t?.fu).toBe(40);
  });
});

describe("dora", () => {
  it("counts dora, red fives, and ura only with riichi", () => {
    const hand = "234m067m234p678s55p";
    const s = score(hand, "8s", {
      doraIndicators: ["4p"],
      uraIndicators: ["1m"],
    });
    expect([s?.dora, s?.red, s?.ura]).toEqual([2, 1, 0]);
    expect(s?.han).toBe(5);
    const r = score(hand, "8s", {
      doraIndicators: ["4p"],
      uraIndicators: ["1m"],
      riichi: true,
    });
    expect(r?.ura).toBe(1);
    expect(r?.han).toBe(7);
  });

  it("counts dora in called sets and kans", () => {
    const s = scoreRiichi({
      ...win("", "8s"),
      concealed: parseTiles("234m234p678s55p"),
      melds: [kan("3333m", true)],
      doraIndicators: ["2m", "2m"],
    });
    // two indicators of 2m -> 3m is dora twice; five 3m tiles x2 = 10
    expect(s?.dora).toBe(10);
  });
});

describe("yakuman", () => {
  it("four concealed triplets by tsumo, and double on a pair wait", () => {
    const shanpon = score("111m333p555s777z22m", "7z", { tsumo: true });
    expect(ids(shanpon)).toEqual(["suuankou"]);
    expect(shanpon?.yakuman).toBe(1);
    expect([shanpon?.payment.tsumoOther, shanpon?.payment.tsumoDealer]).toEqual(
      [8000, 16000],
    );
    const tanki = score("111m333p555s777z22m", "2m");
    expect(tanki?.yakuman).toBe(2);
  });

  it("by ron on a pair-pair wait it is only three concealed triplets", () => {
    const s = score("111m333p555s777z22m", "7z");
    expect(ids(s)).toEqual(["sanankou", "toitoi", "yakuhai_red"]);
    expect(s?.payment.ron).toBe(8000); // 5 han
  });

  it("thirteen orphans, double on the 13-sided wait", () => {
    // Holding 77z and winning on 1m: the hand waited on 1m alone.
    expect(score("19m19p19s12345677z", "1m")?.yakuman).toBe(1);
    // Thirteen different tiles before the win: a 13-sided wait.
    expect(score("19m19p19s12345677z", "7z")?.yakuman).toBe(2);
    expect(score("119m19p19s1234567z", "1m")?.yakuman).toBe(2);
  });

  it("nine gates, double when true", () => {
    expect(score("11123455678999m", "5m")?.yakuman).toBe(2);
    const impure = score("11122345678999m", "1m");
    expect(ids(impure)).toEqual(["chuuren"]);
    expect(impure?.yakuman).toBe(1);
  });

  it("dragons and winds", () => {
    const big = scoreRiichi({
      ...win("", "2m"),
      concealed: parseTiles("555z666z22m"),
      melds: [pon("777z"), chi("123m")],
    });
    expect(ids(big)).toEqual(["daisangen"]);
    const little = scoreRiichi({
      ...win("", "4z"),
      concealed: parseTiles("111z222z44z"),
      melds: [pon("333z"), chi("123m")],
    });
    expect(ids(little)).toEqual(["shousuushii"]);
    const four = scoreRiichi({
      ...win("", "5m"),
      concealed: parseTiles("111z222z55m"),
      melds: [pon("333z"), pon("444z")],
    });
    expect(ids(four)).toEqual(["daisuushii"]);
    expect(four?.yakuman).toBe(2);
  });

  it("all honors (including as seven pairs), all terminals, all green", () => {
    expect(ids(score("11223344556677z", "7z"))).toEqual(["tsuuiisou"]);
    const terms = scoreRiichi({
      ...win("", "9s"),
      concealed: parseTiles("111m999p99s"),
      melds: [pon("111s"), pon("999m")],
    });
    expect(ids(terms)).toEqual(["chinroutou"]);
    const green = score("234s234s666s888s66z", "6z");
    expect(ids(green)).toContain("ryuuiisou");
  });

  it("stacks yakuman", () => {
    // All honors + big three dragons + four concealed triplets (pair wait).
    const s = score("555z666z777z111z22z", "2z", { tsumo: true });
    expect(s?.yakuman).toBe(1 + 1 + 2);
  });

  it("blessings of heaven and earth", () => {
    const h = score("234m567m234p678s55p", "8s", {
      tsumo: true,
      firstDraw: true,
      seatWind: EAST,
    });
    expect(ids(h)).toEqual(["tenhou"]);
    const e = score("234m567m234p678s55p", "8s", {
      tsumo: true,
      firstDraw: true,
    });
    expect(ids(e)).toEqual(["chiihou"]);
  });

  it("four kans", () => {
    const s = scoreRiichi({
      ...win("", "5p"),
      concealed: parseTiles("55p"),
      melds: [
        kan("2222m", true),
        kan("3333p", false),
        kan("4444s", true),
        kan("7777z", true),
      ],
    });
    expect(ids(s)).toEqual(["suukantsu"]);
  });

  it("counts thirteen han as kazoe yakuman", () => {
    // Closed full flush 6 + pure straight 2 + iipeikou 1 + pinfu 1 + riichi 1
    // + tsumo 1 = 12, and the 9p dora takes it past 13.
    const k = score("112233456789p99p", "9p", {
      riichi: true,
      tsumo: true,
      doraIndicators: ["8p"],
    });
    expect(k?.limit).toBe("kazoe yakuman");
    expect(k?.base).toBe(8000);
  });
});

describe("settlement", () => {
  it("adds 300 per honba on ron and 100 from each on tsumo", () => {
    const s = score("234m567m234p678s55p", "8s")!;
    expect(
      settleRiichi(s, { dealer: false, tsumo: false, honba: 2 }).fromDiscarder,
    ).toBe(2600);
    const t = score("123m456m789p234s55s", "9p", { tsumo: true })!;
    expect(settleRiichi(t, { dealer: false, tsumo: true, honba: 1 })).toEqual({
      fromDiscarder: 0,
      fromDealer: 800,
      fromEach: 500,
    });
  });
});

describe("draws", () => {
  it("knows nagashi mangan and nine terminals", () => {
    expect(isNagashi(parseTiles("19m1p9s1234z"), false)).toBe(true);
    expect(isNagashi(parseTiles("19m1p9s1234z"), true)).toBe(false);
    expect(isNagashi(parseTiles("19m2p"), false)).toBe(false);
    expect(nineTerminals(parseTiles("19m19p19s123z2468m"))).toBe(true);
    expect(nineTerminals(parseTiles("19m19p19s12z23468m"))).toBe(false);
  });
});
