import {
  isSevenPairs,
  isThirteenOrphans,
  readings,
  type Meld,
  type Reading,
} from "./hand";
import {
  EAST,
  isDragon,
  isHonor,
  isTerminal,
  isTerminalOrHonor,
  isWind,
  kindOf,
  toCounts,
  type Kind,
  type Tile,
} from "./tiles";

/**
 * Hong Kong (Cantonese) old-style scoring in faan.
 *
 * - A hand needs at least 3 faan to win (a "chicken hand" can't go out).
 * - Limit hands are worth 13 faan; nothing scores more.
 * - Flowers count: a bonus faan for none at all, one for each flower or season
 *   matching your seat, two for a full set of four.
 * - Payment is "half-shoot": on a discard win the discarder pays double the
 *   table value and the other two pay it once; on self-draw all three pay
 *   double. The table doubles each faan to 4, then rises by half-steps.
 *
 * House rules vary more in Hong Kong than anywhere; these are the ones
 * written up most often, and they are spelled out in /mahjong rules.
 */

export const HK_MIN_FAAN = 3;
export const HK_LIMIT = 13;

/** Table value by faan, 0-13 ("half-spicy" 半辣上). */
export const HK_TABLE = [
  1, 2, 4, 8, 16, 24, 32, 48, 64, 96, 128, 192, 256, 384,
];

export type HkFaanId =
  | "self_drawn"
  | "concealed"
  | "no_flowers"
  | "seat_flower"
  | "flower_set"
  | "dragon_pung"
  | "seat_wind"
  | "prevailing_wind"
  | "all_chows"
  | "all_pungs"
  | "mixed_one_suit"
  | "pure_one_suit"
  | "mixed_terminals"
  | "small_dragons"
  | "small_winds"
  | "seven_pairs"
  | "last_tile"
  | "kong_replacement"
  | "robbing_kong"
  // Limits
  | "big_dragons"
  | "big_winds"
  | "all_honors"
  | "all_terminals"
  | "thirteen_orphans"
  | "nine_gates"
  | "concealed_pungs"
  | "four_kongs"
  | "heavenly"
  | "earthly"
  | "eight_flowers";

type FaanInfo = {
  name: string;
  chinese: string;
  faan: number;
  limit?: boolean;
  about: string;
};

export const HK_FAAN: Record<HkFaanId, FaanInfo> = {
  self_drawn: {
    name: "Self-Drawn",
    chinese: "自摸",
    faan: 1,
    about: "Draw your own winning tile.",
  },
  concealed: {
    name: "Concealed Hand",
    chinese: "門前清",
    faan: 1,
    about: "No chow, pung or open kong called from others.",
  },
  no_flowers: {
    name: "No Flowers",
    chinese: "無花",
    faan: 1,
    about: "You drew no flowers or seasons at all.",
  },
  seat_flower: {
    name: "Seat Flower",
    chinese: "正花",
    faan: 1,
    about:
      "A flower or season numbered for your seat (East 1, South 2, West 3, North 4).",
  },
  flower_set: {
    name: "Set of Flowers",
    chinese: "一台花",
    faan: 2,
    about: "All four flowers, or all four seasons.",
  },
  dragon_pung: {
    name: "Dragon Pung",
    chinese: "三元牌",
    faan: 1,
    about: "A pung (or kong) of any dragon.",
  },
  seat_wind: {
    name: "Seat Wind",
    chinese: "門風",
    faan: 1,
    about: "A pung of your own seat's wind.",
  },
  prevailing_wind: {
    name: "Prevailing Wind",
    chinese: "圈風",
    faan: 1,
    about: "A pung of the round's wind.",
  },
  all_chows: {
    name: "All Chows",
    chinese: "平糊",
    faan: 1,
    about: "Four chows (runs) and a pair.",
  },
  all_pungs: {
    name: "All Pungs",
    chinese: "對對糊",
    faan: 3,
    about: "Four pungs or kongs and a pair.",
  },
  mixed_one_suit: {
    name: "Mixed One Suit",
    chinese: "混一色",
    faan: 3,
    about: "One suit plus honors.",
  },
  pure_one_suit: {
    name: "Pure One Suit",
    chinese: "清一色",
    faan: 7,
    about: "Every tile from one suit.",
  },
  mixed_terminals: {
    name: "Mixed Terminals",
    chinese: "混么九",
    faan: 1,
    about: "Only 1s, 9s and honors.",
  },
  small_dragons: {
    name: "Small Three Dragons",
    chinese: "小三元",
    faan: 5,
    about:
      "Pungs of two dragons and a pair of the third (includes those pungs).",
  },
  small_winds: {
    name: "Small Four Winds",
    chinese: "小四喜",
    faan: 6,
    about:
      "Pungs of three winds and a pair of the fourth (includes those pungs).",
  },
  seven_pairs: {
    name: "Seven Pairs",
    chinese: "七對子",
    faan: 4,
    about: "Seven different pairs, concealed.",
  },
  last_tile: {
    name: "Last Tile",
    chinese: "海底撈月",
    faan: 1,
    about: "Win on the very last tile of the wall.",
  },
  kong_replacement: {
    name: "Win on a Replacement",
    chinese: "槓上開花",
    faan: 1,
    about: "Win on the tile drawn after a kong or a flower.",
  },
  robbing_kong: {
    name: "Robbing a Kong",
    chinese: "搶槓",
    faan: 1,
    about: "Win on the tile someone adds to their pung.",
  },
  big_dragons: {
    name: "Great Dragons",
    chinese: "大三元",
    faan: 13,
    limit: true,
    about: "Pungs of all three dragons.",
  },
  big_winds: {
    name: "Great Winds",
    chinese: "大四喜",
    faan: 13,
    limit: true,
    about: "Pungs of all four winds.",
  },
  all_honors: {
    name: "All Honors",
    chinese: "字一色",
    faan: 13,
    limit: true,
    about: "Only winds and dragons.",
  },
  all_terminals: {
    name: "All Terminals",
    chinese: "清么九",
    faan: 13,
    limit: true,
    about: "Only 1s and 9s.",
  },
  thirteen_orphans: {
    name: "Thirteen Orphans",
    chinese: "十三么",
    faan: 13,
    limit: true,
    about: "One of each terminal and honor plus one more of any.",
  },
  nine_gates: {
    name: "Nine Gates",
    chinese: "九子連環",
    faan: 13,
    limit: true,
    about: "1112345678999 in one suit plus one more, concealed.",
  },
  concealed_pungs: {
    name: "All Concealed Pungs",
    chinese: "坎坎糊",
    faan: 13,
    limit: true,
    about: "Four pungs all made yourself, won by self-draw.",
  },
  four_kongs: {
    name: "Four Kongs",
    chinese: "十八羅漢",
    faan: 13,
    limit: true,
    about: "Four kongs.",
  },
  heavenly: {
    name: "Heavenly Hand",
    chinese: "天糊",
    faan: 13,
    limit: true,
    about: "The dealer wins with the starting hand.",
  },
  earthly: {
    name: "Earthly Hand",
    chinese: "地糊",
    faan: 13,
    limit: true,
    about: "Win on the dealer's first discard, or your own first draw.",
  },
  eight_flowers: {
    name: "Eight Flowers",
    chinese: "八仙過海",
    faan: 13,
    limit: true,
    about: "Collect all eight flowers and seasons.",
  },
};

export type HkWin = {
  concealed: Tile[];
  melds: Meld[];
  winTile: Tile;
  tsumo: boolean;
  seatWind: Kind;
  roundWind: Kind;
  flowers: Tile[];
  lastTile?: boolean;
  replacement?: boolean;
  robbingKong?: boolean;
  /** First draw (dealer) or first discard/draw (others) with no calls yet. */
  firstTurn?: boolean;
};

export type HkScore = {
  faan: { id: HkFaanId; faan: number; times?: number }[];
  /** Total, capped at the limit. */
  total: number;
  limit: boolean;
  /** Table value. */
  value: number;
  /** On ron: discarder pays `fromDiscarder`, the others `fromOther`. On tsumo: each pays `fromOther`. */
  fromDiscarder: number;
  fromOther: number;
};

export const hkValue = (faan: number) => HK_TABLE[Math.min(faan, HK_LIMIT)];

export const hkPayment = (faan: number, tsumo: boolean) => {
  const v = hkValue(faan);
  return tsumo
    ? { fromDiscarder: 0, fromOther: v * 2 }
    : { fromDiscarder: v * 2, fromOther: v };
};

type Set = { type: "chi" | "pon" | "kan"; kind: Kind; concealed: boolean };

/**
 * Scores a Hong Kong hand at its best reading. Returns the score even below
 * the minimum, so the hints can say how far short a hand is; `meetsMinimum`
 * decides whether it may be declared.
 */
export const scoreHongKong = (win: HkWin): HkScore | null => {
  const counts = toCounts(win.concealed);
  const winKind = kindOf(win.winTile);
  const open = win.melds.some((m) => m.open);
  const allCounts = toCounts([
    ...win.concealed,
    ...win.melds.flatMap((m) => m.tiles),
  ]);
  const kinds = allCounts.flatMap((n, k) => (n > 0 ? [k] : []));
  const dealer = win.seatWind === EAST;

  const common = (): HkScore["faan"] => {
    const f: HkScore["faan"] = [];
    if (win.tsumo) f.push({ id: "self_drawn", faan: 1 });
    if (!open) f.push({ id: "concealed", faan: 1 });
    if (win.flowers.length === 0) f.push({ id: "no_flowers", faan: 1 });
    const seat = win.seatWind - EAST;
    const nums = new globalThis.Set(win.flowers.map((t) => Number(t[0])));
    for (const group of [0, 4]) {
      const full = [1, 2, 3, 4].every((n) => nums.has(group + n));
      if (full) f.push({ id: "flower_set", faan: 2 });
      else if (nums.has(group + seat + 1))
        f.push({ id: "seat_flower", faan: 1 });
    }
    if (win.lastTile) f.push({ id: "last_tile", faan: 1 });
    if (win.replacement && win.tsumo)
      f.push({ id: "kong_replacement", faan: 1 });
    if (win.robbingKong && !win.tsumo) f.push({ id: "robbing_kong", faan: 1 });
    const suits = new globalThis.Set(
      kinds.filter((k) => k < 27).map((k) => Math.floor(k / 9)),
    );
    const honors = kinds.some(isHonor);
    if (suits.size === 1 && !honors) f.push({ id: "pure_one_suit", faan: 7 });
    else if (suits.size === 1 && honors)
      f.push({ id: "mixed_one_suit", faan: 3 });
    if (kinds.every(isTerminalOrHonor) && honors && suits.size > 0)
      f.push({ id: "mixed_terminals", faan: 1 });
    return f;
  };

  const commonLimits = (): HkScore["faan"] => {
    const f: HkScore["faan"] = [];
    if (win.firstTurn && win.melds.length === 0) {
      if (dealer && win.tsumo) f.push({ id: "heavenly", faan: 13 });
      if (!dealer) f.push({ id: "earthly", faan: 13 });
    }
    if (win.flowers.length === 8) f.push({ id: "eight_flowers", faan: 13 });
    if (kinds.every(isHonor)) f.push({ id: "all_honors", faan: 13 });
    if (kinds.every(isTerminal)) f.push({ id: "all_terminals", faan: 13 });
    return f;
  };

  const finish = (faan: HkScore["faan"]): HkScore => {
    const limits = faan.filter((f) => HK_FAAN[f.id].limit);
    const list = limits.length ? limits : faan;
    const raw = list.reduce((n, f) => n + f.faan, 0);
    const total = Math.min(raw, HK_LIMIT);
    const pay = hkPayment(total, win.tsumo);
    return {
      faan: list,
      total,
      limit: total >= HK_LIMIT,
      value: hkValue(total),
      ...pay,
    };
  };

  const candidates: HkScore[] = [];

  if (win.melds.length === 0 && isThirteenOrphans(counts))
    candidates.push(
      finish([{ id: "thirteen_orphans", faan: 13 }, ...commonLimits()]),
    );

  if (win.melds.length === 0 && isSevenPairs(counts))
    candidates.push(
      finish([{ id: "seven_pairs", faan: 4 }, ...common(), ...commonLimits()]),
    );

  for (const reading of readings(counts)) {
    const winSlots = slotsFor(reading, winKind);
    for (const slot of winSlots) {
      candidates.push(
        finish(readingFaan(win, reading, slot, counts, common, commonLimits)),
      );
    }
  }

  if (!candidates.length) return null;
  return candidates.reduce((best, c) => (c.total > best.total ? c : best));
};

/** Which group the winning tile went into (-1 = the pair). */
const slotsFor = (reading: Reading, winKind: Kind): number[] => {
  const out: number[] = [];
  if (reading.pair === winKind) out.push(-1);
  reading.groups.forEach((g, i) => {
    if (
      g.kind === winKind ||
      (g.type === "chi" && winKind > g.kind && winKind <= g.kind + 2)
    )
      out.push(i);
  });
  return out;
};

const NINE_GATES = [3, 1, 1, 1, 1, 1, 1, 1, 3];

const readingFaan = (
  win: HkWin,
  reading: Reading,
  slot: number,
  counts: number[],
  common: () => HkScore["faan"],
  commonLimits: () => HkScore["faan"],
): HkScore["faan"] => {
  const sets: Set[] = [
    ...reading.groups.map((g, i) => ({
      type: g.type,
      kind: g.kind,
      concealed: !(g.type === "pon" && i === slot && !win.tsumo),
    })),
    ...win.melds.map((m) => ({
      type: m.type,
      kind: Math.min(...m.tiles.map(kindOf)),
      concealed: !m.open,
    })),
  ];
  const pair = reading.pair;
  const pungs = sets.filter((s) => s.type !== "chi");
  const dragonPungs = pungs.filter((s) => isDragon(s.kind));
  const windPungs = pungs.filter((s) => isWind(s.kind));

  const limits = commonLimits();
  if (dragonPungs.length === 3) limits.push({ id: "big_dragons", faan: 13 });
  if (windPungs.length === 4) limits.push({ id: "big_winds", faan: 13 });
  if (pungs.length === 4 && pungs.every((s) => s.concealed) && win.tsumo)
    limits.push({ id: "concealed_pungs", faan: 13 });
  if (sets.filter((s) => s.type === "kan").length === 4)
    limits.push({ id: "four_kongs", faan: 13 });
  if (win.melds.length === 0 && win.winTile[1] !== "z") {
    const suit = Math.floor(kindOf(win.winTile) / 9);
    if (counts.every((n, k) => n === 0 || Math.floor(k / 9) === suit)) {
      const nums = counts.slice(suit * 9, suit * 9 + 9);
      if (nums.every((n, i) => n >= NINE_GATES[i]))
        limits.push({ id: "nine_gates", faan: 13 });
    }
  }
  if (limits.length) return limits;

  const f = common();
  const smallDragons = dragonPungs.length === 2 && isDragon(pair);
  const smallWinds = windPungs.length === 3 && isWind(pair);
  if (smallDragons) f.push({ id: "small_dragons", faan: 5 });
  if (smallWinds) f.push({ id: "small_winds", faan: 6 });
  if (!smallDragons)
    dragonPungs.forEach(() => f.push({ id: "dragon_pung", faan: 1 }));
  if (!smallWinds) {
    for (const s of windPungs) {
      if (s.kind === win.seatWind) f.push({ id: "seat_wind", faan: 1 });
      if (s.kind === win.roundWind) f.push({ id: "prevailing_wind", faan: 1 });
    }
  }
  if (pungs.length === 4) f.push({ id: "all_pungs", faan: 3 });
  if (sets.every((s) => s.type === "chi")) f.push({ id: "all_chows", faan: 1 });
  return f;
};

export const meetsMinimum = (score: HkScore | null, minimum = HK_MIN_FAAN) =>
  !!score && score.total >= minimum;
