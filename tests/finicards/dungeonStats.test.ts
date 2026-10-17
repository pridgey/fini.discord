import { describe, expect, it } from "bun:test";
import {
  summariseRun,
  summariseYears,
} from "../../modules/finicards/dungeonStats";

const run = (overrides: Record<string, unknown> = {}): any => ({
  id: "run1",
  user_id: "u1",
  server_id: "s1",
  player_name: "Fen",
  state: "retreated",
  entry_fee: 15,
  created: "2026-11-02 10:00:00.000Z",
  progress: {
    depth: 8,
    fightsWon: 6,
    bossesWon: 1,
    stats: { geldEarned: 90, cardWins: { Deku: 4, Pabu: 2 } },
  },
  reward: { kind: "coin", coin: 22, cards: [{}, {}] },
  ...overrides,
});

describe("finicards dungeon stats", () => {
  it("summarises a finished run from its state and its reward", () => {
    const one = run();
    expect(summariseRun(one, one.reward)).toEqual({
      depth: 8,
      fights_won: 6,
      bosses_won: 1,
      geld_earned: 90,
      coin_paid: 22,
      cards_won: 2,
    });
  });

  it("summarises a run that paid nothing and has no state left to read", () => {
    expect(summariseRun({ progress: null }, { kind: "none" })).toEqual({
      depth: 0,
      fights_won: 0,
      bosses_won: 0,
      geld_earned: 0,
      coin_paid: 0,
      cards_won: 0,
    });
  });

  it("rolls runs up by year, most recent first", () => {
    const years = summariseYears([
      run(),
      run({
        id: "run2",
        state: "failed",
        progress: {
          depth: 12,
          fightsWon: 9,
          bossesWon: 2,
          stats: { geldEarned: 150, cardWins: { Deku: 1 } },
        },
        reward: { kind: "coin", coin: 6 },
      }),
      run({
        id: "run3",
        user_id: "u2",
        player_name: "Storm",
        created: "2027-01-05 10:00:00.000Z",
      }),
    ]);

    expect(years.map((year) => year.year)).toEqual([2027, 2026]);

    const first = years[1];
    expect(first.runs).toBe(2);
    expect(first.endings).toEqual({ retreated: 1, failed: 1 });
    expect(first.deepest).toEqual({ depth: 12, name: "Fen" });
    expect(first.averageDepth).toBe(10);
    expect(first.fightsWon).toBe(15);
    expect(first.bossesWon).toBe(3);
    expect(first.feesPaid).toBe(30);
    expect(first.coinPaid).toBe(28);
    expect(first.cardsWon).toBe(2);
    expect(first.cardWins).toEqual({ Deku: 5, Pabu: 2 });
    expect(first.players).toHaveLength(1);
    expect(first.players[0]).toMatchObject({
      name: "Fen",
      runs: 2,
      deepest: 12,
      coinPaid: 28,
      feesPaid: 30,
    });
  });

  it("trusts a run's stored summary over its working state", () => {
    // The state's shape may have moved on since; the columns are the record.
    const [year] = summariseYears([
      run({
        ended: "2026-11-02 10:20:00.000Z",
        depth: 30,
        fights_won: 25,
        bosses_won: 5,
        geld_earned: 400,
        coin_paid: 80,
        cards_won: 3,
        progress: {},
      }),
    ]);

    expect(year.deepest?.depth).toBe(30);
    expect(year.fightsWon).toBe(25);
    expect(year.coinPaid).toBe(80);
    expect(year.cardsWon).toBe(3);
  });
});
