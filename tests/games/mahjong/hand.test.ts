import { describe, expect, it } from "bun:test";
import {
  discardOptions,
  isComplete,
  isSevenPairs,
  isThirteenOrphans,
  readings,
  shanten,
  waits,
} from "../../../modules/games/mahjong/hand";
import {
  doraFromIndicator,
  formatTiles,
  kindOf,
  parseTiles,
  sortTiles,
  tileName,
  tileOf,
  toCounts,
  fullSet,
} from "../../../modules/games/mahjong/tiles";

const c = (text: string) => toCounts(parseTiles(text));
const waitText = (text: string, melds = 0) =>
  formatTiles(
    waits({
      concealed: parseTiles(text),
      melds: Array.from({ length: melds }, () => ({
        type: "pon" as const,
        tiles: parseTiles("777z"),
        open: true,
      })),
    }).all.map(tileOf),
  );

describe("tiles", () => {
  it("reads and writes mpsz notation", () => {
    expect(parseTiles("123m0p77z")).toEqual([
      "1m",
      "2m",
      "3m",
      "0p",
      "7z",
      "7z",
    ]);
    expect(formatTiles(parseTiles("123m456p"))).toBe("123m456p");
    expect(sortTiles(parseTiles("6p0p5p1z1m"))).toEqual([
      "1m",
      "5p",
      "0p",
      "6p",
      "1z",
    ]);
  });

  it("treats a red five as a five", () => {
    expect(kindOf("0m")).toBe(kindOf("5m"));
    expect(kindOf("0s")).toBe(kindOf("5s"));
  });

  it("finds dora from indicators, wrapping 9→1, North→East, Red→White", () => {
    expect(tileOf(doraFromIndicator(kindOf("3m")))).toBe("4m");
    expect(tileOf(doraFromIndicator(kindOf("9p")))).toBe("1p");
    expect(tileOf(doraFromIndicator(kindOf("9s")))).toBe("1s");
    expect(tileOf(doraFromIndicator(kindOf("4z")))).toBe("1z");
    expect(tileOf(doraFromIndicator(kindOf("1z")))).toBe("2z");
    expect(tileOf(doraFromIndicator(kindOf("5z")))).toBe("6z");
    expect(tileOf(doraFromIndicator(kindOf("7z")))).toBe("5z");
  });

  it("builds 136 tiles with three red fives, or 144 with flowers", () => {
    const riichi = fullSet({ redFives: true, bonus: false });
    expect(riichi).toHaveLength(136);
    expect(riichi.filter((t) => t[0] === "0")).toEqual(["0m", "0p", "0s"]);
    expect(toCounts(riichi).every((n) => n === 4)).toBe(true);
    const hk = fullSet({ redFives: false, bonus: true });
    expect(hk).toHaveLength(144);
    expect(hk.filter((t) => t[0] === "0")).toHaveLength(0);
  });

  it("names tiles for people", () => {
    expect(tileName("5p")).toBe("5 Circles");
    expect(tileName("0s")).toBe("red 5 Bamboo");
    expect(tileName("1z")).toBe("East Wind");
    expect(tileName("7z")).toBe("Red Dragon");
    expect(tileName("5f")).toBe("Spring");
  });
});

describe("complete hands", () => {
  it("finds four sets and a pair", () => {
    expect(isComplete(c("123m456p789s11122z"), 0)).toBe(true);
    expect(isComplete(c("123m456p789s11123z"), 0)).toBe(false);
  });

  it("reads a hand every distinct way", () => {
    // 111222333m: three triplets or three identical runs.
    const r = readings(c("111222333m456p77z"));
    expect(r).toHaveLength(2);
    // 1112345678999m + 5m is one reading only.
    expect(readings(c("11123455678999m")).length).toBeGreaterThan(0);
  });

  it("knows seven pairs needs seven different pairs", () => {
    expect(isSevenPairs(c("1122m3344p5566s77z"))).toBe(true);
    expect(isSevenPairs(c("1111m3344p5566s77z"))).toBe(false);
  });

  it("knows thirteen orphans", () => {
    expect(isThirteenOrphans(c("19m19p19s12345677z"))).toBe(true);
    expect(isThirteenOrphans(c("19m19p19s12345667z"))).toBe(true);
    expect(isThirteenOrphans(c("119m19p19s1234567z"))).toBe(true);
    expect(isThirteenOrphans(c("19m19p19s1234566z"))).toBe(false);
  });

  it("counts called sets toward the four", () => {
    expect(isComplete(c("123m456p11z"), 2)).toBe(true);
    expect(isComplete(c("11z"), 4)).toBe(true);
  });
});

describe("waits", () => {
  it("finds two-sided, edge, middle, pair and both-pairs waits", () => {
    expect(waitText("123m456p789s11z45m")).toBe("36m");
    expect(waitText("123m456p789s11z12m")).toBe("3m");
    expect(waitText("123m456p789s11z13m")).toBe("2m");
    expect(waitText("123m456p789s111z5m")).toBe("5m");
    expect(waitText("123m456p789s11z55m")).toBe("5m1z");
  });

  it("finds all nine waits of a true nine gates", () => {
    expect(waitText("1112345678999m")).toBe("123456789m");
  });

  it("finds the classic multi-sided waits", () => {
    // 2345m: 2-5 two ways plus a pair wait on each end.
    expect(waitText("123p456p789s2345m")).toBe("25m");
    // 3456789m: three-sided.
    expect(waitText("111z222z3456789m")).toBe("369m");
    // 1112m: 1-2-3 (1m pair + 12m run, or 111m + 2m pair).
    expect(waitText("123p456p789s1112m")).toBe("23m");
  });

  it("finds thirteen orphans' 13-sided wait and seven pairs' pair wait", () => {
    expect(waitText("19m19p19s1234567z")).toBe("19m19p19s1234567z");
    expect(waitText("1122m3344p5566s7z")).toBe("7z");
  });

  it("does not count a tile you hold all four of as live (karaten)", () => {
    // 13m waits on 2m, but all four 2m are in the player's own kan.
    const kara = waits({
      concealed: parseTiles("13m11z"),
      melds: [
        { type: "kan", tiles: parseTiles("2222m"), open: false },
        { type: "pon", tiles: parseTiles("777z"), open: true },
        { type: "pon", tiles: parseTiles("666z"), open: true },
      ],
    });
    expect(kara.all.map(tileOf)).toEqual(["2m"]);
    expect(kara.live).toEqual([]);
  });

  it("works with called sets", () => {
    expect(waitText("45m11z", 3)).toBe("36m");
    expect(waitText("5m", 4)).toBe("5m");
  });
});

describe("shanten", () => {
  const s = (text: string, melds = 0) => shanten(c(text), melds);

  it("is -1 for a won hand and 0 when ready", () => {
    expect(s("123m456p789s11122z")).toBe(-1);
    expect(s("123m456p789s1112z")).toBe(0);
    expect(s("1122m3344p5566s7z")).toBe(0);
    expect(s("19m19p19s1234567z")).toBe(0);
  });

  it("counts standard hands", () => {
    expect(s("123m456p789s1z2z3z4z")).toBe(2); // three sets, no pair, no fourth start
    expect(s("13m46p79s1234567z")).toBe(4); // nine orphans: 4 from thirteen orphans
    expect(s("123456789m1234p")).toBe(0);
    expect(s("12m45m78m12p45p78p1s")).toBe(4);
  });

  it("matches known 13-tile examples", () => {
    // Worst possible hand for normal reading: 8, but seven pairs and orphans cap it.
    expect(s("147m258p369s1234z")).toBe(6);
    expect(s("19m19p19s123456z5m")).toBe(1);
    expect(s("1122m3344p556s7z1z")).toBe(1);
  });

  it("counts called sets", () => {
    expect(s("123m45p7z1z", 2)).toBe(1);
    expect(s("45p7z7z", 3)).toBe(0);
  });

  it("is fast enough for bots to search every discard", () => {
    const hand = { concealed: parseTiles("1236m2468p13579s2z"), melds: [] };
    const t0 = performance.now();
    for (let i = 0; i < 20; i++) discardOptions(hand, hand.concealed);
    expect((performance.now() - t0) / 20).toBeLessThan(150);
  });
});

describe("discard options", () => {
  it("names the tiles that win a ready hand", () => {
    const hand = { concealed: parseTiles("123m456p789s11z45m9p"), melds: [] };
    const best = discardOptions(hand, hand.concealed)[0];
    expect(tileOf(best.kind)).toBe("9p");
    expect(best.shanten).toBe(0);
    expect(best.improves.map(tileOf)).toEqual(["3m", "6m"]);
    expect(best.count).toBe(7); // one 3m is in the hand already
  });

  it("counts only the copies still unseen", () => {
    const hand = { concealed: parseTiles("123m456p789s11z45m9p"), melds: [] };
    const visible = [...hand.concealed, ...parseTiles("3m3m6m")];
    const best = discardOptions(hand, visible)[0];
    expect(best.count).toBe(4);
  });
});
