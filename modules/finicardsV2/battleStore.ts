import type { V2BattleRecord } from "../../types/PocketbaseTablesV2";
import { pb } from "../../utilities/pocketbase";
import { resolveMatch } from "./battleEngine";
import { V2_BATTLE, loadLineupByIds } from "./cardStore";
import { RULES } from "./rules";
import type { MatchResult, Side } from "./types";

/**
 * Challenge lifecycle for v2 PvP, on the Stadium match structure:
 *
 *   1. Both players commit an unordered *set* of three cards, blind.
 *   2. Both sets are revealed in full.
 *   3. Both players secretly commit an *order* for their own three.
 *   4. Resolve.
 *
 * Fully asynchronous at every step - nothing waits on a Discord collector, so a
 * battle survives a bot restart. Neither player ever has an information edge:
 * selections are blind, and orders are secret until both are locked in.
 *
 * Finicoin never moves in this file; wagers are settled by the command layer so
 * the store stays a pure persistence boundary.
 */

const filterSafe = (value: string): string =>
  (value ?? "").replace(/["\\]/g, "\\$&");

export type CreateChallengeInput = {
  serverId: string;
  channelId: string;
  challengerId: string;
  challengerName: string;
  defenderId: string;
  defenderName: string;
  /** The unordered three cards the challenger brings. */
  challengerSelection: string[];
  wager?: number;
};

export const createChallenge = async (
  input: CreateChallengeInput,
): Promise<V2BattleRecord> =>
  pb.collection<V2BattleRecord>(V2_BATTLE).create({
    server_id: input.serverId,
    channel_id: input.channelId,
    challenger_id: input.challengerId,
    challenger_name: input.challengerName,
    defender_id: input.defenderId,
    defender_name: input.defenderName,
    challenger_selection: input.challengerSelection,
    defender_selection: [],
    challenger_lineup: [],
    defender_lineup: [],
    state: "awaiting_defender_selection",
    result: null,
    wager: input.wager ?? 0,
  });

export const getBattle = async (
  battleId: string,
): Promise<V2BattleRecord | null> => {
  try {
    return await pb.collection<V2BattleRecord>(V2_BATTLE).getOne(battleId);
  } catch {
    return null;
  }
};

export const declineBattle = async (battleId: string): Promise<void> => {
  await pb
    .collection<V2BattleRecord>(V2_BATTLE)
    .update(battleId, { state: "declined" });
};

/** Which side of a battle a user is on, or null if they aren't in it. */
export const sideForUser = (
  battle: V2BattleRecord,
  userId: string,
): Side | null => {
  if (battle.challenger_id === userId) return "challenger";
  if (battle.defender_id === userId) return "defender";
  return null;
};

export const selectionFor = (
  battle: V2BattleRecord,
  side: Side,
): string[] =>
  side === "challenger"
    ? (battle.challenger_selection ?? [])
    : (battle.defender_selection ?? []);

export const orderFor = (battle: V2BattleRecord, side: Side): string[] =>
  side === "challenger"
    ? (battle.challenger_lineup ?? [])
    : (battle.defender_lineup ?? []);

/* -------------------------------------------------------------------------- */
/* Phase 2 - the defender brings their three cards                            */
/* -------------------------------------------------------------------------- */

export type SelectionOutcome =
  | { ok: true; battle: V2BattleRecord }
  | { ok: false; reason: string };

/**
 * Records the defender's set and moves the battle to the reveal.
 *
 * The defender's cards are never compared against the challenger's before this
 * point, so there is nothing to leak: both selections were made blind.
 */
export const submitDefenderSelection = async (
  battleId: string,
  selection: string[],
): Promise<SelectionOutcome> => {
  const battle = await getBattle(battleId);

  if (!battle) return { ok: false, reason: "That battle no longer exists." };
  if (battle.state !== "awaiting_defender_selection") {
    return {
      ok: false,
      reason: `That battle is already ${battle.state.replace(/_/g, " ")}.`,
    };
  }
  if (selection.length !== RULES.rounds) {
    return {
      ok: false,
      reason: `You need to bring exactly ${RULES.rounds} cards.`,
    };
  }

  const updated = await pb
    .collection<V2BattleRecord>(V2_BATTLE)
    .update(battleId, {
      defender_selection: selection,
      state: "awaiting_orders",
    });

  return { ok: true, battle: updated };
};

/* -------------------------------------------------------------------------- */
/* Phase 3 - both sides secretly order their own three                        */
/* -------------------------------------------------------------------------- */

export type OrderOutcome =
  | { ok: false; reason: string }
  /** Order stored, still waiting on the opponent. */
  | { ok: true; resolved: false; battle: V2BattleRecord; waitingOn: Side }
  /** Both orders in - the match resolved. */
  | {
      ok: true;
      resolved: true;
      battle: V2BattleRecord;
      result: MatchResult;
    };

/** True when `order` is a permutation of `selection` - no smuggling cards in. */
const isPermutationOf = (order: string[], selection: string[]): boolean => {
  if (order.length !== selection.length) return false;
  const remaining = [...selection];
  for (const id of order) {
    const index = remaining.indexOf(id);
    if (index === -1) return false;
    remaining.splice(index, 1);
  }
  return true;
};

/**
 * Stores one side's secret order, and resolves the match once both are in.
 *
 * Re-reads both lineups from the database at resolution time, so a card sold or
 * traded away mid-battle invalidates the match rather than resolving with stale
 * stats. The order is validated as a permutation of that side's own revealed
 * selection, so a player cannot swap in a card they never showed.
 */
export const submitOrder = async (
  battleId: string,
  side: Side,
  order: string[],
): Promise<OrderOutcome> => {
  const battle = await getBattle(battleId);

  if (!battle) return { ok: false, reason: "That battle no longer exists." };
  if (battle.state !== "awaiting_orders") {
    return {
      ok: false,
      reason:
        battle.state === "awaiting_defender_selection"
          ? `${battle.defender_name} hasn't brought their cards yet.`
          : `That battle is already ${battle.state.replace(/_/g, " ")}.`,
    };
  }
  if (orderFor(battle, side).length === RULES.rounds) {
    return { ok: false, reason: "You've already locked in your order." };
  }
  if (!isPermutationOf(order, selectionFor(battle, side))) {
    return {
      ok: false,
      reason: "That order doesn't match the cards you brought.",
    };
  }

  const field = side === "challenger" ? "challenger_lineup" : "defender_lineup";
  let updated = await pb
    .collection<V2BattleRecord>(V2_BATTLE)
    .update(battleId, { [field]: order });

  const challengerOrder = orderFor(updated, "challenger");
  const defenderOrder = orderFor(updated, "defender");

  // Still waiting on the other side.
  if (
    challengerOrder.length !== RULES.rounds ||
    defenderOrder.length !== RULES.rounds
  ) {
    return {
      ok: true,
      resolved: false,
      battle: updated,
      waitingOn: side === "challenger" ? "defender" : "challenger",
    };
  }

  const challengerCards = await loadLineupByIds(challengerOrder);
  const defenderCards = await loadLineupByIds(defenderOrder);

  if (
    challengerCards.length !== RULES.rounds ||
    defenderCards.length !== RULES.rounds
  ) {
    return {
      ok: false,
      reason:
        "One of these cards is no longer owned by the player who brought it, so this battle can't resolve.",
    };
  }

  const result = resolveMatch({
    challengerLineup: challengerCards,
    defenderLineup: defenderCards,
  });

  updated = await pb
    .collection<V2BattleRecord>(V2_BATTLE)
    .update(battleId, { state: "resolved", result });

  return { ok: true, resolved: true, battle: updated, result };
};

/* -------------------------------------------------------------------------- */
/* Queries and housekeeping                                                   */
/* -------------------------------------------------------------------------- */

/** Battles waiting on a given user to do something. */
export const getPendingBattlesForUser = async (
  userId: string,
  serverId: string,
): Promise<V2BattleRecord[]> => {
  const safeUser = filterSafe(userId);
  const safeServer = filterSafe(serverId);

  const open = await pb.collection<V2BattleRecord>(V2_BATTLE).getFullList({
    filter: `server_id = "${safeServer}" && (state = "awaiting_defender_selection" || state = "awaiting_orders") && (challenger_id = "${safeUser}" || defender_id = "${safeUser}")`,
    sort: "-created",
  });

  // Only surface battles where the ball is actually in this user's court.
  return open.filter((battle) => {
    const side = sideForUser(battle, userId);
    if (!side) return false;
    if (battle.state === "awaiting_defender_selection") {
      return side === "defender";
    }
    return orderFor(battle, side).length !== RULES.rounds;
  });
};

/**
 * Battles that have sat unanswered for `hours`, in either waiting state.
 *
 * Finding and expiring are separate calls on purpose: the sweep in
 * `expireBattles.ts` marks a battle expired *before* refunding it, so a crash
 * mid-sweep can at worst drop a refund rather than pay one twice.
 */
export const findStaleBattles = async (
  hours: number,
): Promise<V2BattleRecord[]> => {
  const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000)
    .toISOString()
    .replace("T", " ");

  return pb.collection<V2BattleRecord>(V2_BATTLE).getFullList({
    filter: `(state = "awaiting_defender_selection" || state = "awaiting_orders") && created < "${cutoff}"`,
    sort: "created",
  });
};

export const markBattleExpired = async (battleId: string): Promise<void> => {
  await pb
    .collection<V2BattleRecord>(V2_BATTLE)
    .update(battleId, { state: "expired" });
};

/** Win/loss record for a user, read straight off resolved battles. */
export const getBattleRecordForUser = async (
  userId: string,
  serverId: string,
): Promise<{ wins: number; losses: number; draws: number }> => {
  const safeUser = filterSafe(userId);
  const safeServer = filterSafe(serverId);

  const battles = await pb.collection<V2BattleRecord>(V2_BATTLE).getFullList({
    filter: `state = "resolved" && server_id = "${safeServer}" && (challenger_id = "${safeUser}" || defender_id = "${safeUser}")`,
  });

  let wins = 0;
  let losses = 0;
  let draws = 0;

  for (const battle of battles) {
    const winner = (battle.result as MatchResult | null)?.winner;
    if (!winner) continue;
    if (winner === "draw") {
      draws += 1;
      continue;
    }
    const side = sideForUser(battle, userId);
    if (!side) continue;
    if (winner === side) wins += 1;
    else losses += 1;
  }

  return { wins, losses, draws };
};
