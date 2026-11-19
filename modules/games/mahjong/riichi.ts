import {
  isSevenPairs,
  isThirteenOrphans,
  readings,
  type Meld,
  type Reading,
} from "./hand";
import {
  DRAGONS,
  GREEN,
  ORPHANS,
  WINDS,
  doraFromIndicator,
  isDragon,
  isHonor,
  isRed,
  isTerminalOrHonor,
  isWind,
  kindOf,
  numberOf,
  toCounts,
  type Kind,
  type Tile,
} from "./tiles";

/**
 * Riichi scoring, following the common online ruleset (Mahjong Soul / Tenhou
 * ranked): open tanyao, red fives, kazoe yakuman at 13 han, no kiriage
 * mangan, and double yakuman for a 13-sided thirteen orphans, four concealed
 * triplets on a pair wait, true nine gates, and big four winds.
 *
 * A hand is scored every way it can be read - which set the winning tile
 * finished, and how the tiles split into sets - and the reading worth the
 * most points is the one that counts, as the rules require.
 */

export type YakuId =
  | "riichi"
  | "double_riichi"
  | "ippatsu"
  | "menzen_tsumo"
  | "pinfu"
  | "iipeikou"
  | "tanyao"
  | "yakuhai_white"
  | "yakuhai_green"
  | "yakuhai_red"
  | "seat_wind"
  | "round_wind"
  | "haitei"
  | "houtei"
  | "rinshan"
  | "chankan"
  | "chiitoitsu"
  | "sanshoku"
  | "ittsu"
  | "chanta"
  | "toitoi"
  | "sanankou"
  | "sanshoku_doukou"
  | "sankantsu"
  | "honroutou"
  | "shousangen"
  | "honitsu"
  | "junchan"
  | "ryanpeikou"
  | "chinitsu"
  | "kokushi"
  | "suuankou"
  | "daisangen"
  | "shousuushii"
  | "daisuushii"
  | "tsuuiisou"
  | "chinroutou"
  | "ryuuiisou"
  | "chuuren"
  | "suukantsu"
  | "tenhou"
  | "chiihou";

type YakuInfo = {
  name: string;
  japanese: string;
  /** Han closed / open. Open 0 means the hand must be closed. */
  closed: number;
  open: number;
  yakuman?: boolean;
  /** For new players: what the hand needs. */
  about: string;
};

export const YAKU: Record<YakuId, YakuInfo> = {
  riichi: {
    name: "Riichi",
    japanese: "立直",
    closed: 1,
    open: 0,
    about: "Declare ready with a closed hand and put up a 1,000-point stick.",
  },
  double_riichi: {
    name: "Double Riichi",
    japanese: "ダブル立直",
    closed: 2,
    open: 0,
    about: "Riichi on your very first discard, before anyone has called.",
  },
  ippatsu: {
    name: "Ippatsu",
    japanese: "一発",
    closed: 1,
    open: 0,
    about:
      "Win within one go-around of declaring riichi, with no calls in between.",
  },
  menzen_tsumo: {
    name: "Fully Concealed Self-Draw",
    japanese: "門前清自摸和",
    closed: 1,
    open: 0,
    about: "Draw your own winning tile with a closed hand.",
  },
  pinfu: {
    name: "Pinfu",
    japanese: "平和",
    closed: 1,
    open: 0,
    about:
      "Closed hand of four runs and a non-value pair, won on a two-sided wait.",
  },
  iipeikou: {
    name: "Pure Double Sequence",
    japanese: "一盃口",
    closed: 1,
    open: 0,
    about: "Two identical runs in the same suit, closed hand.",
  },
  tanyao: {
    name: "All Simples",
    japanese: "断幺九",
    closed: 1,
    open: 1,
    about: "Only tiles 2-8: no terminals (1, 9) and no honors.",
  },
  yakuhai_white: {
    name: "White Dragon",
    japanese: "役牌 白",
    closed: 1,
    open: 1,
    about: "A triplet of White Dragons.",
  },
  yakuhai_green: {
    name: "Green Dragon",
    japanese: "役牌 發",
    closed: 1,
    open: 1,
    about: "A triplet of Green Dragons.",
  },
  yakuhai_red: {
    name: "Red Dragon",
    japanese: "役牌 中",
    closed: 1,
    open: 1,
    about: "A triplet of Red Dragons.",
  },
  seat_wind: {
    name: "Seat Wind",
    japanese: "自風牌",
    closed: 1,
    open: 1,
    about: "A triplet of your own seat's wind.",
  },
  round_wind: {
    name: "Round Wind",
    japanese: "場風牌",
    closed: 1,
    open: 1,
    about: "A triplet of the round's wind.",
  },
  haitei: {
    name: "Under the Sea",
    japanese: "海底摸月",
    closed: 1,
    open: 1,
    about: "Win by drawing the very last tile of the wall.",
  },
  houtei: {
    name: "Under the River",
    japanese: "河底撈魚",
    closed: 1,
    open: 1,
    about: "Win on the very last discard of the hand.",
  },
  rinshan: {
    name: "After a Kan",
    japanese: "嶺上開花",
    closed: 1,
    open: 1,
    about: "Win on the replacement tile drawn after a kan.",
  },
  chankan: {
    name: "Robbing a Kan",
    japanese: "搶槓",
    closed: 1,
    open: 1,
    about: "Win on the tile someone adds to a pon to make a kan.",
  },
  chiitoitsu: {
    name: "Seven Pairs",
    japanese: "七対子",
    closed: 2,
    open: 0,
    about: "Seven different pairs, closed hand.",
  },
  sanshoku: {
    name: "Mixed Triple Sequence",
    japanese: "三色同順",
    closed: 2,
    open: 1,
    about: "The same run in all three suits, like 345m 345p 345s.",
  },
  ittsu: {
    name: "Pure Straight",
    japanese: "一気通貫",
    closed: 2,
    open: 1,
    about: "123, 456 and 789 in one suit.",
  },
  chanta: {
    name: "Half Outside Hand",
    japanese: "混全帯幺九",
    closed: 2,
    open: 1,
    about:
      "Every set and the pair has a terminal or honor, with at least one run and one honor.",
  },
  toitoi: {
    name: "All Triplets",
    japanese: "対々和",
    closed: 2,
    open: 2,
    about: "Four triplets (or kans) and a pair.",
  },
  sanankou: {
    name: "Three Concealed Triplets",
    japanese: "三暗刻",
    closed: 2,
    open: 2,
    about: "Three triplets you made yourself, not by calling or by ron.",
  },
  sanshoku_doukou: {
    name: "Triple Triplets",
    japanese: "三色同刻",
    closed: 2,
    open: 2,
    about: "A triplet of the same number in all three suits.",
  },
  sankantsu: {
    name: "Three Kans",
    japanese: "三槓子",
    closed: 2,
    open: 2,
    about: "Three kans.",
  },
  honroutou: {
    name: "All Terminals and Honors",
    japanese: "混老頭",
    closed: 2,
    open: 2,
    about: "Only 1s, 9s and honors.",
  },
  shousangen: {
    name: "Little Three Dragons",
    japanese: "小三元",
    closed: 2,
    open: 2,
    about: "Two dragon triplets and a pair of the third dragon.",
  },
  honitsu: {
    name: "Half Flush",
    japanese: "混一色",
    closed: 3,
    open: 2,
    about: "One suit plus honors.",
  },
  junchan: {
    name: "Fully Outside Hand",
    japanese: "純全帯幺九",
    closed: 3,
    open: 2,
    about: "Every set and the pair has a 1 or 9, no honors, at least one run.",
  },
  ryanpeikou: {
    name: "Twice Pure Double Sequence",
    japanese: "二盃口",
    closed: 3,
    open: 0,
    about: "Two pairs of identical runs, closed hand.",
  },
  chinitsu: {
    name: "Full Flush",
    japanese: "清一色",
    closed: 6,
    open: 5,
    about: "Every tile from one suit, no honors.",
  },
  kokushi: {
    name: "Thirteen Orphans",
    japanese: "国士無双",
    closed: 13,
    open: 0,
    yakuman: true,
    about: "One of each terminal and honor, plus a second of any of them.",
  },
  suuankou: {
    name: "Four Concealed Triplets",
    japanese: "四暗刻",
    closed: 13,
    open: 0,
    yakuman: true,
    about: "Four triplets all made yourself.",
  },
  daisangen: {
    name: "Big Three Dragons",
    japanese: "大三元",
    closed: 13,
    open: 13,
    yakuman: true,
    about: "Triplets of all three dragons.",
  },
  shousuushii: {
    name: "Little Four Winds",
    japanese: "小四喜",
    closed: 13,
    open: 13,
    yakuman: true,
    about: "Three wind triplets and a pair of the fourth wind.",
  },
  daisuushii: {
    name: "Big Four Winds",
    japanese: "大四喜",
    closed: 13,
    open: 13,
    yakuman: true,
    about: "Triplets of all four winds.",
  },
  tsuuiisou: {
    name: "All Honors",
    japanese: "字一色",
    closed: 13,
    open: 13,
    yakuman: true,
    about: "Only winds and dragons.",
  },
  chinroutou: {
    name: "All Terminals",
    japanese: "清老頭",
    closed: 13,
    open: 13,
    yakuman: true,
    about: "Only 1s and 9s.",
  },
  ryuuiisou: {
    name: "All Green",
    japanese: "緑一色",
    closed: 13,
    open: 13,
    yakuman: true,
    about: "Only 2, 3, 4, 6, 8 Bamboo and Green Dragons.",
  },
  chuuren: {
    name: "Nine Gates",
    japanese: "九蓮宝燈",
    closed: 13,
    open: 0,
    yakuman: true,
    about: "1112345678999 in one suit plus any tile of that suit, closed.",
  },
  suukantsu: {
    name: "Four Kans",
    japanese: "四槓子",
    closed: 13,
    open: 13,
    yakuman: true,
    about: "Four kans.",
  },
  tenhou: {
    name: "Blessing of Heaven",
    japanese: "天和",
    closed: 13,
    open: 0,
    yakuman: true,
    about: "The dealer wins on their first draw.",
  },
  chiihou: {
    name: "Blessing of Earth",
    japanese: "地和",
    closed: 13,
    open: 0,
    yakuman: true,
    about: "A non-dealer wins on their first draw, before any call.",
  },
};

export type RiichiWin = {
  /** Concealed tiles including the winning tile. */
  concealed: Tile[];
  melds: Meld[];
  winTile: Tile;
  tsumo: boolean;
  seatWind: Kind;
  roundWind: Kind;
  riichi?: boolean;
  doubleRiichi?: boolean;
  ippatsu?: boolean;
  /** Won on the last tile: haitei by tsumo, houtei by ron. */
  lastTile?: boolean;
  rinshan?: boolean;
  chankan?: boolean;
  /** First draw of the hand, uninterrupted: tenhou for the dealer, chiihou otherwise. */
  firstDraw?: boolean;
  doraIndicators?: Tile[];
  uraIndicators?: Tile[];
};

export type ScoredYaku = { id: YakuId; han: number; times?: number };

export type FuPart = { reason: string; fu: number };

export type RiichiScore = {
  yaku: ScoredYaku[];
  /** Han from yaku. */
  yakuHan: number;
  dora: number;
  ura: number;
  red: number;
  /** Total han including dora; 0 for yakuman. */
  han: number;
  fu: number;
  fuParts: FuPart[];
  /** Yakuman multiples (2 for a double yakuman). 0 if none. */
  yakuman: number;
  limit:
    | ""
    | "mangan"
    | "haneman"
    | "baiman"
    | "sanbaiman"
    | "kazoe yakuman"
    | "yakuman";
  /** Base points, before the dealer/ron multipliers. */
  base: number;
  payment: Payment;
};

export type Payment = {
  /** What the discarder pays on ron (before honba). */
  ron: number;
  /** On tsumo: what the dealer pays (non-dealer win), and each non-dealer pays. */
  tsumoDealer: number;
  tsumoOther: number;
};

const roundUp = (n: number, to: number) => Math.ceil(n / to) * to;

export const limitName = (han: number, fu: number): RiichiScore["limit"] => {
  if (han >= 13) return "kazoe yakuman";
  if (han >= 11) return "sanbaiman";
  if (han >= 8) return "baiman";
  if (han >= 6) return "haneman";
  if (han >= 5 || fu * 2 ** (han + 2) >= 2000) return "mangan";
  return "";
};

export const basePoints = (
  han: number,
  fu: number,
  yakuman: number,
): number => {
  if (yakuman > 0) return 8000 * yakuman;
  const limit = limitName(han, fu);
  switch (limit) {
    case "kazoe yakuman":
      return 8000;
    case "sanbaiman":
      return 6000;
    case "baiman":
      return 4000;
    case "haneman":
      return 3000;
    case "mangan":
      return 2000;
    default:
      return fu * 2 ** (han + 2);
  }
};

export const paymentFor = (base: number, dealer: boolean): Payment => ({
  ron: roundUp(base * (dealer ? 6 : 4), 100),
  tsumoDealer: roundUp(base * 2, 100),
  tsumoOther: roundUp(base * (dealer ? 2 : 1), 100),
});

/** What the whole table pays the winner, before honba and riichi sticks. */
export const totalFor = (p: Payment, tsumo: boolean, dealer: boolean) =>
  !tsumo ? p.ron : dealer ? p.tsumoOther * 3 : p.tsumoDealer + p.tsumoOther * 2;

type Wait = "ryanmen" | "kanchan" | "penchan" | "shanpon" | "tanki";

/** A set in the finished hand, called or concealed. */
type Set = {
  type: "chi" | "pon" | "kan";
  kind: Kind;
  /** Concealed for fu and for "concealed triplet": made without a call or ron. */
  concealed: boolean;
  /** Part of the closed hand (not a called meld). Closed kans count. */
  closedHand: boolean;
};

const countDora = (tiles: Tile[], indicators: Tile[]): number => {
  const doraKinds = indicators.map((t) => doraFromIndicator(kindOf(t)));
  let n = 0;
  for (const t of tiles) {
    const k = kindOf(t);
    for (const d of doraKinds) if (d === k) n++;
  }
  return n;
};

const NINE_GATES = [3, 1, 1, 1, 1, 1, 1, 1, 3];

/**
 * Scores a winning hand. Returns null if the hand is not complete or has no
 * yaku - dora alone never makes a hand.
 */
export const scoreRiichi = (win: RiichiWin): RiichiScore | null => {
  const counts = toCounts(win.concealed);
  const winKind = kindOf(win.winTile);
  const dealer = win.seatWind === WINDS[0];
  const open = win.melds.some((m) => m.open);
  const allTiles = [...win.concealed, ...win.melds.flatMap((m) => m.tiles)];
  const allCounts = toCounts(allTiles);
  const firstDrawYakuman: ScoredYaku[] =
    win.firstDraw && win.tsumo && win.melds.length === 0
      ? [{ id: dealer ? "tenhou" : "chiihou", han: 13 }]
      : [];

  const situational = (): ScoredYaku[] => {
    const y: ScoredYaku[] = [];
    if (win.doubleRiichi) y.push({ id: "double_riichi", han: 2 });
    else if (win.riichi) y.push({ id: "riichi", han: 1 });
    if (win.ippatsu && (win.riichi || win.doubleRiichi))
      y.push({ id: "ippatsu", han: 1 });
    if (win.tsumo && !open) y.push({ id: "menzen_tsumo", han: 1 });
    if (win.lastTile && !win.rinshan)
      y.push({ id: win.tsumo ? "haitei" : "houtei", han: 1 });
    if (win.rinshan && win.tsumo) y.push({ id: "rinshan", han: 1 });
    if (win.chankan && !win.tsumo) y.push({ id: "chankan", han: 1 });
    return y;
  };

  // Tile-colour yaku that only care which tiles are in the hand.
  const colourYaku = (): ScoredYaku[] => {
    const y: ScoredYaku[] = [];
    const kinds = allCounts.flatMap((n, k) => (n > 0 ? [k] : []));
    const suits = new globalThis.Set(
      kinds.filter((k) => k < 27).map((k) => Math.floor(k / 9)),
    );
    const honors = kinds.some((k) => isHonor(k));
    if (kinds.every((k) => !isTerminalOrHonor(k)))
      y.push({ id: "tanyao", han: 1 });
    if (suits.size === 1 && !honors)
      y.push({ id: "chinitsu", han: open ? 5 : 6 });
    else if (suits.size === 1 && honors)
      y.push({ id: "honitsu", han: open ? 2 : 3 });
    if (kinds.every((k) => isTerminalOrHonor(k)) && honors && suits.size > 0)
      y.push({ id: "honroutou", han: 2 });
    return y;
  };

  const colourYakuman = (): ScoredYaku[] => {
    const kinds = allCounts.flatMap((n, k) => (n > 0 ? [k] : []));
    const y: ScoredYaku[] = [];
    if (kinds.every((k) => isHonor(k))) y.push({ id: "tsuuiisou", han: 13 });
    if (kinds.every((k) => k < 27 && (k % 9 === 0 || k % 9 === 8)))
      y.push({ id: "chinroutou", han: 13 });
    const greens = new globalThis.Set([19, 20, 21, 23, 25, GREEN]);
    if (kinds.every((k) => greens.has(k))) y.push({ id: "ryuuiisou", han: 13 });
    return y;
  };

  const finish = (
    yaku: ScoredYaku[],
    fu: number,
    fuParts: FuPart[],
  ): RiichiScore | null => {
    const yakumanList = yaku.filter((y) => YAKU[y.id].yakuman);
    if (yakumanList.length) {
      const multiple = yakumanList.reduce((n, y) => n + (y.times ?? 1), 0);
      const base = basePoints(0, 0, multiple);
      return {
        yaku: yakumanList,
        yakuHan: 0,
        dora: 0,
        ura: 0,
        red: 0,
        han: 0,
        fu,
        fuParts,
        yakuman: multiple,
        limit: "yakuman",
        base,
        payment: paymentFor(base, dealer),
      };
    }
    if (yaku.length === 0) return null;
    const yakuHan = yaku.reduce((n, y) => n + y.han, 0);
    const dora = countDora(allTiles, win.doraIndicators ?? []);
    const ura =
      win.riichi || win.doubleRiichi
        ? countDora(allTiles, win.uraIndicators ?? [])
        : 0;
    const red = allTiles.filter(isRed).length;
    const han = yakuHan + dora + ura + red;
    const base = basePoints(han, fu, 0);
    return {
      yaku,
      yakuHan,
      dora,
      ura,
      red,
      han,
      fu,
      fuParts,
      yakuman: 0,
      limit: limitName(han, fu),
      base,
      payment: paymentFor(base, dealer),
    };
  };

  const candidates: RiichiScore[] = [];

  // Thirteen orphans.
  if (win.melds.length === 0 && isThirteenOrphans(counts)) {
    const thirteenSided = counts[winKind] === 2;
    const y: ScoredYaku[] = [
      { id: "kokushi", han: 13, times: thirteenSided ? 2 : 1 },
      ...firstDrawYakuman,
    ];
    const s = finish(y, 0, []);
    if (s) candidates.push(s);
  }

  // Seven pairs: always 25 fu.
  if (win.melds.length === 0 && isSevenPairs(counts)) {
    const yakuman = [
      ...colourYakuman().filter((y) => y.id === "tsuuiisou"),
      ...firstDrawYakuman,
    ];
    const y: ScoredYaku[] = yakuman.length
      ? yakuman
      : [{ id: "chiitoitsu", han: 2 }, ...situational(), ...colourYaku()];
    const s = finish(y, 25, [{ reason: "Seven pairs", fu: 25 }]);
    if (s) candidates.push(s);
  }

  // Standard hands: every reading, every set the winning tile could have finished.
  for (const reading of readings(counts)) {
    for (const placement of placements(reading, winKind)) {
      const s = scoreReading(win, reading, placement, {
        dealer,
        open,
        situational,
        colourYaku,
        colourYakuman,
        firstDrawYakuman,
        counts,
        finish,
      });
      if (s) candidates.push(s);
    }
  }

  if (!candidates.length) return null;
  return candidates.reduce((best, c) => {
    const a = totalFor(best.payment, win.tsumo, dealer);
    const b = totalFor(c.payment, win.tsumo, dealer);
    if (b !== a) return b > a ? c : best;
    if (c.han !== best.han) return c.han > best.han ? c : best;
    return c.fu > best.fu ? c : best;
  });
};

type Placement = { wait: Wait; group: number };

/** Each set (or the pair, group -1) the winning tile could have completed. */
const placements = (reading: Reading, winKind: Kind): Placement[] => {
  const out: Placement[] = [];
  if (reading.pair === winKind) out.push({ wait: "tanki", group: -1 });
  const seen = new globalThis.Set<string>();
  reading.groups.forEach((g, i) => {
    let wait: Wait | null = null;
    if (g.type === "pon" && g.kind === winKind) wait = "shanpon";
    if (g.type === "chi" && winKind >= g.kind && winKind <= g.kind + 2) {
      const pos = winKind - g.kind;
      const start = g.kind % 9;
      if (pos === 1) wait = "kanchan";
      else if (pos === 0) wait = start === 6 ? "penchan" : "ryanmen";
      else wait = start === 0 ? "penchan" : "ryanmen";
    }
    if (!wait) return;
    const key = `${g.type}${g.kind}${wait}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ wait, group: i });
  });
  return out;
};

type ReadingContext = {
  dealer: boolean;
  open: boolean;
  situational: () => ScoredYaku[];
  colourYaku: () => ScoredYaku[];
  colourYakuman: () => ScoredYaku[];
  firstDrawYakuman: ScoredYaku[];
  counts: number[];
  finish: (y: ScoredYaku[], fu: number, parts: FuPart[]) => RiichiScore | null;
};

const scoreReading = (
  win: RiichiWin,
  reading: Reading,
  placement: Placement,
  ctx: ReadingContext,
): RiichiScore | null => {
  const { open } = ctx;
  const winKind = kindOf(win.winTile);

  const sets: Set[] = [
    ...reading.groups.map((g, i) => ({
      type: g.type,
      kind: g.kind,
      // A triplet finished by someone else's discard counts as open.
      concealed: !(g.type === "pon" && i === placement.group && !win.tsumo),
      closedHand: true,
    })),
    ...win.melds.map((m) => ({
      type: m.type,
      kind: Math.min(...m.tiles.map(kindOf)),
      concealed: !m.open,
      closedHand: !m.open,
    })),
  ];
  const pair = reading.pair;
  const triplets = sets.filter((s) => s.type !== "chi");
  const runs = sets.filter((s) => s.type === "chi");
  const kans = sets.filter((s) => s.type === "kan");
  const concealedTriplets = triplets.filter((s) => s.concealed).length;
  const isValuePair = (k: Kind) =>
    isDragon(k) || k === win.seatWind || k === win.roundWind;

  // --- Yakuman -------------------------------------------------------------
  const yakuman: ScoredYaku[] = [
    ...ctx.firstDrawYakuman,
    ...ctx.colourYakuman(),
  ];
  if (concealedTriplets === 4)
    yakuman.push({
      id: "suuankou",
      han: 13,
      times: placement.wait === "tanki" ? 2 : 1,
    });
  const dragonTriplets = triplets.filter((s) => isDragon(s.kind)).length;
  if (dragonTriplets === 3) yakuman.push({ id: "daisangen", han: 13 });
  const windTriplets = triplets.filter((s) => isWind(s.kind)).length;
  if (windTriplets === 4) yakuman.push({ id: "daisuushii", han: 13, times: 2 });
  else if (windTriplets === 3 && isWind(pair))
    yakuman.push({ id: "shousuushii", han: 13 });
  if (kans.length === 4) yakuman.push({ id: "suukantsu", han: 13 });
  if (win.melds.length === 0) {
    const suit = Math.floor(winKind / 9);
    if (
      winKind < 27 &&
      ctx.counts.every((n, k) => n === 0 || Math.floor(k / 9) === suit)
    ) {
      const nums = ctx.counts.slice(suit * 9, suit * 9 + 9);
      if (nums.every((n, i) => n >= NINE_GATES[i])) {
        const before = [...nums];
        before[winKind % 9]--;
        const pure = before.every((n, i) => n === NINE_GATES[i]);
        yakuman.push({ id: "chuuren", han: 13, times: pure ? 2 : 1 });
      }
    }
  }
  if (yakuman.length) return ctx.finish(yakuman, 0, []);

  // --- Pinfu decides how fu is counted ---------------------------------------
  const pinfu =
    !open &&
    win.melds.length === 0 &&
    runs.length === 4 &&
    !isValuePair(pair) &&
    placement.wait === "ryanmen";

  // --- Regular yaku --------------------------------------------------------
  const yaku: ScoredYaku[] = [...ctx.situational(), ...ctx.colourYaku()];
  if (pinfu) yaku.push({ id: "pinfu", han: 1 });

  for (const s of triplets) {
    if (s.kind === DRAGONS[0]) yaku.push({ id: "yakuhai_white", han: 1 });
    if (s.kind === DRAGONS[1]) yaku.push({ id: "yakuhai_green", han: 1 });
    if (s.kind === DRAGONS[2]) yaku.push({ id: "yakuhai_red", han: 1 });
    if (s.kind === win.seatWind) yaku.push({ id: "seat_wind", han: 1 });
    if (s.kind === win.roundWind) yaku.push({ id: "round_wind", han: 1 });
  }

  if (!open) {
    const runCounts = new Map<number, number>();
    for (const r of runs)
      runCounts.set(r.kind, (runCounts.get(r.kind) ?? 0) + 1);
    let doubles = 0;
    for (const n of runCounts.values()) doubles += Math.floor(n / 2);
    if (doubles >= 2) yaku.push({ id: "ryanpeikou", han: 3 });
    else if (doubles === 1) yaku.push({ id: "iipeikou", han: 1 });
  }

  const runStarts = new globalThis.Set(runs.map((r) => r.kind));
  for (let n = 0; n < 7; n++) {
    if (runStarts.has(n) && runStarts.has(9 + n) && runStarts.has(18 + n)) {
      yaku.push({ id: "sanshoku", han: open ? 1 : 2 });
      break;
    }
  }
  for (let s = 0; s < 3; s++) {
    const b = s * 9;
    if (runStarts.has(b) && runStarts.has(b + 3) && runStarts.has(b + 6)) {
      yaku.push({ id: "ittsu", han: open ? 1 : 2 });
      break;
    }
  }
  const tripletKinds = new globalThis.Set(triplets.map((t) => t.kind));
  for (let n = 0; n < 9; n++) {
    if (
      tripletKinds.has(n) &&
      tripletKinds.has(9 + n) &&
      tripletKinds.has(18 + n)
    ) {
      yaku.push({ id: "sanshoku_doukou", han: 2 });
      break;
    }
  }

  const outside = (s: Set) =>
    s.type === "chi"
      ? s.kind % 9 === 0 || s.kind % 9 === 6
      : isTerminalOrHonor(s.kind);
  if (runs.length > 0 && sets.every(outside) && isTerminalOrHonor(pair)) {
    const honors = isHonor(pair) || sets.some((s) => isHonor(s.kind));
    yaku.push(
      honors
        ? { id: "chanta", han: open ? 1 : 2 }
        : { id: "junchan", han: open ? 2 : 3 },
    );
  }

  if (triplets.length === 4) yaku.push({ id: "toitoi", han: 2 });
  if (concealedTriplets === 3) yaku.push({ id: "sanankou", han: 2 });
  if (kans.length === 3) yaku.push({ id: "sankantsu", han: 2 });
  if (dragonTriplets === 2 && isDragon(pair))
    yaku.push({ id: "shousangen", han: 2 });

  // --- Fu ------------------------------------------------------------------
  const fuParts: FuPart[] = [];
  let fu: number;
  if (pinfu && win.tsumo) {
    fu = 20;
    fuParts.push({ reason: "Pinfu self-draw", fu: 20 });
  } else {
    fuParts.push({ reason: "Base", fu: 20 });
    if (!open && !win.tsumo) fuParts.push({ reason: "Closed ron", fu: 10 });
    if (win.tsumo && !pinfu) fuParts.push({ reason: "Self-draw", fu: 2 });
    if (isDragon(pair)) fuParts.push({ reason: "Dragon pair", fu: 2 });
    if (pair === win.seatWind)
      fuParts.push({ reason: "Seat wind pair", fu: 2 });
    if (pair === win.roundWind)
      fuParts.push({ reason: "Round wind pair", fu: 2 });
    for (const s of triplets) {
      let f = s.type === "kan" ? 8 : 2;
      if (s.concealed) f *= 2;
      if (isTerminalOrHonor(s.kind)) f *= 2;
      const what = `${s.concealed ? "concealed" : "open"} ${s.type === "kan" ? "kan" : "triplet"}`;
      fuParts.push({
        reason: `${what[0].toUpperCase()}${what.slice(1)} of ${isTerminalOrHonor(s.kind) ? "terminals/honors" : "simples"}`,
        fu: f,
      });
    }
    if (placement.wait === "kanchan")
      fuParts.push({ reason: "Middle wait", fu: 2 });
    if (placement.wait === "penchan")
      fuParts.push({ reason: "Edge wait", fu: 2 });
    if (placement.wait === "tanki")
      fuParts.push({ reason: "Pair wait", fu: 2 });
    const raw = fuParts.reduce((n, p) => n + p.fu, 0);
    fu = roundUp(raw, 10);
    if (fu === 20) {
      // An open hand with nothing but runs and a plain pair: 30 fu.
      fu = 30;
      fuParts.push({ reason: "Open hand minimum", fu: 10 });
    }
  }

  return ctx.finish(yaku, fu, fuParts);
};

/** Points the winner collects, with honba (300 per counter) and riichi sticks. */
export const settleRiichi = (
  score: RiichiScore,
  opts: { dealer: boolean; tsumo: boolean; honba: number },
): { fromDiscarder: number; fromDealer: number; fromEach: number } => {
  const p = score.payment;
  if (!opts.tsumo)
    return {
      fromDiscarder: p.ron + 300 * opts.honba,
      fromDealer: 0,
      fromEach: 0,
    };
  return {
    fromDiscarder: 0,
    fromDealer: opts.dealer ? 0 : p.tsumoDealer + 100 * opts.honba,
    fromEach: p.tsumoOther + 100 * opts.honba,
  };
};

/** Nagashi mangan: every discard a terminal or honor, and none of them called. */
export const isNagashi = (discards: Tile[], anyCalled: boolean): boolean =>
  !anyCalled &&
  discards.length > 0 &&
  discards.every((t) => isTerminalOrHonor(kindOf(t)));

/** Kyuushu kyuuhai: nine or more different terminals/honors in a starting 14. */
export const nineTerminals = (tiles: Tile[]): boolean => {
  const counts = toCounts(tiles);
  return ORPHANS.filter((k) => counts[k] > 0).length >= 9;
};

export const numberLabel = numberOf;
