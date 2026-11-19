import { describe, expect, it } from "bun:test";
import { chooseClaim, chooseTurn } from "../../../modules/games/mahjong/bot";
import {
  PAYOUT_SHARES,
  payoutsFor,
  runAutomatic,
  seatPlayers,
  startGame,
  timeoutMove,
} from "../../../modules/games/mahjong/driver";
import {
  newGame,
  nextHand,
  pendingClaims,
  playClaim,
  playTurn,
  type GameState,
} from "../../../modules/games/mahjong/game";
import {
  claimAdvice,
  guidePages,
  turnAdvice,
  waitingAdvice,
  winSummary,
} from "../../../modules/games/mahjong/hints";
import { groupHand } from "../../../modules/games/mahjong/grouping";
import {
  parseTiles,
  sortTiles,
  tileOf,
} from "../../../modules/games/mahjong/tiles";
import type { MahjongTable } from "../../../modules/games/mahjong/store";
import {
  guideView,
  handView,
  tableMessage,
} from "../../../modules/games/mahjong/views";
import { players } from "./wallBuilder";

const humanAt0 = (_s: GameState) => (seat: number) => seat !== 0;

describe("the driver", () => {
  it("seats every human and fills the rest with bots", () => {
    const seats = seatPlayers(
      [
        { id: "a", name: "A" },
        { id: "b", name: "B" },
      ],
      7,
    );
    expect(seats).toHaveLength(4);
    expect(seats.filter((x) => x.bot)).toHaveLength(2);
    expect(seats.map((x) => x.id).sort()).toEqual(["a", "b", "bot0", "bot1"]);
  });

  it("plays bots until the person has a decision", () => {
    let s = runAutomatic(
      newGame("riichi", players(), 9),
      humanAt0(newGame("riichi", players(), 9)),
    );
    for (let i = 0; i < 30 && s.phase.kind !== "handOver"; i++) {
      const p = s.phase;
      if (p.kind === "turn") expect(p.seat).toBe(0);
      else if (p.kind === "claims") expect(pendingClaims(s)).toEqual([0]);
      s =
        p.kind === "turn"
          ? playTurn(s, 0, chooseTurn(s, 0))
          : playClaim(s, 0, chooseClaim(s, 0));
      s = runAutomatic(s, humanAt0(s));
    }
  });

  it("discards for a person in riichi who has nothing to decide", () => {
    const s = newGame("riichi", players(), 9);
    s.seats[0].hand = sortTiles(parseTiles("123m456p789s11z45m9p"));
    s.seats[0].riichi = { double: false, ippatsu: false };
    s.phase = { kind: "turn", seat: 0, drawn: "9p", source: "wall" };
    const after = runAutomatic(s, humanAt0(s));
    // Its first discard was the drawn 9p (the hand then plays itself out).
    expect(after.seats[0].discards[0]?.tile).toBe("9p");
  });

  it("plays a whole game when everyone has left", () => {
    const s = runAutomatic(startGame("riichi", [], 3), () => true);
    expect(s.phase.kind).toBe("gameOver");
  });

  it("on a timeout throws the drawn tile, but never passes up a win", () => {
    const s = newGame("riichi", players(), 9);
    s.seats[0].hand = sortTiles(parseTiles("123m456p789s11z45m9p"));
    s.phase = { kind: "turn", seat: 0, drawn: "9p", source: "wall" };
    const after = timeoutMove(s, 0);
    expect(after.seats[0].discards.at(-1)?.tile).toBe("9p");
    const win = newGame("riichi", players(), 9);
    win.seats[0].hand = sortTiles(parseTiles("123m456p789s11z45m6m"));
    win.phase = { kind: "turn", seat: 0, drawn: "6m", source: "wall" };
    expect(timeoutMove(win, 0).phase.kind).toBe("handOver");
  });

  it("pays out the whole pot by place", () => {
    const s = newGame("riichi", players(), 9);
    s.seats.forEach((x, i) => (x.points = [10000, 40000, 30000, 20000][i]));
    const pays = payoutsFor(s, 10);
    expect(pays.map((p) => [p.seat, p.amount])).toEqual([
      [1, 20],
      [2, 12],
      [3, 6],
      [0, 2],
    ]);
    expect(PAYOUT_SHARES.reduce((a, b) => a + b, 0)).toBeCloseTo(1);
  });
});

describe("hints", () => {
  const ready = () => {
    const s = newGame("riichi", players(), 9);
    s.seats[0].hand = sortTiles(parseTiles("123m456p789s11z45m9p"));
    s.phase = { kind: "turn", seat: 0, drawn: "9p", source: "wall" };
    return s;
  };

  it("suggests the loose tile, says it makes the hand ready, and offers riichi", () => {
    const a = turnAdvice(ready(), 0, true);
    expect(a.title).toContain("Your turn");
    expect(a.suggest).toBe("9p");
    expect(a.headline).toBe("Ready — one tile from winning");
    const text = a.tips.join("\n");
    expect(text).toContain("9 Circles");
    expect(text).toContain("isn't part of any set");
    expect(text).toContain("Riichi");
    expect(a.waits.map((w) => w.tile)).toEqual(["3m", "6m"]);
    expect(a.tips.length).toBeLessThanOrEqual(3);
  });

  it("keeps quiet with hints off, but still says what to do", () => {
    const a = turnAdvice(ready(), 0, false);
    expect(a.title).toContain("Your turn");
    expect(a.tips).toEqual([]);
    expect(a.suggest).toBeNull();
  });

  it("says so plainly when you can win", () => {
    const s = ready();
    s.seats[0].hand = sortTiles(parseTiles("123m456p789s11z456m"));
    s.seats[0].riichi = { double: false, ippatsu: false };
    s.phase = { kind: "turn", seat: 0, drawn: "6m", source: "wall" };
    const a = turnAdvice(s, 0, true);
    expect(a.title).toContain("winning tile");
    expect(a.tone).toBe("win");
  });

  it("warns about furiten while waiting", () => {
    const s = ready();
    s.seats[0].hand = sortTiles(parseTiles("123m456p789s11z45m"));
    s.seats[0].discards = [{ tile: "6m" }];
    s.phase = { kind: "turn", seat: 1, drawn: "1z", source: "wall" };
    const a = waitingAdvice(s, 0, true);
    expect(a.tips.join("\n")).toContain("furiten");
    expect(a.waits.map((w) => w.tile)).toEqual(["3m", "6m"]);
  });

  it("warns that an open hand can't win without a pattern", () => {
    const s = newGame("riichi", players(), 9);
    s.seats[0].hand = sortTiles(parseTiles("123m456p78s9p99m"));
    s.seats[0].melds = [
      { type: "chi", tiles: parseTiles("123s"), open: true, from: 3 },
    ];
    s.phase = { kind: "turn", seat: 0, drawn: "9p", source: "wall" };
    expect(turnAdvice(s, 0, true).tips.join("\n")).toContain("can't win yet");
  });

  it("explains the calls on offer", () => {
    let s = newGame("riichi", players(), 9);
    s.seats[0].hand = sortTiles(parseTiles("147m258p369s1234z5z"));
    s.seats[1].hand = sortTiles(parseTiles("55z123m456p78s99s"));
    s.phase = { kind: "turn", seat: 0, drawn: "5z", source: "wall" };
    s = playTurn(s, 0, { type: "discard", tile: "5z" });
    const a = claimAdvice(s, 1, true);
    expect(a.title).toContain("White Dragon");
    expect(a.tips.join("\n")).toContain("**Pon**");
    expect(a.tips.join("\n")).toContain("value tile");
  });

  it("explains each scoring pattern after a win", () => {
    const s = newGame("riichi", players(), 9);
    s.seats[0].hand = sortTiles(parseTiles("234m567m234p67s55p8s"));
    s.uninterrupted = false;
    s.doraIndicators = parseTiles("1z1z1z1z1z");
    s.phase = { kind: "turn", seat: 0, drawn: "8s", source: "wall" };
    const after = playTurn(s, 0, { type: "tsumo" });
    if (after.phase.kind !== "handOver" || after.phase.result.type !== "win")
      throw new Error();
    const w = winSummary(after, after.phase.result.wins[0]);
    expect(w.heading).toContain("drew their own winning tile");
    expect(w.patterns.join("\n")).toContain("Pinfu");
    expect(w.patterns.join("\n")).toContain("All Simples");
    expect(w.total).toContain("fu");
  });

  it("has a guide for both rulesets, goal first", () => {
    expect(guidePages("riichi")[0].body).toContain("4 sets + 1 pair");
    expect(guidePages("riichi").map((p) => p.title)).toContain(
      "Winning needs a pattern",
    );
    expect(guidePages("hongkong").map((p) => p.title)).toContain(
      "Winning needs 3 points",
    );
  });
});

describe("reading a hand into groups", () => {
  it("finds sets, the pair, half-sets and what they need, and loose tiles", () => {
    const g = groupHand(parseTiles("123m456p11z45s9p7z"), []);
    expect(g.groups.map((x) => x.type)).toEqual([
      "set",
      "set",
      "pair",
      "partial",
      "loose",
    ]);
    const partial = g.groups.find((x) => x.type === "partial");
    expect(partial && "needs" in partial && partial.needs.map(tileOf)).toEqual([
      "3s",
      "6s",
    ]);
    expect([g.done, g.hasPair]).toEqual([2, true]);
  });

  it("counts called sets toward the goal", () => {
    const g = groupHand(parseTiles("123m45p77z"), [
      { type: "pon", tiles: parseTiles("555s"), open: true },
    ]);
    expect(g.done).toBe(2);
    expect(g.groups.at(-1)?.type).toBe("called");
  });

  it("shows seven-pairs hands as pairs", () => {
    const g = groupHand(parseTiles("1133m4466p2288s7z"), []);
    expect(g.mode).toBe("pairs");
    expect(g.done).toBe(6);
  });

  it("keeps every tile, red fives included", () => {
    const hand = parseTiles("123m0p6p7p99s24s7z1z");
    const g = groupHand(hand, []);
    const out = g.groups.flatMap((x) => (x.type === "called" ? [] : x.tiles));
    expect(out.sort()).toEqual([...hand].sort());
  });
});

describe("Discord views stay inside Discord's limits", () => {
  const table = (game: GameState): MahjongTable => ({
    id: "abcdefghijklmno",
    server_id: "1",
    server_name: "x",
    channel_id: "2",
    message_id: "3",
    host_id: "p0",
    rules: game.rules,
    status: "playing",
    buy_in: 5,
    players: [{ id: "p0", name: "P0" }],
    game,
    prefs: {},
    deadline: Date.now() + 60000,
    payouts: null,
  });

  type EmbedData = {
    title?: string;
    description?: string;
    author?: { name: string };
    footer?: { text: string };
    fields?: { name: string; value: string }[];
    image?: { url: string };
  };
  const check = (payload: {
    content: string;
    embeds?: { data: EmbedData }[];
    files?: { name: string }[];
    components: {
      components: { data: { custom_id?: string; label?: string } }[];
    }[];
  }) => {
    expect(payload.content.length).toBeLessThanOrEqual(2000);
    let total = 0;
    for (const { data: e } of payload.embeds ?? []) {
      expect((e.title ?? "").length).toBeLessThanOrEqual(256);
      expect((e.description ?? "").length).toBeLessThanOrEqual(4096);
      expect((e.author?.name ?? "").length).toBeLessThanOrEqual(256);
      expect((e.footer?.text ?? "").length).toBeLessThanOrEqual(2048);
      expect((e.fields ?? []).length).toBeLessThanOrEqual(25);
      for (const f of e.fields ?? []) {
        expect(f.name.length).toBeLessThanOrEqual(256);
        expect(f.value.length).toBeGreaterThan(0);
        expect(f.value.length).toBeLessThanOrEqual(1024);
      }
      total +=
        (e.title ?? "").length +
        (e.description ?? "").length +
        (e.footer?.text ?? "").length +
        (e.fields ?? []).reduce(
          (n, f) => n + f.name.length + f.value.length,
          0,
        );
      // Every embedded picture is one of the attached files.
      if (e.image) {
        const file = e.image.url.replace("attachment://", "");
        expect((payload.files ?? []).map((x) => x.name)).toContain(file);
      }
    }
    expect(total).toBeLessThanOrEqual(6000);
    expect(payload.components.length).toBeLessThanOrEqual(5);
    for (const row of payload.components) {
      expect(row.components.length).toBeLessThanOrEqual(5);
      for (const c of row.components) {
        expect((c.data.custom_id ?? "").length).toBeLessThanOrEqual(100);
        expect((c.data.label ?? "").length).toBeLessThanOrEqual(80);
      }
    }
  };

  for (const rules of ["riichi", "hongkong"] as const) {
    it(`${rules}: every decision a person meets renders a valid view`, async () => {
      let views = 0;
      for (let seed = 1; seed <= 3; seed++) {
        let s = runAutomatic(newGame(rules, players(), seed), (x) => x !== 0);
        for (let i = 0; i < 400 && s.phase.kind !== "gameOver"; i++) {
          if (s.phase.kind === "turn" || s.phase.kind === "claims") {
            if (i % 3 === 0) {
              check((await tableMessage(table(s))) as never);
              check((await handView(table(s), "p0")) as never);
              check(
                (await handView(table(s), "p0", { riichi: true })) as never,
              );
              views++;
            }
            s =
              s.phase.kind === "turn"
                ? playTurn(s, 0, chooseTurn(s, 0))
                : playClaim(s, 0, chooseClaim(s, 0));
          } else {
            check((await tableMessage(table(s))) as never);
            check((await handView(table(s), "p0")) as never);
            if (s.phase.kind === "handOver") s = nextHand(s);
          }
          s = runAutomatic(s, (x) => x !== 0);
        }
        check((await tableMessage(table(s))) as never);
      }
      expect(views).toBeGreaterThan(10);
    }, 240000);
  }

  it("the lobby, a closed table, and the end of a game", async () => {
    const lobby = {
      ...table(newGame("riichi", players(), 1)),
      status: "lobby" as const,
      game: null,
    };
    check((await tableMessage(lobby)) as never);
    check((await tableMessage({ ...lobby, status: "cancelled" })) as never);
    const over = runAutomatic(
      startGame("hongkong", [{ id: "p0", name: "P0" }], 4),
      () => true,
    );
    check(
      (await tableMessage({ ...table(over), status: "finished" })) as never,
    );
  }, 60000);

  it("every page of How to play", async () => {
    for (const rules of ["riichi", "hongkong"] as const) {
      for (let i = 0; i < guidePages(rules).length; i++)
        check((await guideView("abcdefghijklmno", rules, i)) as never);
    }
  }, 60000);
});
