import { pb } from "../../../utilities/pocketbase";
import type { GameState, Rules } from "./game";

/**
 * Mahjong tables in Pocketbase. A table row holds the lobby, the whole game
 * as JSON, and the coin side. Nothing here decides anything; `table.ts` does.
 */

export const MAHJONG_TABLE = "mahjong_table";

export type TableStatus = "lobby" | "playing" | "finished" | "cancelled";

export type TablePlayer = { id: string; name: string };

/** Per-person settings and attendance, by Discord user id. */
export type PlayerPrefs = {
  /** Learning hints in the private hand view. On by default. */
  hints: boolean;
  /** Turns timed out in a row. */
  strikes: number;
  /** A bot is playing this seat until they come back. */
  away: boolean;
};

export type Payout = {
  seat: number;
  name: string;
  userId: string | null;
  rank: number;
  amount: number;
};

export type MahjongTable = {
  id: string;
  server_id: string;
  server_name: string;
  channel_id: string;
  message_id: string;
  host_id: string;
  rules: Rules;
  status: TableStatus;
  buy_in: number;
  players: TablePlayer[];
  game: GameState | null;
  prefs: Record<string, PlayerPrefs>;
  deadline: number;
  payouts: Payout[] | null;
};

export const defaultPrefs = (): PlayerPrefs => ({
  hints: true,
  strikes: 0,
  away: false,
});

export const prefsFor = (t: MahjongTable, userId: string): PlayerPrefs =>
  t.prefs[userId] ?? defaultPrefs();

export const getTable = async (id: string): Promise<MahjongTable | null> => {
  try {
    return await pb.collection<MahjongTable>(MAHJONG_TABLE).getOne(id);
  } catch {
    return null;
  }
};

export const createTable = async (
  fields: Omit<
    MahjongTable,
    "id" | "message_id" | "game" | "deadline" | "payouts" | "prefs" | "status"
  >,
): Promise<MahjongTable> =>
  pb.collection<MahjongTable>(MAHJONG_TABLE).create({
    ...fields,
    status: "lobby",
    message_id: "",
    game: null,
    prefs: {},
    deadline: 0,
    payouts: null,
  });

export const saveTable = async (t: MahjongTable): Promise<void> => {
  await pb.collection<MahjongTable>(MAHJONG_TABLE).update(t.id, {
    message_id: t.message_id,
    status: t.status,
    players: t.players,
    game: t.game,
    prefs: t.prefs,
    deadline: t.deadline,
    payouts: t.payouts,
  });
};

/** Tables still in a lobby or being played, for resuming after a restart. */
export const activeTables = async (): Promise<MahjongTable[]> =>
  pb.collection<MahjongTable>(MAHJONG_TABLE).getFullList({
    filter: 'status = "lobby" || status = "playing"',
  });

/** The active table a person sits at in a server, if any. */
export const tableOf = async (
  serverId: string,
  userId: string,
): Promise<MahjongTable | null> => {
  const tables = await pb.collection<MahjongTable>(MAHJONG_TABLE).getFullList({
    filter: pb.filter(
      'server_id = {:server} && (status = "lobby" || status = "playing")',
      { server: serverId },
    ),
  });
  return tables.find((t) => t.players.some((p) => p.id === userId)) ?? null;
};

// One move at a time per table: button presses and timers queue up here.
const locks = new Map<string, Promise<unknown>>();

export const withTableLock = <T>(
  id: string,
  fn: () => Promise<T>,
): Promise<T> => {
  const prev = locks.get(id) ?? Promise.resolve();
  const next = prev.catch(() => undefined).then(fn);
  locks.set(id, next);
  next
    .finally(() => {
      if (locks.get(id) === next) locks.delete(id);
    })
    .catch(() => undefined);
  return next;
};
