import type {
  V2DeckRecord,
  V2DungeonRunRecord,
  V2DungeonRunState,
} from "../../types/PocketbaseTablesV2";
import { pb } from "../../utilities/pocketbase";
import { getCardDefinitions, loadLineupByIds } from "./cardStore";
import { loadDeck, unplayableReason } from "./decks";
import { dealHandFromDeck } from "./draw";
import { summariseRun } from "./dungeonStats";
import {
  DUNGEON,
  DungeonRuleError,
  buyOffer,
  chooseDoor,
  createRun,
  enemyCard,
  leaveShop,
  playEvent,
  playFight,
  skipEvent,
  type DungeonState,
  type RoomSource,
} from "./dungeon";
import type { BattleCard } from "./types";

/**
 * Dungeon run lifecycle.
 *
 *   1. The player enters with a deck. A hand is dealt and room 1 is drawn, and
 *      both are shown only after the fee is paid - so there is no draw to fish
 *      for and no room to scout for free.
 *   2. Each click is one move: a card into a fight or an event, something off a
 *      shop's shelf, or a door.
 *   3. The run ends on a lost fight or when the player walks out.
 *
 * Progress lives in the row, not in button ids the way a lineup pick does: a
 * card on cooldown and a purse of geld are worth something, so a stale or
 * replayed button must not be able to move a run. Every button carries the
 * step it was drawn for, and a click for any other step is refused.
 *
 * Finicoin never moves in this file; `dungeonFlow.ts` settles a run so the
 * store stays a pure persistence boundary.
 */

export const V2_DUNGEON_RUN = "v2_dungeon_run";

const filterSafe = (value: string): string =>
  (value ?? "").replace(/["\\]/g, "\\$&");

export const getRun = async (
  runId: string,
): Promise<V2DungeonRunRecord | null> => {
  try {
    return await pb
      .collection<V2DungeonRunRecord>(V2_DUNGEON_RUN)
      .getOne(runId);
  } catch {
    return null;
  }
};

/**
 * A run's state, or null for a row written by the old five-room dungeon.
 *
 * Fields added since a run started are filled in, so a run in flight across a
 * deploy carries on rather than breaking.
 */
export const stateOf = (run: V2DungeonRunRecord): DungeonState | null => {
  const state = run.progress as DungeonState | null;
  if (state?.version !== 2) return null;

  return {
    ...state,
    bossesWon: state.bossesWon ?? 0,
    loot: state.loot ?? [],
    sinceShop: state.sinceShop ?? 0,
    path: state.path ?? [],
    stats: state.stats ?? {
      geldEarned: 0,
      geldSpent: 0,
      eventsPassed: 0,
      cardWins: {},
    },
  };
};

/** The run a player is in the middle of, if any. One at a time per server. */
export const getActiveRun = async (
  userId: string,
  serverId: string,
): Promise<V2DungeonRunRecord | null> => {
  const runs = await pb
    .collection<V2DungeonRunRecord>(V2_DUNGEON_RUN)
    .getFullList({
      filter: `user_id = "${filterSafe(userId)}" && server_id = "${filterSafe(serverId)}" && state = "active"`,
      sort: "-created",
    });

  return runs.find((run) => stateOf(run) !== null) ?? null;
};

/** The hand as dealt, each card with its index. A card sold mid-run drops out. */
export const loadHand = async (
  run: V2DungeonRunRecord,
): Promise<{ card: BattleCard; index: number }[]> => {
  const ids = run.hand ?? [];
  const cards = await loadLineupByIds(ids);
  const byId = new Map(cards.map((card) => [card.instanceId, card]));

  return ids.flatMap((id, index) => {
    const card = byId.get(id);
    return card ? [{ card, index }] : [];
  });
};

/** The pool every enemy is built from. */
const roomSource = async (): Promise<RoomSource> => ({
  pool: (await getCardDefinitions()).map(enemyCard),
});

export type StartRunInput = {
  serverId: string;
  channelId: string;
  userId: string;
  playerName: string;
  deck: V2DeckRecord;
};

export type StartRunOutcome =
  | { ok: true; run: V2DungeonRunRecord }
  | { ok: false; reason: string };

export const startRun = async (
  input: StartRunInput,
): Promise<StartRunOutcome> => {
  const contents = await loadDeck(input.deck, input.serverId);

  const unplayable = unplayableReason(contents);
  if (unplayable) return { ok: false, reason: unplayable };

  if (contents.cards.length < DUNGEON.handSize) {
    return {
      ok: false,
      reason: `**${input.deck.name}** can only field ${contents.cards.length} cards and a dungeon run deals ${DUNGEON.handSize}.${
        contents.missing.length > 0
          ? ` ${contents.missing.length} of its cards are no longer in your collection.`
          : ""
      }`,
    };
  }

  const progress = createRun(await roomSource());

  if (!progress) {
    return {
      ok: false,
      reason:
        "The card pool is empty, so there is nothing to put in the rooms.",
    };
  }

  const run = await pb
    .collection<V2DungeonRunRecord>(V2_DUNGEON_RUN)
    .create({
      user_id: input.userId,
      server_id: input.serverId,
      channel_id: input.channelId,
      player_name: input.playerName,
      deck: input.deck.id ?? "",
      hand: dealHandFromDeck(contents.cards, DUNGEON.handSize),
      progress,
      state: "active",
      entry_fee: DUNGEON.entryFee,
      reward: null,
    });

  return { ok: true, run };
};

/** One click on a run. */
export type DungeonAction =
  /** The card at this index of the dealt hand, into a fight or an event. */
  | { kind: "card"; handIndex: number }
  | { kind: "door"; index: number }
  | { kind: "buy"; index: number }
  /** Leave a shop, or walk past an event. */
  | { kind: "leave" }
  /** Walk out of the dungeon. */
  | { kind: "retreat" };

export type ActionOutcome =
  | { ok: false; reason: string }
  | { ok: true; run: V2DungeonRunRecord };

/**
 * Applies one click to a run.
 *
 * `step` is the step the clicked button was drawn for. It has to be the run's
 * current one, which is what makes a double-click or a button on an old
 * message harmless rather than a second card played.
 */
export const act = async (
  runId: string,
  userId: string,
  step: number,
  action: DungeonAction,
): Promise<ActionOutcome> => {
  const run = await getRun(runId);

  if (!run) return { ok: false, reason: "That run no longer exists." };
  if (run.user_id !== userId) {
    return { ok: false, reason: "This isn't your run." };
  }

  const state = stateOf(run);

  if (run.state !== "active" || !state) {
    return { ok: false, reason: "That run is already over." };
  }
  if (step !== state.step) {
    return {
      ok: false,
      reason: "That button is out of date. Use the newest run message.",
    };
  }

  const save = async (
    progress: DungeonState,
    next: V2DungeonRunState = "active",
  ): Promise<ActionOutcome> => ({
    ok: true,
    run: await pb
      .collection<V2DungeonRunRecord>(V2_DUNGEON_RUN)
      .update(runId, { progress, state: next }),
  });

  try {
    switch (action.kind) {
      case "retreat":
        return await save({ ...state, step: state.step + 1 }, "retreated");

      case "door":
        return await save(chooseDoor(state, action.index));

      case "buy":
        return await save(buyOffer(state, action.index));

      case "leave": {
        const source = await roomSource();
        return await save(
          state.room.kind === "event"
            ? skipEvent(state, source)
            : leaveShop(state, source),
        );
      }

      case "card": {
        const cardId = (run.hand ?? [])[action.handIndex];
        // Re-read at the moment of play, so a card sold mid-run cannot be played.
        const [card] = cardId ? await loadLineupByIds([cardId]) : [];

        if (!card) {
          return {
            ok: false,
            reason: "That card is no longer in your collection. Pick another.",
          };
        }

        const source = await roomSource();

        if (state.room.kind === "event") {
          return await save(playEvent(state, card, source).state);
        }

        const outcome = playFight(state, card, source);
        return await save(
          outcome.state,
          outcome.result === "fell" ? "failed" : "active",
        );
      }
    }
  } catch (error) {
    if (error instanceof DungeonRuleError) {
      return { ok: false, reason: error.message };
    }
    throw error;
  }
};

/**
 * Records what a finished run paid, and with it the run's numbers for the
 * record (`dungeonStats.ts`): a run is summarised once, here, as it is settled.
 */
export const recordReward = async (
  run: V2DungeonRunRecord,
  reward: unknown,
): Promise<V2DungeonRunRecord> =>
  pb.collection<V2DungeonRunRecord>(V2_DUNGEON_RUN).update(run.id ?? "", {
    reward,
    ...summariseRun(run, reward),
    ended: new Date().toISOString(),
  });
