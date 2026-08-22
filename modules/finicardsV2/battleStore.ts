import type { V2BattleRecord, V2DeckRecord } from "../../types/PocketbaseTablesV2";
import { pb } from "../../utilities/pocketbase";
import { resolveMatch } from "./battleEngine";
import { V2_BATTLE, loadLineupByIds } from "./cardStore";
import { loadDeck } from "./decks";
import {
  HAND_SIZE,
  clampHandSize,
  dealHandFromDeck,
  isLegalLineup,
} from "./draw";
import { RULES } from "./rules";
import type { MatchResult, Side } from "./types";

/**
 * Challenge lifecycle for v2 PvP.
 *
 *   1. Challenger picks a deck. Five cards are dealt from it, face down.
 *   2. Defender accepts with a deck of their own and is dealt five.
 *   3. Both hands are revealed in full.
 *   4. Each player privately picks three of their five, in slot order.
 *   5. The second lineup in resolves the match.
 *
 * Nobody sees their own hand until both are dealt. That is deliberate: if the
 * challenger saw their five first they could cancel and re-issue until they liked
 * the draw, and a fishable draw is worse than no draw at all.
 *
 * Every step is asynchronous - nothing waits on a Discord collector, so a battle
 * survives a bot restart and the two players never need to be online together.
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
  /** The deck the challenger is bringing. */
  deck: V2DeckRecord;
  wager?: number;
  /** Cards dealt to each side. Defaults to `HAND_SIZE`. */
  handSize?: number;
};

export type CreateChallengeOutcome =
  | { ok: true; battle: V2BattleRecord }
  | { ok: false; reason: string };

export const createChallenge = async (
  input: CreateChallengeInput,
): Promise<CreateChallengeOutcome> => {
  const handSize = clampHandSize(input.handSize);
  const contents = await loadDeck(input.deck, input.serverId);

  if (contents.cards.length < handSize) {
    return {
      ok: false,
      reason: `**${input.deck.name}** can only field ${contents.cards.length} cards and this battle deals ${handSize}.${
        contents.missing.length > 0
          ? ` ${contents.missing.length} of its cards are no longer in your collection.`
          : ""
      }`,
    };
  }

  const battle = await pb.collection<V2BattleRecord>(V2_BATTLE).create({
    server_id: input.serverId,
    channel_id: input.channelId,
    challenger_id: input.challengerId,
    challenger_name: input.challengerName,
    defender_id: input.defenderId,
    defender_name: input.defenderName,
    challenger_deck: input.deck.id ?? "",
    defender_deck: "",
    challenger_hand: dealHandFromDeck(contents.cards, handSize),
    defender_hand: [],
    hand_size: handSize,
    challenger_lineup: [],
    defender_lineup: [],
    state: "awaiting_defender",
    result: null,
    wager: input.wager ?? 0,
  });

  return { ok: true, battle };
};

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

/** The draw size a battle was created with, falling back for older rows. */
export const handSizeOf = (battle: V2BattleRecord): number =>
  clampHandSize(battle.hand_size || HAND_SIZE);

export const handFor = (battle: V2BattleRecord, side: Side): string[] =>
  side === "challenger"
    ? (battle.challenger_hand ?? [])
    : (battle.defender_hand ?? []);

export const lineupFor = (battle: V2BattleRecord, side: Side): string[] =>
  side === "challenger"
    ? (battle.challenger_lineup ?? [])
    : (battle.defender_lineup ?? []);

/* -------------------------------------------------------------------------- */
/* Phase 2 - the defender accepts with a deck, and both hands are dealt        */
/* -------------------------------------------------------------------------- */

export type AcceptOutcome =
  | { ok: true; battle: V2BattleRecord }
  | { ok: false; reason: string };

export const acceptChallenge = async (
  battleId: string,
  deck: V2DeckRecord,
): Promise<AcceptOutcome> => {
  const battle = await getBattle(battleId);

  if (!battle) return { ok: false, reason: "That battle no longer exists." };
  if (battle.state !== "awaiting_defender") {
    return {
      ok: false,
      reason: `That battle is already ${battle.state.replace(/_/g, " ")}.`,
    };
  }

  /* The challenger's draw size governs, so both hands match even if the default
     changed after the challenge was issued. */
  const handSize = handSizeOf(battle);
  const contents = await loadDeck(deck, battle.server_id);

  if (contents.cards.length < handSize) {
    return {
      ok: false,
      reason: `**${deck.name}** can only field ${contents.cards.length} cards and this battle deals ${handSize}.`,
    };
  }

  const updated = await pb
    .collection<V2BattleRecord>(V2_BATTLE)
    .update(battleId, {
      defender_deck: deck.id ?? "",
      defender_hand: dealHandFromDeck(contents.cards, handSize),
      state: "awaiting_lineups",
    });

  return { ok: true, battle: updated };
};

/* -------------------------------------------------------------------------- */
/* Phase 3 - each side privately picks three of their five, in order           */
/* -------------------------------------------------------------------------- */

export type LineupOutcome =
  | { ok: false; reason: string }
  /** Lineup stored, still waiting on the opponent. */
  | { ok: true; resolved: false; battle: V2BattleRecord; waitingOn: Side }
  /** Both lineups in - the match resolved. */
  | { ok: true; resolved: true; battle: V2BattleRecord; result: MatchResult };

/**
 * Stores one side's lineup, and resolves the match once both are in.
 *
 * The lineup is checked against that side's dealt hand, so a player can only
 * play cards they were actually dealt. Both lineups are re-read from the
 * database at resolution time, so a card sold mid-battle invalidates the match
 * rather than resolving with stale stats.
 */
export const submitLineup = async (
  battleId: string,
  side: Side,
  lineup: string[],
): Promise<LineupOutcome> => {
  const battle = await getBattle(battleId);

  if (!battle) return { ok: false, reason: "That battle no longer exists." };
  if (battle.state !== "awaiting_lineups") {
    return {
      ok: false,
      reason:
        battle.state === "awaiting_defender"
          ? `${battle.defender_name} hasn't accepted yet.`
          : `That battle is already ${battle.state.replace(/_/g, " ")}.`,
    };
  }
  if (lineupFor(battle, side).length === RULES.rounds) {
    return { ok: false, reason: "You've already locked in your lineup." };
  }
  if (!isLegalLineup(lineup, handFor(battle, side), RULES.rounds)) {
    return {
      ok: false,
      reason: `Pick ${RULES.rounds} different cards from your own hand.`,
    };
  }

  const field = side === "challenger" ? "challenger_lineup" : "defender_lineup";
  let updated = await pb
    .collection<V2BattleRecord>(V2_BATTLE)
    .update(battleId, { [field]: lineup });

  const challengerLineup = lineupFor(updated, "challenger");
  const defenderLineup = lineupFor(updated, "defender");

  if (
    challengerLineup.length !== RULES.rounds ||
    defenderLineup.length !== RULES.rounds
  ) {
    return {
      ok: true,
      resolved: false,
      battle: updated,
      waitingOn: side === "challenger" ? "defender" : "challenger",
    };
  }

  const challengerCards = await loadLineupByIds(challengerLineup);
  const defenderCards = await loadLineupByIds(defenderLineup);

  if (
    challengerCards.length !== RULES.rounds ||
    defenderCards.length !== RULES.rounds
  ) {
    return {
      ok: false,
      reason:
        "One of these cards is no longer owned by the player who played it, so this battle can't resolve.",
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
    filter: `server_id = "${safeServer}" && (state = "awaiting_defender" || state = "awaiting_lineups") && (challenger_id = "${safeUser}" || defender_id = "${safeUser}")`,
    sort: "-created",
  });

  // Only surface battles where the ball is actually in this user's court.
  return open.filter((battle) => {
    const side = sideForUser(battle, userId);
    if (!side) return false;
    if (battle.state === "awaiting_defender") return side === "defender";
    return lineupFor(battle, side).length !== RULES.rounds;
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
    filter: `(state = "awaiting_defender" || state = "awaiting_lineups") && created < "${cutoff}"`,
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
