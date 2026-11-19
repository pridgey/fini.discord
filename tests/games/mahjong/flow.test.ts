import { afterAll, describe, expect, it, mock } from "bun:test";

/**
 * The Discord side end to end, with Pocketbase and the bank in memory:
 * open a table, join, start (buy-ins taken), play with buttons, go AFK, and
 * finish (payouts made).
 */

const rows = new Map<string, Record<string, unknown>>();
let nextId = 0;
const collection = {
  getOne: async (id: string) => {
    const r = rows.get(id);
    if (!r) throw new Error("404");
    return structuredClone(r);
  },
  create: async (data: Record<string, unknown>) => {
    const id = `t${String(++nextId).padStart(14, "0")}`;
    rows.set(id, structuredClone({ ...data, id }));
    return structuredClone(rows.get(id)!);
  },
  update: async (id: string, data: Record<string, unknown>) => {
    rows.set(id, structuredClone({ ...rows.get(id)!, ...data }));
    return structuredClone(rows.get(id)!);
  },
  getFullList: async () =>
    [...rows.values()]
      .filter((r) => r.status === "lobby" || r.status === "playing")
      .map((r) => structuredClone(r)),
};
mock.module("../../../utilities/pocketbase", () => ({
  pb: { collection: () => collection, filter: (q: string) => q },
}));

const coinMoves: { to: string; amount: number; from: string }[] = [];
mock.module("../../../modules/finicoin", () => ({
  addCoin: mock(
    async (
      to: string,
      _g: string,
      amount: number,
      _n: string,
      _s: string,
      from: string,
    ) => {
      coinMoves.push({ to, amount, from });
    },
  ),
  getUserBalance: mock(async (user: string) => (user === "broke" ? 1 : 100)),
}));

const {
  handleMahjongButton,
  openTable,
  resumeMahjong,
  stopMahjongTimers,
  expireTable,
  showHand,
  moveTable,
} = await import("../../../modules/games/mahjong/table");
const { turnOptions, claimOptions } =
  await import("../../../modules/games/mahjong/game");

const tableMessage = {
  edits: [] as unknown[],
  edit: mock(async (p: unknown) => void tableMessage.edits.push(p)),
};
const sent: { content?: string; components?: unknown[] }[] = [];
const deleted: string[] = [];
/** Messages from other people posted below the table, as the channel would report them. */
let chatBelow = 0;
let posted = 0;
let replies = 0;
const channel = {
  isTextBased: () => true,
  isDMBased: () => false,
  messages: {
    fetch: async (q: unknown) => {
      if (typeof q === "object" && q && "after" in q) {
        const below = Array.from({ length: chatBelow }, () => ({
          author: { id: "someone" },
        }));
        return {
          filter: (f: (m: { author: { id: string } }) => boolean) => ({
            size: below.filter(f).length,
          }),
        };
      }
      return tableMessage;
    },
    delete: mock(async (id: string) => void deleted.push(id)),
  },
  send: mock(async (p: { content?: string; components?: unknown[] }) => {
    sent.push(p);
    return { id: `posted${++posted}`, delete: async () => undefined };
  }),
};
await resumeMahjong({
  channels: { fetch: async () => channel },
  user: { id: "fini" },
} as never);

type Fake = ReturnType<typeof fake>;
const fake = (userId: string) => {
  const i = {
    user: { id: userId, username: userId, displayName: userId },
    member: { displayName: userId },
    guildId: "g1",
    guild: { name: "Guild" },
    channelId: "c1",
    deferred: false,
    replied: false,
    replies: [] as unknown[],
    reply: mock(async (p: unknown) => {
      i.replied = true;
      i.replies.push(p);
    }),
    deferReply: mock(async () => void (i.deferred = true)),
    deferUpdate: mock(async () => void (i.deferred = true)),
    editReply: mock(async (p: unknown) => {
      i.replies.push(p);
      return { id: `reply${++replies}` };
    }),
    update: mock(async (p: unknown) => void i.replies.push(p)),
    followUp: mock(async (p: unknown) => void i.replies.push(p)),
  };
  return i;
};
const press = async (userId: string, args: string[]): Promise<Fake> => {
  const i = fake(userId);
  await handleMahjongButton(i as never, args);
  return i;
};
const table = () => [...rows.values()].at(-1) as Record<string, any>;
const lastText = (i: Fake) => JSON.stringify(i.replies.at(-1));

afterAll(() => stopMahjongTimers());

describe("a table from lobby to payout", () => {
  it("opens a lobby", async () => {
    const i = fake("alice");
    await openTable(i as never, "riichi", 10);
    expect(table().status).toBe("lobby");
    expect(table().message_id).toMatch(/^reply\d+$/);
    expect(lastText(i)).toContain("Join");
  });

  it("refuses a player who can't cover the buy-in, and seats one who can", async () => {
    const id = table().id;
    expect(lastText(await press("broke", [id, "join", "0"]))).toContain(
      "don't have enough",
    );
    await press("bob", [id, "join", "0"]);
    expect(table().players.map((p: { id: string }) => p.id)).toEqual([
      "alice",
      "bob",
    ]);
    expect(lastText(await press("bob", [id, "start", "0"]))).toContain(
      "Only the host",
    );
  });

  it("starts: takes the buy-ins and deals with bots in the empty seats", async () => {
    const id = table().id;
    await press("alice", [id, "start", "0"]);
    const t = table();
    expect(t.status).toBe("playing");
    expect(coinMoves).toEqual([
      { to: "Reserve", amount: 10, from: "alice" },
      { to: "Reserve", amount: 10, from: "bob" },
    ]);
    expect(t.game.seats.filter((x: { bot: boolean }) => x.bot)).toHaveLength(2);
    expect(tableMessage.edits.length).toBeGreaterThan(0);
    expect(t.deadline).toBeGreaterThan(Date.now());
  });

  it("shows a seated player their hand privately, and refuses strangers", async () => {
    const id = table().id;
    const view = await press("alice", [id, "open", "0"]);
    expect(view.deferReply).toHaveBeenCalled();
    expect(lastText(view)).toContain("you sit");
    expect(lastText(await press("mallory", [id, "open", "0"]))).toContain(
      "aren't playing",
    );
  });

  it("refuses an out-of-date button", async () => {
    const id = table().id;
    const t = table();
    const seat = t.game.phase.seat ?? 0;
    const who = t.game.seats[seat]?.id ?? "alice";
    const i = await press(who, [id, "d", String(t.game.step - 1), "1m"]);
    expect(lastText(i)).toMatch(/out of date|you sit|Waiting/);
  });

  it("plays to the end with buttons, pays out the pot, and never stalls", async () => {
    const id = table().id;
    for (let guard = 0; guard < 2000 && table().status === "playing"; guard++) {
      const t = table();
      const s = t.game;
      const step = String(s.step);
      if (s.phase.kind === "handOver") {
        await press("alice", [id, "next", step]);
        continue;
      }
      if (s.phase.kind === "turn") {
        const seat = s.seats[s.phase.seat];
        expect(seat.bot).toBe(false); // the driver never stops on a bot
        const o = turnOptions(s, s.phase.seat)!;
        if (o.tsumo) await press(seat.id, [id, "t", step]);
        else if (o.riichi.length)
          await press(seat.id, [id, "r", step, o.riichi[0]]);
        else await press(seat.id, [id, "d", step, o.discards[0]]);
        continue;
      }
      if (s.phase.kind === "claims") {
        const pending = Object.keys(s.phase.options)
          .map(Number)
          .filter((n) => !s.phase.responses[n]);
        expect(pending.every((n) => !s.seats[n].bot)).toBe(true);
        const seat = pending[0];
        const o = claimOptions(s, seat)!;
        await press(s.seats[seat].id, [id, "c", step, o.ron ? "ron" : "pass"]);
        continue;
      }
    }
    const t = table();
    expect(t.status).toBe("finished");
    expect(t.payouts).toHaveLength(4);
    expect(
      t.payouts.reduce((n: number, p: { amount: number }) => n + p.amount, 0),
    ).toBeCloseTo(40);
    const paid = coinMoves.filter((m) => m.from === "Reserve");
    const humans = t.payouts.filter((p: { userId: string | null }) => p.userId);
    expect(paid.map((m) => m.to).sort()).toEqual(
      humans.map((p: { userId: string }) => p.userId).sort(),
    );
  }, 240000);
});

describe("timeouts", () => {
  it("auto-plays a missed turn, and after two a bot takes the seat", async () => {
    coinMoves.length = 0;
    const i = fake("carol");
    await openTable(i as never, "hongkong", 0);
    const id = table().id;
    await press("carol", [id, "start", "0"]);
    expect(table().status).toBe("playing");
    // Carol is the only person: the bots wait on her alone.
    let strikes = 0;
    for (let n = 0; n < 6 && table().status === "playing"; n++) {
      const before = table().game.phase.kind;
      await expireTable(id);
      if (before === "turn") strikes++;
      if (table().prefs.carol?.away) break;
    }
    const t = table();
    if (t.status === "playing") {
      expect(t.prefs.carol.away).toBe(true);
      // With everyone on autopilot the game plays itself out.
      expect(t.game.phase.kind).toBe("handOver");
      await press("carol", [id, "back", "0"]);
      expect(table().prefs.carol.away).toBe(false);
    }
    expect(strikes).toBeGreaterThan(0);
    expect(coinMoves).toEqual([]); // no buy-in, no coins
  }, 60000);
});

describe("finding the game after chat buries it", () => {
  /** A fresh solo table for `who`: the bots wait on the one person. */
  const humanTurn = async (who: string) => {
    await openTable(fake(who) as never, "riichi", 0);
    const id = table().id;
    await press(who, [id, "start", "0"]);
    return id;
  };

  it("/mahjong hand shows a seated player their hand, and tells others how to sit", async () => {
    await humanTurn("dana");
    const mine = fake("dana");
    await showHand(mine as never);
    expect(lastText(mine)).toContain("you sit");
    const stranger = fake("erin");
    await showHand(stranger as never);
    expect(lastText(stranger)).toContain("/mahjong open");
  });

  it("/mahjong table posts the table again and deletes the old one", async () => {
    const id = table().id;
    const before = table().message_id;
    const i = fake("dana");
    await moveTable(i as never);
    expect(table().id).toBe(id);
    expect(table().message_id).not.toBe(before);
    expect(deleted).toContain(before);
    // Straight away again: refused, so it can't be spammed.
    const again = fake("dana");
    await moveTable(again as never);
    expect(lastText(again)).toContain("just moved");
  });

  it("moves the table down by itself when chat has buried it and a person must act", async () => {
    const id = await humanTurn("fay");
    const play = async () => {
      const s = table().game;
      if (s.phase.kind === "turn") {
        const o = turnOptions(s, s.phase.seat)!;
        await press("fay", [id, "d", String(s.step), o.discards[0]]);
      } else if (s.phase.kind === "claims")
        await press("fay", [id, "c", String(s.step), "pass"]);
      else await press("fay", [id, "next", String(s.step)]);
    };
    // Quiet channel: the message is edited in place.
    chatBelow = 0;
    let before = table().message_id;
    await play();
    expect(table().message_id).toBe(before);
    // Busy channel: three people talked below it, so it moves down.
    chatBelow = 3;
    before = table().message_id;
    await play();
    if (
      table().status === "playing" &&
      ["turn", "claims"].includes(table().game.phase.kind)
    ) {
      expect(table().message_id).not.toBe(before);
      expect(deleted).toContain(before);
    }
    chatBelow = 0;
  }, 60000);

  it("puts a My hand button on the turn ping", () => {
    const ping = sent.find((p) =>
      /your turn|claim a tile/.test(p.content ?? ""),
    );
    expect(ping).toBeDefined();
    expect(JSON.stringify(ping!.components)).toContain(":open:");
  });
});
