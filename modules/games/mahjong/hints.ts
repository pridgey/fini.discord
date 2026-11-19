import { chooseTurn, visibleTo } from "./bot";
import {
  claimOptions,
  inFuriten,
  roundWindKind,
  seatWind,
  turnOptions,
  type GameState,
  type HandResult,
  type WinDetail,
} from "./game";
import { groupHand } from "./grouping";
import { shanten, unseen, waits } from "./hand";
import { HK_FAAN, HK_MIN_FAAN, scoreHongKong } from "./hongkong";
import { YAKU, scoreRiichi } from "./riichi";
import {
  kindOf,
  numberOf,
  tileName,
  tileOf,
  toCounts,
  type Kind,
  type Tile,
} from "./tiles";

/**
 * What to tell a player, kept short. Each situation gets a title (what to do
 * now), a headline drawn on the hand picture (how close the hand is), and at
 * most three tips in plain words. The picture does the rest: sets, the pair,
 * half-sets and loose tiles are labelled on it, and the suggested discard and
 * the winning tiles are drawn as tiles rather than listed.
 *
 * Jargon only ever appears in brackets after the plain word, so players can
 * look it up elsewhere.
 */

export type Tone = "turn" | "win" | "claim" | "wait" | "danger" | "away";

export type Advice = {
  title: string;
  headline: string;
  headlineGood: boolean;
  tips: string[];
  tone: Tone;
  suggest: Tile | null;
  waits: { tile: Tile; left: number }[];
};

const name = (t: Tile | Kind) =>
  tileName(typeof t === "number" ? tileOf(t) : t);

export const readiness = (n: number): { text: string; good: boolean } =>
  n < 0
    ? { text: "Winning hand!", good: true }
    : n === 0
      ? { text: "Ready — one tile from winning", good: true }
      : {
          text: n === 1 ? "1 tile from ready" : `${n} tiles from ready`,
          good: false,
        };

/** Winning tiles for a 13-tile hand, with how many this seat can't see. */
const waitsFor = (s: GameState, seatIndex: number, hand: Tile[]) => {
  const seat = s.seats[seatIndex];
  const left = unseen(visibleTo(s, seatIndex));
  return waits({ concealed: hand, melds: seat.melds }).all.map((k) => ({
    tile: tileOf(k),
    left: left[k],
  }));
};

/** Score of winning on `kind`, for the warnings about yaku and faan. */
const valueOfWait = (
  s: GameState,
  seatIndex: number,
  hand: Tile[],
  kind: Kind,
) => {
  const seat = s.seats[seatIndex];
  const tile = tileOf(kind);
  const base = {
    concealed: [...hand, tile],
    melds: seat.melds,
    winTile: tile,
    tsumo: true,
    seatWind: seatWind(s, seatIndex),
    roundWind: roundWindKind(s),
  };
  if (s.rules === "riichi")
    return scoreRiichi({ ...base, riichi: !!seat.riichi });
  return scoreHongKong({ ...base, flowers: seat.flowers });
};

/** Riichi: an open ready hand with no yaku. Hong Kong: a ready hand under 3 faan. */
const scoreWarning = (
  s: GameState,
  seatIndex: number,
  hand: Tile[],
): string | null => {
  const seat = s.seats[seatIndex];
  const w = waits({ concealed: hand, melds: seat.melds }).all;
  if (!w.length) return null;
  const scores = w.map((k) => valueOfWait(s, seatIndex, hand, k));
  if (s.rules === "riichi") {
    if (seat.melds.some((m) => m.open) && scores.every((x) => !x))
      return "⚠️ This hand **can't win yet**: an open hand needs a scoring pattern (a *yaku*), like a triplet of dragons or your wind, or only 2–8 tiles.";
    return null;
  }
  const best = Math.max(
    ...scores.map((x) => (x && "total" in x ? x.total : 0)),
  );
  return best < HK_MIN_FAAN
    ? `⚠️ This hand would score **${best} of the 3 points** (*faan*) it needs to win. Dragon or wind triplets, one suit, or all triplets would get it there.`
    : null;
};

/** Who's in riichi, and which of your tiles are safe against them. */
const dangerTip = (s: GameState, seatIndex: number): string | null => {
  const seat = s.seats[seatIndex];
  for (const [i, x] of s.seats.entries()) {
    if (i === seatIndex || !x.riichi) continue;
    const theirs = new Set(x.discards.map((d) => kindOf(d.tile)));
    const safe = [
      ...new Set(seat.hand.filter((t) => theirs.has(kindOf(t))).map(kindOf)),
    ];
    return `🚨 **${x.name}** declared riichi — they're one tile from winning. ${
      safe.length
        ? `Safest to throw: ${safe.slice(0, 3).map(name).join(", ")} (they threw those themselves).`
        : "Tiles they've already thrown are the safe ones."
    }`;
  }
  return null;
};

/** Why the suggested tile, in a few words, from where it sits in the picture. */
const reasonFor = (s: GameState, seatIndex: number, tile: Tile): string => {
  const seat = s.seats[seatIndex];
  const g = groupHand(seat.hand, seat.melds);
  // The copy that's least use is the one that goes.
  const holding = g.groups
    .filter((x) => x.type !== "called" && x.tiles.includes(tile))
    .map((x) => x.type);
  const where = ["loose", "partial", "pair", "set"].find((type) =>
    holding.includes(type as never),
  );
  switch (where) {
    case "loose":
      return "it isn't part of any set";
    case "partial":
      return "it's in your weakest half-set";
    default:
      return "it keeps the most ways to finish";
  }
};

export const turnAdvice = (
  s: GameState,
  seatIndex: number,
  hints: boolean,
): Advice => {
  const seat = s.seats[seatIndex];
  const opts = turnOptions(s, seatIndex)!;
  const now = shanten(toCounts(seat.hand), seat.melds.length);
  const base = {
    tone: "turn" as Tone,
    suggest: null,
    waits: [] as Advice["waits"],
  };

  if (opts.tsumo) {
    return {
      ...base,
      tone: "win",
      title: "🎉 You drew your winning tile!",
      headline: "Winning hand!",
      headlineGood: true,
      tips: ["Press **Tsumo** to claim the win."],
    };
  }
  if (seat.riichi) {
    const drawnAt = seat.hand.lastIndexOf(opts.discards[0]);
    return {
      ...base,
      title: "Riichi — throw the tile you drew",
      headline: readiness(0).text,
      headlineGood: true,
      waits: waitsFor(
        s,
        seatIndex,
        seat.hand.filter((_, i) => i !== drawnAt),
      ),
      tips: ["Your hand is locked until someone wins."],
    };
  }

  const tips: string[] = [];
  const move = chooseTurn(s, seatIndex);
  const suggest =
    move.type === "discard" || move.type === "riichi" ? move.tile : null;
  const after = suggest
    ? seat.hand.filter((_, i) => i !== seat.hand.indexOf(suggest))
    : seat.hand;
  const readyAfter = suggest
    ? waits({ concealed: after, melds: seat.melds }).all.length > 0
    : false;

  const danger = dangerTip(s, seatIndex);
  if (danger) tips.push(danger);
  const warning = suggest ? scoreWarning(s, seatIndex, after) : null;
  if (warning) tips.push(warning);
  if (suggest && hints)
    tips.push(
      `💡 Try throwing the **${name(suggest)}** (circled in red): ${reasonFor(s, seatIndex, suggest)}.`,
    );
  if (readyAfter && opts.riichi.length)
    tips.push(
      "✨ That makes your hand **ready**. Press **Riichi** to bet 1,000 points on it for a bigger win — your hand locks after.",
    );
  else if (readyAfter)
    tips.push(
      "✨ That makes your hand **ready** — the tiles that win are shown under your hand.",
    );
  if (opts.nineTerminals)
    tips.push(
      "You may call off this hand for a redeal (**Nine terminals**): you hold 9+ different 1s, 9s and honors.",
    );
  if (seat.kuikae.length && tips.length < 3)
    tips.push(
      `Right after a call you can't throw back ${seat.kuikae.map(name).join(" or ")}.`,
    );

  const r = readiness(now);
  return {
    ...base,
    title: "Your turn — throw away one tile",
    headline: r.text,
    headlineGood: r.good,
    tips: hints ? tips.slice(0, 3) : [],
    suggest: hints ? suggest : null,
    waits: hints && readyAfter ? waitsFor(s, seatIndex, after) : [],
  };
};

export const claimAdvice = (
  s: GameState,
  seatIndex: number,
  hints: boolean,
): Advice => {
  if (s.phase.kind !== "claims") throw new Error("No claim window");
  const o = claimOptions(s, seatIndex)!;
  const tile = s.phase.tile;
  const from = s.seats[s.phase.discarder].name;
  const seat = s.seats[seatIndex];
  const r = readiness(shanten(toCounts(seat.hand), seat.melds.length));
  const base = {
    headline: r.text,
    headlineGood: r.good,
    suggest: null,
    waits: [] as Advice["waits"],
  };
  if (o.ron) {
    return {
      ...base,
      tone: "win",
      title: `🎉 ${from}'s ${name(tile)} wins your hand!`,
      tips: ["Press **Ron** to take it and win."],
    };
  }
  const tips: string[] = [];
  const k = kindOf(tile);
  if (o.pon)
    tips.push(`**Pon** — add it to your two ${name(tile)}s to make a triplet.`);
  if (o.kan)
    tips.push(
      `**Kan** — make four ${name(tile)}s, then draw a replacement tile.`,
    );
  if (o.chi.length) {
    const runs = o.chi.map((pair) =>
      [...pair, tile]
        .map(kindOf)
        .sort((a, b) => a - b)
        .map(numberOf)
        .join("-"),
    );
    tips.push(`**Chi** — finish the run ${runs.join(" or ")}.`);
  }
  if (hints) {
    const value = [
      31,
      32,
      33,
      seatWind(s, seatIndex),
      roundWindKind(s),
    ].includes(k);
    if (o.pon && value)
      tips.push(
        "💡 This is a **value tile**: a triplet of it scores by itself. Usually worth taking!",
      );
    else if (s.rules === "riichi" && seat.melds.every((m) => !m.open))
      tips.push(
        "💡 Taking it puts the set face up and rules out riichi. Not sure? **Pass** is always safe.",
      );
    else
      tips.push(
        "💡 Take it if it finishes a half-set you were building. Otherwise **Pass**.",
      );
  }
  return {
    ...base,
    tone: "claim",
    title: `${from} threw the ${name(tile)} — take it?`,
    tips: tips.slice(0, 4),
  };
};

export const waitingAdvice = (
  s: GameState,
  seatIndex: number,
  hints: boolean,
): Advice => {
  const seat = s.seats[seatIndex];
  const r = readiness(shanten(toCounts(seat.hand), seat.melds.length));
  const who =
    s.phase.kind === "turn" ? s.seats[s.phase.seat].name : "the table";
  const tips: string[] = [];
  const w = waitsFor(s, seatIndex, seat.hand);
  if (w.length && inFuriten(s, seatIndex))
    tips.push(
      "⚠️ You threw away one of your own winning tiles, so you can only win by **drawing** it yourself, not from someone's discard (*furiten*).",
    );
  const danger = dangerTip(s, seatIndex);
  if (danger) tips.push(danger);
  return {
    title: `Waiting for ${who}…`,
    headline: r.text,
    headlineGood: r.good,
    tips: hints ? tips : [],
    tone: "wait",
    suggest: null,
    waits: hints ? w : [],
  };
};

// ---------------------------------------------------------------------------
// After a hand

export type WinSummary = {
  heading: string;
  /** One line per scoring pattern. */
  patterns: string[];
  total: string;
};

export const winSummary = (s: GameState, w: WinDetail): WinSummary => {
  const who = s.seats[w.seat].name;
  const how =
    w.from === null
      ? "drew their own winning tile"
      : `won on ${s.seats[w.from].name}'s discard`;
  const patterns: string[] = [];
  let total = "";
  if (w.riichi) {
    const r = w.riichi;
    for (const y of r.yaku) {
      const info = YAKU[y.id];
      const worth = info.yakuman
        ? y.times === 2
          ? "double yakuman"
          : "yakuman"
        : `${y.han} han`;
      patterns.push(`**${info.name}** · ${worth} — ${info.about}`);
    }
    if (!r.yakuman) {
      const bonus = r.dora + r.red + r.ura;
      if (bonus)
        patterns.push(
          `**Bonus tiles** (*dora*) · ${bonus} han — lucky tiles that add value.`,
        );
    }
    total = r.yakuman
      ? `${r.limit}`
      : `${r.han} han, ${r.fu} fu${r.limit ? ` · ${r.limit}` : ""}`;
  }
  if (w.hongkong) {
    const h = w.hongkong;
    for (const f of h.faan) {
      const info = HK_FAAN[f.id];
      patterns.push(
        `**${info.name}** · ${info.limit ? "limit" : `${f.faan} faan`} — ${info.about}`,
      );
    }
    total = `${h.total} faan${h.limit ? " (limit)" : ""}`;
  }
  return {
    heading: `${who} ${how} — +${w.gained.toLocaleString()}`,
    patterns,
    total,
  };
};

const DRAW_TEXT: Record<string, string> = {
  exhaustive: "The wall ran out with no winner.",
  nineTerminals: "Called off for a redeal: nine different 1s, 9s and honors.",
  fourWinds: "Called off: everyone threw the same wind first.",
  fourRiichi: "Called off: all four players declared riichi.",
  fourKans: "Called off: four kans by different players.",
  tripleRon: "Called off: three players won on the same tile.",
};

export const drawSummary = (
  s: GameState,
  result: Extract<HandResult, { type: "draw" }>,
): string => {
  const lines = [DRAW_TEXT[result.kind]];
  if (result.kind === "exhaustive") {
    if (result.nagashi.length)
      lines.push(
        `${result.nagashi.map((i) => s.seats[i].name).join(", ")} threw only 1s, 9s and honors all hand — that pays like a win (*nagashi mangan*).`,
      );
    else if (s.rules === "riichi")
      lines.push(
        result.tenpai.length && result.tenpai.length < 4
          ? `${result.tenpai.map((i) => s.seats[i].name).join(", ")} ${result.tenpai.length > 1 ? "were" : "was"} ready, so the others pay them.`
          : "No points move.",
      );
  }
  return lines.join("\n");
};

// ---------------------------------------------------------------------------
// How to play, a page at a time

export type GuidePage = {
  title: string;
  body: string;
  picture?: "goal" | "tiles" | "turn" | "calls";
};

export const guidePages = (rules: GameState["rules"]): GuidePage[] => [
  {
    title: "The goal",
    picture: "goal",
    body: [
      "Be the first to finish a hand of **4 sets + 1 pair**.",
      "A **set** is three tiles: a **run** in one suit (like 2-3-4) or a **triplet** (three the same). A **pair** is two the same.",
      "Your hand picture keeps score for you: the **GOAL** boxes fill in as you finish sets.",
    ].join("\n\n"),
  },
  {
    title: "The tiles",
    picture: "tiles",
    body:
      rules === "hongkong"
        ? "Three suits numbered 1–9, plus winds and dragons. Flowers are bonus tiles: they're set aside the moment you draw one, and you get a replacement."
        : "Three suits numbered 1–9, plus winds and dragons (the *honors*). One 5 of each suit is red — it's worth bonus points.",
  },
  {
    title: "Your turn",
    picture: "turn",
    body: [
      "**Draw** a tile (Fini does that for you), then **throw one away**. You always hold 13 between turns.",
      "Your hand picture colours every tile: 🟩 finished set · 🟦 pair · 🟧 half-set (it says what it needs) · ⬜ loose.",
      "Throw loose tiles first. The hint circles a good one in red.",
    ].join("\n\n"),
  },
  {
    title: "Taking someone's tile",
    picture: "calls",
    body: [
      "When someone throws a tile you need, Fini asks if you want it.",
      "**Pon** makes a triplet (from anyone). **Chi** finishes a run (only from the player before you). **Kan** makes four of a kind.",
      "**Ron** wins with their tile. **Tsumo** wins with a tile you drew yourself.",
    ].join("\n\n"),
  },
  rules === "riichi"
    ? {
        title: "Winning needs a pattern",
        body: [
          "In Riichi a finished hand also needs at least one scoring pattern (a **yaku**). Easy ones:",
          "• **Riichi** — once you're one tile from winning without taking anyone's tiles, press Riichi.\n• **All Simples** — only tiles 2–8, no 1s, 9s or honors.\n• **Value triplet** — three dragons, or three of your seat's wind.\n• **Self-draw** — draw your own winning tile without taking anyone's tiles.",
          "Fini warns you if your hand couldn't win.",
        ].join("\n\n"),
      }
    : {
        title: "Winning needs 3 points",
        body: [
          "In Hong Kong a finished hand must be worth at least **3 faan** (points). Common ones:",
          "• Dragon triplet · 1  • Your wind or the round's wind triplet · 1\n• Self-drawn win · 1  • Never took anyone's tile · 1  • No flowers · 1\n• All runs · 1  • All triplets · 3  • One suit + honors · 3  • One suit only · 7",
          "Fini warns you if your hand would come up short.",
        ].join("\n\n"),
      },
  {
    title: "Playing at Fini's table",
    body: [
      "Press **🀄 My hand** on the table to see your tiles. Only you can see that view, and it updates by itself.",
      "Chat pushed the game up? `/mahjong hand` shows your hand again at the bottom, and `/mahjong table` moves the table down.",
      "You have 60 seconds a turn. If you're away for two turns, a bot plays for you until you press **I'm back**.",
      "Bots fill any empty seats. Turn hints on or off with the **Hints** button.",
    ].join("\n\n"),
  },
];
