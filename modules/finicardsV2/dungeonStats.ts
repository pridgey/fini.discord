import type { V2DungeonRunRecord } from "../../types/PocketbaseTablesV2";

/**
 * Dungeon runs, looked back on.
 *
 * Every run is kept after it ends, so the history is all there. This turns it
 * into the numbers worth reading: one summary per finished run, written to
 * the run's own columns when it is settled, and a roll-up of many runs by
 * year for the review.
 *
 * A run settled before the summary columns existed has none; its numbers are
 * read out of its `progress` and `reward` json instead, as far as they go.
 */

/** A finished run's numbers, as stored on its row. */
export type RunSummary = {
  depth: number;
  fights_won: number;
  bosses_won: number;
  geld_earned: number;
  coin_paid: number;
  cards_won: number;
};

type Stored = Partial<RunSummary> & { ended?: string };

const count = (value: unknown): number =>
  typeof value === "number" && Number.isFinite(value) ? value : 0;

/** A run's numbers from its working state and what it was paid. */
export const summariseRun = (
  run: Pick<V2DungeonRunRecord, "progress">,
  reward: unknown,
): RunSummary => {
  const progress = (run.progress ?? {}) as Record<string, any>;
  const paid = (reward ?? {}) as Record<string, any>;

  return {
    depth: count(progress.depth),
    fights_won: count(progress.fightsWon),
    bosses_won: count(progress.bossesWon),
    geld_earned: count(progress.stats?.geldEarned),
    coin_paid: count(paid.coin ?? paid.amount),
    cards_won: Array.isArray(paid.cards) ? paid.cards.length : 0,
  };
};

/** The stored summary where there is one, else read from the run itself. */
const summaryOf = (run: V2DungeonRunRecord & Stored): RunSummary =>
  run.ended
    ? {
        depth: count(run.depth),
        fights_won: count(run.fights_won),
        bosses_won: count(run.bosses_won),
        geld_earned: count(run.geld_earned),
        coin_paid: count(run.coin_paid),
        cards_won: count(run.cards_won),
      }
    : summariseRun(run, run.reward);

export type PlayerYear = {
  userId: string;
  name: string;
  runs: number;
  deepest: number;
  fightsWon: number;
  bossesWon: number;
  coinPaid: number;
  feesPaid: number;
};

export type DungeonYear = {
  year: number;
  runs: number;
  /** How runs ended, by state. A run still in flight counts as "active". */
  endings: Record<string, number>;
  players: PlayerYear[];
  deepest: { depth: number; name: string } | null;
  averageDepth: number;
  fightsWon: number;
  bossesWon: number;
  geldEarned: number;
  /** Finicoin taken in entry fees, and paid back out. */
  feesPaid: number;
  coinPaid: number;
  cardsWon: number;
  /** Fights won by each card, across every run. Named cards only. */
  cardWins: Record<string, number>;
};

/** Rolls runs up by the year they were started in, most recent year first. */
export const summariseYears = (
  runs: (V2DungeonRunRecord & Stored)[],
): DungeonYear[] => {
  const years = new Map<number, DungeonYear>();
  const players = new Map<string, PlayerYear>();

  for (const run of runs) {
    const year = new Date(run.created ?? "").getUTCFullYear();
    if (!Number.isFinite(year)) continue;

    const total =
      years.get(year) ??
      ({
        year,
        runs: 0,
        endings: {},
        players: [],
        deepest: null,
        averageDepth: 0,
        fightsWon: 0,
        bossesWon: 0,
        geldEarned: 0,
        feesPaid: 0,
        coinPaid: 0,
        cardsWon: 0,
        cardWins: {},
      } satisfies DungeonYear);
    years.set(year, total);

    const summary = summaryOf(run);
    const fee = count(run.entry_fee);

    total.runs += 1;
    total.endings[run.state] = (total.endings[run.state] ?? 0) + 1;
    // Held as a running sum until every run is in.
    total.averageDepth += summary.depth;
    total.fightsWon += summary.fights_won;
    total.bossesWon += summary.bosses_won;
    total.geldEarned += summary.geld_earned;
    total.feesPaid += fee;
    total.coinPaid += summary.coin_paid;
    total.cardsWon += summary.cards_won;
    if (!total.deepest || summary.depth > total.deepest.depth) {
      total.deepest = { depth: summary.depth, name: run.player_name };
    }

    const wins = ((run.progress ?? {}) as Record<string, any>).stats?.cardWins ?? {};
    for (const [card, won] of Object.entries(wins)) {
      total.cardWins[card] = (total.cardWins[card] ?? 0) + count(won);
    }

    const key = `${year}:${run.user_id}`;
    const player =
      players.get(key) ??
      ({
        userId: run.user_id,
        name: run.player_name,
        runs: 0,
        deepest: 0,
        fightsWon: 0,
        bossesWon: 0,
        coinPaid: 0,
        feesPaid: 0,
      } satisfies PlayerYear);
    if (!players.has(key)) {
      players.set(key, player);
      total.players.push(player);
    }
    player.runs += 1;
    player.deepest = Math.max(player.deepest, summary.depth);
    player.fightsWon += summary.fights_won;
    player.bossesWon += summary.bosses_won;
    player.coinPaid += summary.coin_paid;
    player.feesPaid += fee;
  }

  for (const total of years.values()) {
    total.averageDepth = total.runs > 0 ? total.averageDepth / total.runs : 0;
    total.players.sort((a, b) => b.deepest - a.deepest || b.fightsWon - a.fightsWon);
  }

  return [...years.values()].sort((a, b) => b.year - a.year);
};
